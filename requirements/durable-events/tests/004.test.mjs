import test from 'node:test'

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

test('WHAT[durable-events-004] append_task_does_not_return_until_the_cross_process_store_lock_is_released', async () => {
  const dir = withTemp((base) => base)
  const store = eventStore.create(dir, 'lock-release-proof')
  try {
    const r = await eventStore.append(store, [event(1)])
    assert.equal(r.ok, true)
    assert.equal(
      existsSync(path.join(dir, 'wanxiangshu.lock')),
      false,
      'Append release must happen before lock file is removed',
    )
  } finally {
    eventStore.dispose(store)
    rmSync(dir, { recursive: true, force: true })
  }
})
}

{
const { default: assert } = await import("node:assert/strict");
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { default: test } = await import("node:test");
const { default: fc } = await import("fast-check");
const eventCodec = await import("../../../dist/Persistence/EventStore/CodecSurface.js");
const retention = await import("../../../dist/Persistence/EventStore/RetentionSurface.js");

const propertyOptions = { seed: 0x44555241, numRuns: 300 }
const payloads = fc.array(fc.string({ maxLength: 128 }), { minLength: 1, maxLength: 12 })
const cutSeed = fc.nat()
const event = (index, text) => ({
  id: (index + 1).toString(16).padStart(40, '0'),
  stream: 'property/writer-tail',
  type: 'JobRequested',
  parents: index === 0 ? [] : [index.toString(16).padStart(40, '0')],
  payload: { text },
  payloadRefs: [],
})
const truncatedWriter = (values, seed) => {
  const lines = values.map((text, index) => Buffer.from(eventCodec.encode(event(index, text))))
  const lastLine = lines.at(-1)
  const removedBytes = 1 + (seed % (lastLine.length - 1))
  return Buffer.concat(lines).subarray(0, -removedBytes)
}
const assertIncompleteTailRejected = (read) => {
  assert.throws(read, (error) => /incomplete trailing line/i.test(String(error)))
}
const withWriter = (run) => {
  const root = mkdtempSync(join(tmpdir(), 'wanxiang-writer-tail-property-'))
  const commonDir = join(root, '.git')
  const eventsDir = join(commonDir, 'wanxiangshu', 'events')
  const writerPath = join(eventsDir, 'property-writer.ndjson')
  mkdirSync(eventsDir, { recursive: true })
  try {
    return run({ commonDir, writerPath })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('WHAT[durable-events-004] every incomplete canonical writer tail fails closed', () => {
  withWriter(({ commonDir, writerPath }) => {
    fc.assert(
      fc.property(payloads, cutSeed, (values, seed) => {
        writeFileSync(writerPath, truncatedWriter(values, seed))
        assertIncompleteTailRejected(() => retention.retainedWriterIdsAt(commonDir, 0))
      }),
      propertyOptions,
    )
  })
})
}
