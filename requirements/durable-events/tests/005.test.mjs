import test from 'node:test'

{
const { default: assert } = await import("node:assert/strict");
const { readFile, readdir } = await import("node:fs/promises");
const { mkdtempSync, rmSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { default: test } = await import("node:test");
const eventStore = await import("../../../dist/Persistence/EventStore/Surface.js");

const id = (n) => n.toString(16).padStart(40, '0')
const event = (id, parents = []) => ({
  id,
  stream: 'append/law',
  type: 'JobRequested',
  parents,
  payload: { id },
  payloadRefs: [],
})
const withTemp = (fn) => {
  const base = mkdtempSync(join(tmpdir(), 'wxs-append-law-'))
  return fn(base)
}

test('WHAT[durable-events-005] one_writer_is_one_file_regardless_of_history_size', async () => {
  const dir = withTemp((base) => base)
  const store = eventStore.create(dir, 'one-file-law')
  try {
    let parent = null
    for (let n = 1; n <= 128; n += 1) {
      const next = id(n)
      await eventStore.append(store, [event(next, parent ? [parent] : [])])
      parent = next
    }
    const files = await readdir(join(dir, 'wanxiangshu', 'events'))
    assert.deepEqual(files, ['one-file-law.ndjson'])
  } finally {
    eventStore.dispose(store)
    rmSync(dir, { recursive: true, force: true })
  }
})
}

{
const { default: assert } = await import("node:assert/strict");
const { mkdtemp, readFile, readdir, rm } = await import("node:fs/promises");
const { tmpdir } = await import("node:os");
const { default: path } = await import("node:path");
const { default: test } = await import("node:test");
const eventStore = await import("../../../dist/Persistence/EventStore/Surface.js");

const hexId = (n) => n.toString(16).padStart(40, '0')
const event = (id, n, parents = []) => ({
  id,
  stream: 'proof/local',
  type: 'JobRequested',
  parents,
  payload: { n },
  payloadRefs: [],
})
const commonDir = async () => path.join(await mkdtemp(path.join(tmpdir(), 'wanxiang-local-log-')), '.git')
const remove = async (dir) => rm(dir, { recursive: true, force: true })

test('WHAT[durable-events-005] DURABLE_EVENTS_005_one_process_is_one_unbounded_writer_file_with_no_segments', async () => {
  const gitCommonDir = await commonDir()
  const store = eventStore.create(gitCommonDir, 'writer-proof-a')
  try {
    const first = Array.from({ length: 4 }, (_, i) => event(hexId(i + 1), i + 1))
    assert.equal((await eventStore.append(store, first)).ok, true)
    const file = path.join(gitCommonDir, 'wanxiangshu', 'events', 'writer-proof-a.ndjson')
    const prefix = await readFile(file)

    const many = Array.from({ length: 160 }, (_, i) => event(hexId(i + 100), i + 100))
    assert.equal((await eventStore.append(store, many)).ok, true)
    const after = await readFile(file)

    assert.equal(after.subarray(0, prefix.length).equals(prefix), true, 'append must preserve every prior byte')
    assert.equal(path.basename(file), 'writer-proof-a.ndjson')

    const files = await readdir(path.join(gitCommonDir, 'wanxiangshu', 'events'))
    assert.deepEqual(files, ['writer-proof-a.ndjson'], 'history size must not create 000000/segment/chunk files')
    assert.equal(files.some((name) => /^\d+\.ndjson$/.test(name)), false)
  } finally {
    eventStore.dispose(store)
    await remove(path.dirname(gitCommonDir))
  }
})
test('WHAT[durable-events-005] DURABLE_EVENTS_005_each_process_writer_id_names_a_distinct_file_without_machine_identity', async () => {
  const gitCommonDir = await commonDir()
  const a = eventStore.create(gitCommonDir, 'writer-a')
  const b = eventStore.create(gitCommonDir, 'writer-b')
  try {
    assert.equal((await eventStore.append(a, [event(hexId(0xa1), 1)])).ok, true)
    assert.equal((await eventStore.append(b, [event(hexId(0xb1), 2)])).ok, true)

    const files = (await readdir(path.join(gitCommonDir, 'wanxiangshu', 'events'))).sort()
    assert.deepEqual(files, ['writer-a.ndjson', 'writer-b.ndjson'])
  } finally {
    eventStore.dispose(a)
    eventStore.dispose(b)
    await remove(path.dirname(gitCommonDir))
  }
})
}
