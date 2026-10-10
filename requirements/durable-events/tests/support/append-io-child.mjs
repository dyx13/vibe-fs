import assert from 'node:assert/strict'
import fs from 'node:fs'
import promises from 'node:fs/promises'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const [mode, commonDir, writerId, requestJson] = process.argv.slice(2)
const request = JSON.parse(requestJson)
const eventsDir = path.join(commonDir, 'wanxiangshu', 'events')
const writerFile = path.join(eventsDir, `${writerId}.ndjson`)
const originalRead = fs.readFileSync
const originalMkdir = fs.mkdirSync
const originalWrite = fs.writeFileSync
const originalRemove = fs.rmSync
const descriptors = new Map()
const originals = []
let records = null

function actualPath(value) {
  if (typeof value === 'number') return descriptors.get(value) ?? null
  if (value instanceof URL) return path.resolve(fileURLToPath(value))
  if (Buffer.isBuffer(value)) return path.resolve(value.toString())
  return typeof value === 'string' ? path.resolve(value) : null
}

const readMethods = new Set(['readFile', 'read', 'readv', 'createReadStream'])
const writeMethods = new Set(['writeFile', 'appendFile', 'write', 'writev', 'truncate', 'ftruncate', 'createWriteStream'])

function begin(method, args) {
  if (records === null) return null
  const name = method.replace('promises.', '').replace(/Sync$/, '')
  const paths = [actualPath(args[0])]
  if (['rename', 'link', 'symlink', 'copyFile', 'cp'].includes(name)) paths.push(actualPath(args[1]))
  const kind = readMethods.has(name) ? 'read' : writeMethods.has(name) ? 'write' : 'metadata'
  const record = { method, paths, kind, success: false, bytes: null }
  if (name === 'open') record.flags = args[1]
  if (kind !== 'metadata' && paths[0] === null) record.unattributed = 'unknown content path or fd'
  if (method === 'promises.open') record.unattributed = 'file-handle content I/O is outside this recorder'
  records.push(record)
  return record
}

function dataBytes(value, encoding = 'utf8') {
  if (typeof value === 'string') return Buffer.byteLength(value, encoding)
  if (ArrayBuffer.isView(value)) return value.byteLength
  return null
}

function finish(record, name, args, result) {
  if ((name === 'openSync' || name === 'open') && Number.isInteger(result)) descriptors.set(result, actualPath(args[0]))
  if (name === 'closeSync' || name === 'close') descriptors.delete(args[0])
  if (record === null) return
  record.success = true
  const operation = name.replace(/Sync$/, '')
  if (operation === 'readFile') {
    const encoding = typeof args[1] === 'string' ? args[1] : args[1]?.encoding
    record.bytes = typeof result === 'string'
      ? Buffer.from(result, encoding ?? 'utf8').byteLength : dataBytes(result)
  } else if (operation === 'read' || operation === 'readv' || operation === 'write' || operation === 'writev') {
    record.bytes = typeof result === 'number' ? result : result?.bytesRead ?? result?.bytesWritten ?? null
  } else if (operation === 'appendFile' || operation === 'writeFile') {
    const encoding = typeof args[2] === 'string' ? args[2] : args[2]?.encoding
    record.bytes = dataBytes(args[1], encoding ?? 'utf8')
  }
  if (record.kind !== 'metadata' && record.bytes === null) record.unattributed = 'content byte result is not observed'
}

function failed(record, error) {
  if (record !== null) record.errorCode = error?.code ?? null
}

function install(target, names, prefix = '', asynchronous = false) {
  for (const name of names) {
    const original = target[name]
    assert.equal(typeof original, 'function', `native method ${prefix}${name} exists`)
    originals.push([target, name, original])
    target[name] = function (...args) {
      const record = begin(`${prefix}${name}`, args)
      if (asynchronous === 'callback' && typeof args.at(-1) === 'function') {
        const callback = args.at(-1)
        args[args.length - 1] = function (error, ...values) {
          if (error) failed(record, error)
          else finish(record, name, args, values[0])
          return Reflect.apply(callback, this, [error, ...values])
        }
      }
      try {
        const result = Reflect.apply(original, this, args)
        if (asynchronous === true) {
          void result.then(value => finish(record, name, args, value), error => failed(record, error))
        } else if (asynchronous !== 'callback') {
          finish(record, name, args, result)
        }
        return result
      } catch (error) {
        failed(record, error)
        throw error
      }
    }
  }
}

