import test from 'node:test'

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");
const merge = await import("../../../dist/Persistence/EventStore/MergeSurface.js");

const make = (id, parents = [], stream = 'merge/main', payload = {}) => ({
  id,
  stream,
  type: 'JobRequested',
  parents,
  payload,
  payloadRefs: [],
})
const ids = (result) => {
  assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.error))
  return result.events.map((event) => event.id)
}
const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const C = 'c'.repeat(40)

test('WHAT[durable-convergence-003] identity collision is fail closed not LWW', () => {
  const left = make(A, [], 'merge/main', { x: 1 })
  const right = make(A, [], 'merge/main', { x: 2 })
  const result = merge.merge([
    ['writer-left', [left]],
    ['writer-right', [right]],
  ])
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'IdentityCollision')
})
}

{
const { default: assert } = await import("node:assert/strict");
const { execFileSync } = await import("node:child_process");
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { default: test } = await import("node:test");
const eventStore = await import("../../../dist/Persistence/EventStore/Surface.js");
const retention = await import("../../../dist/Persistence/EventStore/RetentionSurface.js");

const make = (id, stream, parents = []) => ({ id, stream, type: 'JobRequested', parents, payload: {}, payloadRefs: [] })

test('WHAT[durable-convergence-003] sync blobifies each complete writer file once without segments or index', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wxs-writer-blobify-'))
  const repoA = join(root, 'a')
  const repoB = join(root, 'b')
  execFileSync('git', ['init', '-q', repoA])
  execFileSync('git', ['init', '-q', repoB])
  const commonA = join(repoA, '.git')
  const commonB = join(repoB, '.git')

  const now = Date.now()
  const A = 'a'.repeat(40)
  const B = 'b'.repeat(40)
  const C = 'c'.repeat(40)

  try {
    // 1. Repo A appends an event to writer-a and syncs to a snapshot
    const handleA = eventStore.create(commonA, 'writer-a')
    await eventStore.append(handleA, [make(A, 'stream/1')])
    eventStore.dispose(handleA)

    const syncA1 = await retention.syncAt(repoA, commonA, null, now)
    assert.equal(syncA1.ok, true, syncA1.ok ? '' : JSON.stringify(syncA1.error))

    // Prove complete writer file is exactly one Git blob in writers/ tree
    const treeA = execFileSync('git', ['-C', repoA, 'ls-tree', `${syncA1.root}:writers`], { encoding: 'utf8' })
    assert.match(treeA.trim(), /^100644 blob [0-9a-f]{40}\twriter-a\.ndjson$/)

    const blobOidA = treeA.trim().split(/\s+/)[2]
    const blobContentA = execFileSync('git', ['-C', repoA, 'cat-file', '-p', blobOidA], { encoding: 'utf8' })
    const fileContentA = readFileSync(join(commonA, 'wanxiangshu', 'events', 'writer-a.ndjson'), 'utf8')
    assert.equal(blobContentA, fileContentA, 'entire local writer file is one Git blob without segments')

    // 2. Repo B has writer-b, fetches Repo A objects, and syncs against rootA -> convergence
    execFileSync('git', ['-C', repoB, 'fetch', '-q', repoA, syncA1.root])
    const handleB = eventStore.create(commonB, 'writer-b')
    await eventStore.append(handleB, [make(B, 'stream/2')])
    eventStore.dispose(handleB)

    const syncB1 = await retention.syncAt(repoB, commonB, syncA1.root, now)
    assert.equal(syncB1.ok, true, syncB1.ok ? '' : JSON.stringify(syncB1.error))
    assert.equal(existsSync(join(commonB, 'wanxiangshu', 'events', 'writer-a.ndjson')), true)
    assert.equal(existsSync(join(commonB, 'wanxiangshu', 'events', 'writer-b.ndjson')), true)

    // 3. Repeat sync on Repo B is idempotent
    const syncB2 = await retention.syncAt(repoB, commonB, syncB1.root, now)
    assert.equal(syncB2.ok, true)
    assert.equal(syncB2.root, syncB1.root, 'repeat sync produces identical snapshot root')

    // 4. Two offline sides converge to identical snapshot root
    execFileSync('git', ['-C', repoA, 'fetch', '-q', repoB, syncB1.root])
    const syncA2 = await retention.syncAt(repoA, commonA, syncB1.root, now)
    assert.equal(syncA2.ok, true)
    assert.equal(syncA2.root, syncB1.root, 'two sides converge to identical snapshot root')
    assert.equal(existsSync(join(commonA, 'wanxiangshu', 'events', 'writer-b.ndjson')), true)

    // 5. Corrupted / divergent writer history fails closed
    const canonicalLine = (event) => JSON.stringify({
      event_id: event.id,
      event_type: event.type,
      parents: [...event.parents].sort(),
      payload: event.payload,
      payload_refs: [...event.payloadRefs].sort(),
      stream_id: event.stream,
    }) + '\n'
    writeFileSync(join(commonA, 'wanxiangshu', 'events', 'writer-b.ndjson'), canonicalLine(make(C, 'stream/divergent')))
    const syncDivergent = await retention.syncAt(repoA, commonA, syncB1.root, now)
    assert.equal(syncDivergent.ok, false, 'divergent writer history must fail closed')
    assert.match(String(syncDivergent.error), /writer history diverged/i)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
test.todo('WHAT[durable-convergence-003] concurrent append and hook convergence preserve the retained union across physical replacement and crash cuts (GAP-151)')
}

{
const { default: assert } = await import("node:assert/strict");
const { execFileSync } = await import("node:child_process");
const { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { default: test } = await import("node:test");
const retention = await import("../../../dist/Persistence/EventStore/RetentionSurface.js");

const git = (repo, args, options = {}) => execFileSync('git', ['-C', repo, ...args], options)
const invalidUtf8Line = (line) => {
  const bytes = Buffer.from(line)
  const continuation = bytes.indexOf(0xa9)
  assert.notEqual(continuation, -1)
  bytes[continuation] = 0x20
  return bytes
}

test('WHAT[durable-convergence-003] remote writer bytes reject invalid UTF-8 before retained-union merge', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'wxs-remote-invalid-utf8-'))
  git(repo, ['init', '-q'])
  const commonDir = join(repo, '.git')
  const eventsDir = join(commonDir, 'wanxiangshu', 'events')
  const writerPath = join(eventsDir, 'writer-remote.ndjson')
  const nowMs = Date.now()
  const line = JSON.stringify({
    event_id: '757466382d72656d6f74652d7772697465722d6964',
    event_type: 'JobRequested',
    parents: [],
    payload: { text: 'é' },
    payload_refs: [],
    stream_id: 'proof/remote-utf8',
  }) + '\n'

  try {
    mkdirSync(eventsDir, { recursive: true })
    writeFileSync(writerPath, line)
    const initial = await retention.syncAt(repo, commonDir, null, nowMs)
    assert.equal(initial.ok, true, JSON.stringify(initial))

    const originalWriterEntry = git(repo, ['ls-tree', `${initial.root}:writers`], { encoding: 'utf8' }).trim()
    const originalWriterOid = originalWriterEntry.split(/\s+/)[2]
    const invalidWriterOid = git(repo, ['hash-object', '-w', '--stdin'], {
      encoding: 'utf8',
      input: invalidUtf8Line(line),
    }).trim()
    const invalidWriterTree = git(repo, ['mktree'], {
      encoding: 'utf8',
      input: originalWriterEntry.replace(originalWriterOid, invalidWriterOid) + '\n',
    }).trim()

    const manifest = git(repo, ['show', `${initial.root}:writer-manifest`], { encoding: 'utf8' })
    const invalidManifestOid = git(repo, ['hash-object', '-w', '--stdin'], {
      encoding: 'utf8',
      input: manifest.replace(originalWriterOid, invalidWriterOid),
    }).trim()
    const invalidRootEntries = git(repo, ['ls-tree', initial.root], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((entry) => {
        if (entry.endsWith('\twriters')) return entry.replace(/tree [0-9a-f]{40}/, `tree ${invalidWriterTree}`)
        if (entry.endsWith('\twriter-manifest')) return entry.replace(/blob [0-9a-f]{40}/, `blob ${invalidManifestOid}`)
        return entry
      })
      .join('\n') + '\n'
    const invalidRoot = git(repo, ['mktree'], { encoding: 'utf8', input: invalidRootEntries }).trim()

    unlinkSync(writerPath)
    const result = await retention.syncAt(repo, commonDir, invalidRoot, nowMs + 1)

    assert.equal(result.ok, false)
    assert.match(String(result.error), /not valid UTF-8/)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
}
