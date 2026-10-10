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

test('WHAT[durable-events-017] append_path_has_no_Git_object_or_ref_capability', async () => {
  const source = await readFile(new URL('../../../src/Wanxiangshu/Persistence/EventStore/Store.fs', import.meta.url), 'utf8')
  const log = await readFile(new URL('../../../src/Wanxiangshu/Persistence/EventStore/ProcessEventLog.fs', import.meta.url), 'utf8')
  for (const token of ['WriteBlob', 'WriteTree', 'ReadRef', 'CompareAndSwapRef', 'RootOid', 'ProcessGitRawStore']) {
    assert.equal(source.includes(token), false)
    assert.equal(log.includes(token), false)
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

test('WHAT[durable-events-017] DURABLE_EVENTS_004_017_local_append_has_zero_Git_object_tree_ref_dependencies', async () => {
  const gitCommonDir = await commonDir()
  const store1 = eventStore.create(gitCommonDir, 'writer-bytes-1')
  try {
    const e1 = event(hexId(1), 1)
    const e2 = event(hexId(2), 2, [hexId(1)])

    // 1. Two appends preserve all previous bytes exactly
    assert.equal((await eventStore.append(store1, [e1])).ok, true)
    const file = path.join(gitCommonDir, 'wanxiangshu', 'events', 'writer-bytes-1.ndjson')
    const bytesAfterFirst = await readFile(file)

    assert.equal((await eventStore.append(store1, [e2])).ok, true)
    const bytesAfterSecond = await readFile(file)
    assert.equal(bytesAfterSecond.subarray(0, bytesAfterFirst.length).equals(bytesAfterFirst), true)

    eventStore.dispose(store1)

    // 2. Restart and readback confirms both events are durable and intact
    const store2 = eventStore.create(gitCommonDir, 'writer-bytes-2')
    try {
      const read1 = eventStore.read(store2, hexId(1))
      const read2 = eventStore.read(store2, hexId(2))
      assert.deepEqual(read1?.payload, { n: 1 })
      assert.deepEqual(read2?.payload, { n: 2 })
    } finally {
      eventStore.dispose(store2)
    }

    // 3. Tail truncation / incomplete trailing line fail-closed on restart
    const { appendFile } = await import('node:fs/promises')
    await appendFile(file, '{"event_id":"corrupt-half-line')
    assert.throws(() => {
      const store3 = eventStore.create(gitCommonDir, 'writer-bytes-3')
      eventStore.dispose(store3)
    }, /incomplete trailing line|NonCanonical/i, 'boot must fail-closed on corrupted tail')
  } finally {
    await remove(path.dirname(gitCommonDir))
  }
})
}

{
const { default: assert } = await import('node:assert/strict')
const { mkdtemp, readFile, readdir, rm } = await import('node:fs/promises')
const { tmpdir } = await import('node:os')
const { default: path } = await import('node:path')
const { fileURLToPath } = await import('node:url')
const { runVerificationToolProbe } = await import('../../../scripts/lib/verification-tool-probe.mjs')
const eventStore = await import('../../../dist/Persistence/EventStore/Surface.js')
const codec = await import('../../../dist/Persistence/EventStore/CodecSurface.js')
const childPath = fileURLToPath(new URL('./support/append-io-child.mjs', import.meta.url))

async function runChild(mode, commonDir, writerId, request, signal) {
  try {
    return JSON.parse(await runVerificationToolProbe(process.execPath, [
      childPath, mode, commonDir, writerId, JSON.stringify(request),
    ], { cwd: path.dirname(commonDir), env: { ...process.env }, signal }))
  } catch (error) {
    if (error?.stderr && typeof error.message === 'string') error.message += `\n${error.stderr}`
    throw error
  }
}

function inside(filename, directory) {
  return filename !== null && (filename === directory || filename.startsWith(`${directory}${path.sep}`))
}

function gitPath(filename, commonDir) {
  return ['objects', 'refs', 'logs'].some(name => inside(filename, path.join(commonDir, name)))
    || ['HEAD', 'packed-refs'].some(name => filename === path.join(commonDir, name))
}

for (const historyLength of [8, 128]) {
  test(`WHAT[durable-events-017] activated_append_records_no_historical_content_IO_with_${historyLength}_facts_and_cold_replay`, async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'wanxiang-append-io-'))
    const commonDir = path.join(root, '.git')
    const eventsDir = path.join(commonDir, 'wanxiangshu', 'events')
    const historicalFile = path.join(eventsDir, 'historical-writer.ndjson')
    const writerFile = path.join(eventsDir, 'meter-writer.ndjson')
    const history = []
    for (let index = 0; index < historyLength; index++) {
      history.push({
        id: index === historyLength - 1 ? 'a'.repeat(40) : (index + 1).toString(16).padStart(40, '0'),
        stream: 'proof/append-io', type: 'JobRequested',
        parents: index === 0 ? [] : [history[index - 1].id],
        payload: index === historyLength - 1 ? { anchor: 'stable' } : { index }, payloadRefs: [],
      })
    }
    const incoming = {
      id: 'c'.repeat(40), stream: 'proof/append-io', type: 'JobRequested',
      parents: ['a'.repeat(40)], payload: { text: '万象-é', count: 7, detail: { ready: true } }, payloadRefs: [],
    }
    const expectedBytes = Buffer.from(codec.encode(incoming), 'utf8')
    let seed
    try {
      seed = eventStore.create(commonDir, 'historical-writer')
      assert.deepEqual(await eventStore.append(seed, history), { ok: true, cuts: [] })
      assert.equal(eventStore.head(seed, incoming.stream), history.at(-1).id)
      eventStore.dispose(seed)
      seed = undefined
      assert.deepEqual(await readdir(eventsDir), ['historical-writer.ndjson'])
      const historicalBefore = await readFile(historicalFile)
      assert.deepEqual(historicalBefore, Buffer.from(history.map(event => codec.encode(event)).join(''), 'utf8'))
      const request = { historicalFile, anchor: history.at(-1), incoming, expectedEvents: [...history, incoming] }
      const measured = await runChild('measure', commonDir, 'meter-writer', request, t.signal)
      assert.ok(Number.isInteger(measured.pid) && measured.pid > 0 && measured.pid !== process.pid)
      assert.deepEqual(measured.result, { ok: true, cuts: [] })
      assert.deepEqual(measured.event, incoming)
      assert.equal(measured.head, incoming.id)
      assert.deepEqual(measured.heads, [incoming.id])
      assert.deepEqual(Buffer.from(measured.writtenBase64, 'base64'), expectedBytes)
      assert.deepEqual(await readFile(writerFile), expectedBytes)
      assert.deepEqual(await readFile(historicalFile), historicalBefore)
      assert.deepEqual((await readdir(eventsDir)).sort(), ['historical-writer.ndjson', 'meter-writer.ndjson'])
      const cold = await runChild('cold', commonDir, 'cold-writer', request, t.signal)
      assert.ok(Number.isInteger(cold.pid) && cold.pid > 0 && cold.pid !== process.pid && cold.pid !== measured.pid)
      assert.deepEqual(cold.events, request.expectedEvents)
      assert.equal(cold.head, incoming.id)
      assert.deepEqual(cold.heads, [incoming.id])
      assert.deepEqual((await readdir(eventsDir)).sort(), ['historical-writer.ndjson', 'meter-writer.ndjson'])
      assert.deepEqual(await readFile(writerFile), expectedBytes)
      assert.equal(expectedBytes.at(-1), 10)
      assert.deepEqual(await readFile(historicalFile), historicalBefore)
      assert.ok(measured.positive.some(record => record.launch && record.method === 'execFileSync' && record.executable === 'git' && record.argv.join(' ') === '--version'))
      for (const method of ['readFileSync', 'promises.readFile']) {
        assert.ok(measured.positive.some(record => record.method === method && record.success && record.bytes > 0 && record.paths.some(filename => gitPath(filename, commonDir))), `${method} observes real direct Git-path I/O`)
      }
      for (const method of ['readFileSync', 'readSync']) {
        assert.ok(measured.activation.some(record => record.method === method && record.success && record.paths[0] === historicalFile && record.bytes > 0), `${method} observes real activation historical bytes`)
      }
      assert.deepEqual(measured.activation.filter(record => record.unattributed), [], 'activation content I/O must be attributable')
      assert.deepEqual(measured.append.filter(record => record.unattributed), [], 'unattributed content I/O cannot prove zero')
      const contentReads = measured.append.filter(record => record.kind === 'read' && record.paths.some(filename => inside(filename, eventsDir) && filename.endsWith('.ndjson')))
      t.diagnostic(JSON.stringify({
        historyLength, meterPid: measured.pid, coldPid: cold.pid,
        activationReadBytes: measured.activation.filter(record => record.kind === 'read' && record.paths[0] === historicalFile).reduce((total, record) => total + (record.bytes ?? 0), 0),
        appendEventReadCalls: contentReads.length,
        appendEventReadBytes: contentReads.reduce((total, record) => total + (record.bytes ?? 0), 0),
        actualWriterBytes: Buffer.from(measured.writtenBase64, 'base64').byteLength,
        nativeLaunchCalls: measured.append.filter(record => record.launch).length,
        gitFilesystemCalls: measured.append.filter(record => record.paths?.some(filename => gitPath(filename, commonDir))).length,
        coldHead: cold.head,
      }))
      assert.equal(contentReads.length, 0, 'activated append must not perform any historical event content reads')
      assert.equal(contentReads.reduce((total, record) => total + (record.bytes ?? 0), 0), 0)
      assert.deepEqual(measured.append.filter(record => record.launch), [], 'native child process launches are absent during append')
      assert.deepEqual(measured.append.filter(record => record.paths?.some(filename => gitPath(filename, commonDir))), [], 'direct Git object/ref filesystem access is absent during append')
      const eventWrites = measured.append.filter(record => record.kind === 'write' && record.paths.some(filename => inside(filename, eventsDir)))
      assert.ok(eventWrites.some(record => record.success && record.paths[0] === writerFile && record.bytes === expectedBytes.length), 'real forwarded content write carries all incoming UTF8 bytes')
      assert.ok(eventWrites.every(record => record.paths[0] === writerFile), 'append writes only its own writer file')
      const destructiveMethods = new Set(['rm', 'rmdir', 'unlink', 'rename', 'link', 'symlink', 'truncate', 'ftruncate', 'copyFile', 'cp'])
      assert.deepEqual(measured.append.filter(record => destructiveMethods.has(record.method.replace('promises.', '').replace(/Sync$/, '')) && record.paths.some(filename => inside(filename, eventsDir))), [], 'append does not replace or delete writer history')
      assert.ok(measured.append.some(record => record.method === 'fsyncSync' && record.success && record.paths[0] === writerFile), 'durability barrier uses the actual incoming writer fd')
    } finally {
      if (seed !== undefined) eventStore.dispose(seed)
      await rm(root, { recursive: true, force: true })
    }
  })
}
}