function startRecording() {
  install(fs, [
    'readFileSync', 'readSync', 'readvSync', 'openSync', 'closeSync', 'writeFileSync',
    'appendFileSync', 'writeSync', 'writevSync', 'fsyncSync', 'fdatasyncSync', 'statSync',
    'lstatSync', 'fstatSync', 'readdirSync', 'existsSync', 'accessSync', 'mkdirSync',
    'rmSync', 'rmdirSync', 'unlinkSync', 'renameSync', 'linkSync', 'symlinkSync',
    'readlinkSync', 'truncateSync', 'ftruncateSync', 'utimesSync', 'copyFileSync', 'cpSync',
  ])
  install(fs, [
    'readFile', 'read', 'readv', 'open', 'close', 'writeFile', 'appendFile', 'write',
    'writev', 'fsync', 'fdatasync', 'stat', 'lstat', 'fstat', 'readdir', 'access',
    'mkdir', 'rm', 'rmdir', 'unlink', 'rename', 'link', 'symlink', 'readlink',
    'truncate', 'ftruncate', 'utimes', 'copyFile', 'cp',
  ], '', 'callback')
  install(fs, ['createReadStream', 'createWriteStream'])
  install(promises, [
    'readFile', 'writeFile', 'appendFile', 'open', 'access', 'stat', 'lstat', 'readdir',
    'mkdir', 'rm', 'rmdir', 'rename', 'unlink', 'link', 'symlink', 'readlink',
    'truncate', 'utimes', 'copyFile', 'cp',
  ], 'promises.', true)
  for (const name of ['execFile', 'execFileSync', 'spawn', 'spawnSync', 'exec', 'execSync', 'fork']) {
    const original = childProcess[name]
    originals.push([childProcess, name, original])
    childProcess[name] = function (...args) {
      if (records !== null) records.push({ method: name, launch: true, executable: args[0], argv: Array.isArray(args[1]) ? args[1] : [] })
      return Reflect.apply(original, this, args)
    }
  }
  syncBuiltinESMExports()
}

function stopRecording() {
  records = null
  for (const [target, name, original] of originals.reverse()) target[name] = original
  syncBuiltinESMExports()
}

async function cold() {
  const store = await import('../../../../dist/Persistence/EventStore/Surface.js')
  const handle = store.create(commonDir, writerId)
  try {
    return {
      pid: process.pid,
      events: request.expectedEvents.map(event => store.read(handle, event.id)),
      head: store.head(handle, request.incoming.stream),
      heads: store.heads(handle, request.incoming.stream),
    }
  } finally {
    store.dispose(handle)
  }
}

async function measure() {
  startRecording()
  let handle
  let store
  try {
    const marker = path.join(commonDir, 'objects', 'recorder-positive')
    originalMkdir(path.dirname(marker), { recursive: true })
    originalWrite(marker, 'native-object-positive', 'utf8')
    records = []
    assert.equal(fs.readFileSync(marker, 'utf8'), 'native-object-positive')
    assert.equal(await promises.readFile(marker, 'utf8'), 'native-object-positive')
    assert.match(childProcess.execFileSync('git', ['--version'], { encoding: 'utf8' }), /^git version /)
    const positive = records
    records = null
    originalRemove(marker)

    store = await import('../../../../dist/Persistence/EventStore/Surface.js')
    const codec = await import('../../../../dist/Persistence/EventStore/CodecSurface.js')
    records = []
    handle = store.create(commonDir, writerId)
    const activation = records
    records = null
    assert.deepEqual(store.read(handle, request.anchor.id), request.anchor)
    assert.equal(store.head(handle, request.incoming.stream), request.anchor.id)
    const historicalBefore = originalRead(request.historicalFile)

    records = []
    const result = await store.append(handle, [request.incoming])
    const append = records
    records = null

    const bytes = originalRead(writerFile)
    assert.deepEqual(bytes, Buffer.from(codec.encode(request.incoming), 'utf8'))
    assert.deepEqual(originalRead(request.historicalFile), historicalBefore)
    return {
      pid: process.pid, positive, activation, append, result,
      event: store.read(handle, request.incoming.id),
      head: store.head(handle, request.incoming.stream),
      heads: store.heads(handle, request.incoming.stream),
      writtenBase64: bytes.toString('base64'),
    }
  } finally {
    records = null
    if (handle !== undefined) store.dispose(handle)
    stopRecording()
  }
}

assert.ok(mode === 'measure' || mode === 'cold', 'explicit native child mode')
const result = mode === 'measure' ? await measure() : await cold()
process.stdout.write(JSON.stringify(result))
