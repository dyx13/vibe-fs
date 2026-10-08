import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { captureOrdinaryVerificationFiles } from './verification-ordinary-files.mjs'

function failure(code, message) {
  return Object.assign(new Error(message), { code })
}

function git(root, args, input, stdout = 'pipe') {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
  return execFileSync('git', ['--no-replace-objects', '-C', root, ...args], {
    input,
    stdio: ['pipe', stdout, 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
    env: { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_LAZY_FETCH: '1' },
  })
}

function quotedPath(filePath) {
  return '"' + [...Buffer.from(filePath)].map(byte => '\\' + byte.toString(8).padStart(3, '0')).join('') + '"'
}

function gitConfig(root, args) {
  try {
    return git(root, ['config', ...args]).toString()
  } catch (error) {
    if (error.status === 1) return ''
    throw error
  }
}

export function prepareGitSourceCandidate({ repositoryRoot, treeId, parentDirectory }) {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(treeId)) {
    throw failure('source-candidate-tree-invalid', 'Source candidate requires an explicit Git tree object ID')
  }
  const partialClone = gitConfig(repositoryRoot, ['--get', 'extensions.partialclone'])
  const promises = gitConfig(repositoryRoot, ['--bool', '--get-regexp', String.raw`^remote\..*\.promisor$`])
  if (partialClone || promises.split('\n').some(line => line.endsWith(' true'))) {
    throw failure('source-candidate-promisor-unsupported', 'Source preparation requires locally complete Git objects without implicit fetching')
  }
  if (git(repositoryRoot, ['cat-file', '-t', treeId]).toString().trim() !== 'tree') {
    throw failure('source-candidate-tree-invalid', `Selected object is not a tree: ${treeId}`)
  }
  const objectFormat = git(repositoryRoot, ['rev-parse', '--show-object-format']).toString().trim()
  if (!['sha1', 'sha256'].includes(objectFormat)) {
    throw failure('source-candidate-tree-invalid', `Unsupported Git object format: ${objectFormat}`)
  }
  const entries = git(repositoryRoot, ['ls-tree', '-r', '-z', '--full-tree', treeId])
    .toString('utf8').split('\0').filter(Boolean).map(record => {
      const separator = record.indexOf('\t')
      const [mode, type, blobId] = record.slice(0, separator).split(' ')
      const relativePath = record.slice(separator + 1)
      if (!['100644', '100755'].includes(mode) || type !== 'blob') {
        throw failure('source-candidate-entry-unsupported', `Unsupported source entry ${mode}: ${relativePath}`)
      }
      const segments = relativePath.split('/')
      if (separator < 0 || segments.some(segment => !segment || segment === '.' || segment === '..' || segment.toLowerCase() === '.git' || segment.includes('\\'))) {
        throw failure('source-candidate-path-invalid', `Unsupported source path: ${relativePath}`)
      }
      return { path: relativePath, mode, blobId }
    })
  const blobIds = [...new Set(entries.map(entry => entry.blobId))]
  const invalidEntry = message => failure('source-candidate-entry-invalid', message)
  const parentRoot = fs.realpathSync(parentDirectory)
  const parentIdentity = fs.lstatSync(parentRoot, { bigint: true })
  if (!parentIdentity.isDirectory()) throw invalidEntry('Cannot verify owned identity of the source parent')
  const sourceRoot = fs.mkdtempSync(path.join(parentRoot, 'verification-source-'))
  const rootIdentity = fs.lstatSync(sourceRoot, { bigint: true })
  function assertOwnedRoot(allowMissing = false) {
    for (const [directory, identity] of [[parentRoot, parentIdentity], [sourceRoot, rootIdentity]]) {
      let current
      try {
        current = fs.lstatSync(directory, { bigint: true })
      } catch (cause) {
        if (allowMissing && directory === sourceRoot && cause.code === 'ENOENT') return false
        throw Object.assign(invalidEntry(`Cannot verify owned identity of the source directory: ${directory}`), { cause })
      }
      if (!current.isDirectory() || current.dev !== identity.dev || current.ino !== identity.ino) throw invalidEntry(`Cannot verify owned identity of the source directory: ${directory}`)
    }
    return true
  }
  function dispose() {
    if (assertOwnedRoot(true)) fs.rmSync(sourceRoot, { recursive: true, force: true })
  }
  try {
    assertOwnedRoot()
    git(sourceRoot, ['init', '--quiet', `--object-format=${objectFormat}`, '--template='])
    const batchPath = path.join(sourceRoot, '.git', 'selected-blobs')
    const batchFd = fs.openSync(batchPath, 'wx', 0o600)
    try {
      git(repositoryRoot, ['cat-file', '--batch'], blobIds.join('\n') + (blobIds.length ? '\n' : ''), batchFd)
    } catch (error) {
      try {
        fs.closeSync(batchFd)
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Git batch and output close failed', { cause: error })
      }
      throw error
    }
    fs.closeSync(batchFd)
    assertOwnedRoot()
    const batch = fs.readFileSync(batchPath)
    fs.unlinkSync(batchPath)
    const blobs = new Map()
    let offset = 0
    for (const blobId of blobIds) {
      const end = batch.indexOf(10, offset)
      const header = batch.subarray(offset, end).toString()
      const [actualId, type, sizeText] = header.split(' ')
      const size = Number(sizeText)
      offset = end + 1
      if (end < 0 || actualId !== blobId || type !== 'blob' || !/^\d+$/.test(sizeText) || !Number.isSafeInteger(size) || offset + size >= batch.length || batch[offset + size] !== 10) {
        throw failure('source-candidate-blob-invalid', `Invalid selected blob: ${header}`)
      }
      const bytes = batch.subarray(offset, offset + size)
      const actualHash = createHash(objectFormat).update(`blob ${size}\0`).update(bytes).digest('hex')
      if (actualHash !== blobId) throw failure('source-candidate-blob-invalid', `Selected blob hash mismatch: ${blobId}`)
      blobs.set(blobId, bytes)
      offset += size + 1
    }
    if (offset !== batch.length) throw failure('source-candidate-blob-invalid', 'Unexpected trailing blob data')
    for (const entry of entries) {
      const destination = path.join(sourceRoot, entry.path)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      const bytes = blobs.get(entry.blobId)
      fs.writeFileSync(destination, bytes, { flag: 'wx', mode: entry.mode === '100755' ? 0o755 : 0o644 })
      fs.chmodSync(destination, entry.mode === '100755' ? 0o755 : 0o644)
      entry.size = bytes.length
      entry.sha256 = createHash('sha256').update(bytes).digest('hex')
    }
    if (entries.length) {
      const materializedIds = git(sourceRoot, ['hash-object', '-w', '--no-filters', '--stdin-paths'],
        entries.map(entry => quotedPath(path.join(sourceRoot, entry.path))).join('\n') + '\n').toString().trim().split('\n')
      if (materializedIds.length !== entries.length || entries.some((entry, index) => entry.blobId !== materializedIds[index])) {
        throw failure('source-candidate-blob-invalid', 'Materialized source bytes differ from the selected tree')
      }
      git(sourceRoot, ['update-index', '-z', '--index-info'],
        entries.map(entry => `${entry.mode} ${entry.blobId}\t${entry.path}\0`).join(''))
    }
    if (git(sourceRoot, ['write-tree']).toString().trim() !== treeId) {
      throw failure('source-candidate-tree-invalid', 'Materialized source inventory differs from the selected tree')
    }
    const sourceDigest = createHash('sha256').update(JSON.stringify({ objectFormat, treeId, entries })).digest('hex')
    const selection = { sourceRoot, treeId, objectFormat, entries, sourceDigest }
    const capturedSelection = JSON.stringify(selection)
    assertOwnedRoot()
    const capturedInventory = JSON.stringify(captureOrdinaryVerificationFiles(sourceRoot, invalidEntry))
    const prepared = {
      ...selection,
      revalidate() {
        assertOwnedRoot()
        const actual = Object.fromEntries(Object.keys(selection).map(key => [key, prepared[key]]))
        if (JSON.stringify(actual) !== capturedSelection || JSON.stringify(captureOrdinaryVerificationFiles(sourceRoot, invalidEntry)) !== capturedInventory) throw invalidEntry('Prepared source receipt or complete input inventory changed')
        assertOwnedRoot()
      },
      dispose,
    }
    assertOwnedRoot()
    return prepared
  } catch (error) {
    try {
      dispose()
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Source preparation and cleanup failed', { cause: error })
    }
    throw error
  }
}
