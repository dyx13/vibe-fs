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

test('WHAT[durable-events-001] append_only_prior_writer_bytes_are_a_strict_prefix_after_new_fact', async () => {
  const dir = withTemp((base) => base)
  const store = eventStore.create(dir, 'append-law')
  try {
    const file = join(dir, 'wanxiangshu', 'events', 'append-law.ndjson')
    await eventStore.append(store, [event(id(1))])
    const before = await readFile(file)
    await eventStore.append(store, [event(id(2), [id(1)])])
    const after = await readFile(file)
    assert.equal(after.subarray(0, before.length).equals(before), true)
    assert.ok(after.length > before.length)
  } finally {
    eventStore.dispose(store)
    rmSync(dir, { recursive: true, force: true })
  }
})
}

{
const { default: assert } = await import("node:assert/strict");
const { existsSync, readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
const { readFile } = await import("node:fs/promises");
const { default: path } = await import("node:path");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { default: test } = await import("node:test");
const eventStore = await import("../../../dist/Persistence/EventStore/Surface.js");
const journal = await import("../../../dist/Persistence/Journal/Surface.js");

const id = (n) => n.toString(16).padStart(40, '0')
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}
const canonicalEventLine = (event) => `${JSON.stringify(canonicalize(event))}\n`
const withTemp = (fn) => {
  const base = mkdtempSync(join(tmpdir(), 'wxs-event-store-append-'))
  return fn(base)
}
const event = (n, parents = [], type = 'JobRequested', payload = { n }) => ({
  id: id(n),
  stream: 'append/proof',
  type,
  parents: parents.map((p) => id(p)),
  payload,
  payloadRefs: [],
})

test('WHAT[durable-events-001] append_commits_complete_canonical_line_then_updates_Current', async () => {
  const dir = withTemp((base) => base)
  const store = eventStore.create(dir, 'append-proof')
  try {
    const e = event(1)
    const r = await eventStore.append(store, [e])
    assert.equal(r.ok, true)
    const found = eventStore.read(store, id(1))
    assert.ok(found)
    assert.equal(found.id, id(1))
    assert.deepEqual(found.payload, e.payload, 'read returns the event payload, not the canonical envelope')
    const text = await readFile(path.join(dir, 'wanxiangshu', 'events', 'append-proof.ndjson'), 'utf8')
    assert.equal(text.endsWith('\n'), true)
    assert.equal(text.trim().split('\n').length, 1)
  } finally {
    eventStore.dispose(store)
    rmSync(dir, { recursive: true, force: true })
  }
})
}
