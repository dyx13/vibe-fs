import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { syncBuiltinESMExports } from 'node:module'

const [mode, commonDir, writerId, scenario, requestJson] = process.argv.slice(2)
const request = JSON.parse(requestJson)
const root = path.dirname(commonDir)
const sourceFile = path.join(commonDir, 'wanxiangshu', 'events', `${writerId}.ndjson`)
const lock = path.join(commonDir, 'wanxiangshu.lock')
const dto = event => ({ id: event.event_id, stream: event.stream_id, type: event.event_type,
  parents: event.parents, payload: event.payload, payloadRefs: event.payload_refs })
const store = await import('../../../../dist/Persistence/EventStore/Surface.js')
const journals = await import('../../../../dist/Verification/JournalPortObservationSurface.js')

if (mode === 'cold') {
  const source = path.join(commonDir, 'wanxiangshu', 'events', `${request.sourceWriter}.ndjson`)
  const handle = store.create(commonDir, writerId)
  let journal
  try {
    journal = await journals.openActualJournalWithStore(handle, writerId, new Date().toISOString())
    assert.equal(fs.readFileSync(source, 'base64'), request.bytes)
    for (const fact of request.facts) {
      assert.deepEqual(store.read(handle, fact.id), fact)
    }
    for (const frontier of request.heads) {
      assert.deepEqual(store.heads(handle, frontier.stream), frontier.heads)
      assert.equal(store.head(handle, frontier.stream), frontier.head)
    }
    const projection = journals.observeActualJournalProjection(journal)
    assert.deepEqual(projection, request.projection)
    assert.equal(fs.existsSync(sourceFile), false)
    assert.equal(fs.existsSync(lock), false)
    assert.deepEqual(fs.readdirSync(path.dirname(source)).sort(), [`${request.sourceWriter}.ndjson`])
    fs.writeSync(1, JSON.stringify({ pid: process.pid, parentPid: process.ppid, writerId,
      projection, bytes: fs.readFileSync(source, 'base64'), preserved: true }) + '\n')
  } finally {
    if (journal) await journals.disposeActualJournal(journal)
    store.dispose(handle)
  }
} else {
  assert.equal(mode, 'measure')
  const business = scenario.startsWith('business-')
  const variant = business ? scenario.slice('business-'.length) : scenario
  assert.ok(['valid', 'valid-release', 'malformed', 'malformed-release'].includes(variant))
  assert.equal(process.env.WANXIANGSHU_NO_FATAL_EXIT, undefined)
  assert.equal(process.env.NODE_TEST_CONTEXT, undefined)
  const malformed = variant.startsWith('malformed')
  const release = variant.endsWith('-release')
  const failureOrdinal = business ? 2 : 1
  const cause = new Error(`original Journal ${business ? 'business' : 'initialization'} owned Release completed before response failed`)
  const originals = { appendFileSync: fs.appendFileSync, openSync: fs.openSync,
    fsyncSync: fs.fsyncSync, closeSync: fs.closeSync, rmSync: fs.rmSync }
  const descriptors = new Set()
  const synced = new Set()
  const counts = { append: 0, fsync: 0, close: 0, release: 0, injected: 0 }
  const ownFile = value => typeof value === 'string' && path.resolve(value) === sourceFile
  fs.appendFileSync = function (...args) {
    const result = Reflect.apply(originals.appendFileSync, this, args)
    if (ownFile(args[0])) counts.append += 1
    return result
  }
  fs.openSync = function (...args) {
    const fd = Reflect.apply(originals.openSync, this, args)
    if (ownFile(args[0])) descriptors.add(fd)
    return fd
  }
  fs.fsyncSync = function (...args) {
    const result = Reflect.apply(originals.fsyncSync, this, args)
    if (descriptors.has(args[0])) {
      synced.add(args[0])
      counts.fsync += 1
    }
    return result
  }
  fs.closeSync = function (...args) {
    const result = Reflect.apply(originals.closeSync, this, args)
    if (synced.has(args[0])) counts.close += 1
    descriptors.delete(args[0])
    synced.delete(args[0])
    return result
  }
  fs.rmSync = function (...args) {
    const owned = typeof args[0] === 'string' && path.resolve(args[0]) === lock
    if (owned) {
      assert.equal(JSON.parse(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8')).pid, process.pid)
    }
    const result = Reflect.apply(originals.rmSync, this, args)
    if (owned) {
      counts.release += 1
      assert.equal(fs.existsSync(lock), false)
      if (release && counts.release === failureOrdinal) {
        counts.injected += 1
        throw cause
      }
    }
    return result
  }
  syncBuiltinESMExports()
  const handle = store.create(commonDir, writerId)
  let journal
  let observations = 0
  const observe = observation => {
    observations += 1
    const bytes = fs.readFileSync(sourceFile)
    const facts = bytes.toString('utf8').trimEnd().split('\n').map(JSON.parse).map(dto)
    const error = observation.append.error
    const receipt = { pid: process.pid, parentPid: process.ppid, writerId, scenario, observations,
      ordinal: observation.append.ordinal,
      initial: journals.observeActualJournal(journal), projection: journals.observeActualJournalProjection(journal),
      originalRequested: observation.originalRequested, requested: observation.append.requested,
      cuts: observation.append.cuts, appendError: error === null ? null : {
        code: error.code, phase: error.phase, causeSame: error.cause === cause,
        requested: error.requested, prepared: error.prepared, cleanupFailures: error.cleanupFailures,
      }, facts, bytes: bytes.toString('base64'),
      heads: [...new Set(facts.map(fact => fact.stream))].map(stream => ({ stream,
        head: store.head(handle, stream), heads: store.heads(handle, stream) })),
      counts: { ...counts }, lockReleased: !fs.existsSync(lock),
      openDescriptors: descriptors.size, syncedDescriptors: synced.size }
    const fd = fs.openSync(path.join(root, 'journal-settlements.ndjson'), 'a')
    try {
      fs.writeSync(fd, JSON.stringify(receipt,
        (_key, value) => typeof value === 'bigint' ? value.toString() : value) + '\n')
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
  }
  const port = business && malformed
    ? store.createAppendPayloadStoreAt(handle, 2, observe)
    : store.createAppendPayloadStore(handle, malformed, observe)
  try {
    journal = await journals.openActualJournalWithStore(port, writerId, new Date().toISOString())
    const initial = journals.observeActualJournal(journal)
    assert.equal(fs.existsSync(sourceFile), false)
    const first = await journals.appendActualJournal(journal)
    const afterFirst = journals.observeActualJournal(journal)
    let second = null
    let afterSecond = null
    if (release) {
      assert.strictEqual(first.error.cause, cause)
      const beforeSecond = { ...counts }
      second = await journals.appendActualJournal(journal)
      afterSecond = journals.observeActualJournal(journal)
      assert.deepEqual(counts, beforeSecond)
      assert.strictEqual(second.error.cause, cause)
      assert.equal(second.error.failedEventId, business ? first.error.eventId : initial.initEventId)
    }
    fs.writeFileSync(path.join(root, 'journal-returned.json'), JSON.stringify({ initial, first,
      afterFirst, second, afterSecond, projection: journals.observeActualJournalProjection(journal) },
    (_key, value) => typeof value === 'bigint' ? value.toString() : value))
  } finally {
    try {
      if (journal) await journals.disposeActualJournal(journal)
    } finally {
      Object.assign(fs, originals)
      syncBuiltinESMExports()
      store.dispose(port)
      store.dispose(handle)
    }
  }
}
