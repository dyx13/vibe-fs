import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import path from 'node:path'

const [mode, commonDir, writerId, scenario, requestJson] = process.argv.slice(2)
assert.ok(['measure', 'cold'].includes(mode))
assert.ok(['valid', 'malformed-release', 'valid-release', 'not-attempted-controlled', 'no-new-write-controlled'].includes(scenario))
const request = JSON.parse(requestJson)
const store = await import('../../../../dist/Persistence/EventStore/Surface.js')
const persistence = await import('../../../../dist/Sphinx/V2/Persistence/Surface.js')
const commands = await import('../../../../dist/Sphinx/V2/Composition/SettlementSurface.js')
const digest = value => createHash('sha256').update(value).digest('hex')
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const dto = event => ({ id: event.event_id, stream: event.stream_id, type: event.event_type,
  parents: event.parents, payload: event.payload, payloadRefs: event.payload_refs })
const file = path.join(commonDir, 'wanxiangshu', 'events', `${writerId}.ndjson`)
const lock = path.join(commonDir, 'wanxiangshu.lock')
const handle = store.create(commonDir, writerId)
const handles = [handle]
let runtime
const originals = {
  appendFileSync: fs.appendFileSync, openSync: fs.openSync, fsyncSync: fs.fsyncSync,
  closeSync: fs.closeSync, rmSync: fs.rmSync, readFileSync: fs.readFileSync,
  existsSync: fs.existsSync, statSync: fs.statSync, mkdirSync: fs.mkdirSync,
}

try {
  if (mode === 'cold') {
    assert.notEqual(writerId, request.sourceWriter)
    const source = path.join(commonDir, 'wanxiangshu', 'events', `${request.sourceWriter}.ndjson`)
    assert.equal(fs.existsSync(source), request.writerCreated)
    const bytes = request.writerCreated ? fs.readFileSync(source, 'base64') : ''
    assert.equal(bytes, request.bytes)
    for (const fact of request.facts) {
      assert.deepEqual(store.read(handle, fact.id), fact)
      assert.deepEqual(store.heads(handle, fact.stream), [fact.id])
      assert.equal(store.head(handle, fact.stream), fact.id)
    }
    const current = persistence.canonicalCurrent(handle, digest, request.inquiryId)
    assert.deepEqual(current, request.current)
    assert.equal(fs.existsSync(file), false, 'Cold observation must not create a writer')
    assert.equal(fs.existsSync(lock), false)
    assert.equal(request.writerCreated ? fs.readFileSync(source, 'base64') : '', request.bytes)
    fs.writeSync(1, JSON.stringify({ pid: process.pid, writerId, current, bytes, preserved: true }) + '\n')
  } else {
    const controlled = scenario.endsWith('-controlled')
    const malformed = scenario === 'malformed-release'
    const release = scenario.endsWith('-release')
    const cause = new Error(controlled ? `Explicit ${scenario} result mapping`
      : 'Sphinx command owned Release completed before its response failed')
    const descriptors = new Set()
    const synced = new Set()
    const counts = { append: 0, fsync: 0, close: 0, release: 0, injected: 0 }
    let ownerIo = 0
    const ownsFile = value => typeof value === 'string' && path.resolve(value) === file
    const ownedPath = value => typeof value === 'string'
      && (path.resolve(value) === commonDir || path.resolve(value).startsWith(commonDir + path.sep))

    fs.appendFileSync = function (...args) {
      if (ownedPath(args[0])) ownerIo += 1
      const result = Reflect.apply(originals.appendFileSync, this, args)
      if (ownsFile(args[0])) counts.append += 1
      return result
    }
    fs.openSync = function (...args) {
      if (ownedPath(args[0])) ownerIo += 1
      const descriptor = Reflect.apply(originals.openSync, this, args)
      if (ownsFile(args[0])) descriptors.add(descriptor)
      return descriptor
    }
    fs.fsyncSync = function (...args) {
      if (descriptors.has(args[0])) ownerIo += 1
      const result = Reflect.apply(originals.fsyncSync, this, args)
      if (descriptors.has(args[0])) {
        counts.fsync += 1
        synced.add(args[0])
      }
      return result
    }
    fs.closeSync = function (...args) {
      if (descriptors.has(args[0])) ownerIo += 1
      const result = Reflect.apply(originals.closeSync, this, args)
      if (synced.has(args[0])) counts.close += 1
      descriptors.delete(args[0])
      synced.delete(args[0])
      return result
    }
    fs.rmSync = function (...args) {
      if (ownedPath(args[0])) ownerIo += 1
      const owned = typeof args[0] === 'string' && path.resolve(args[0]) === lock
      if (owned) assert.equal(JSON.parse(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8')).pid, process.pid)
      const result = Reflect.apply(originals.rmSync, this, args)
      if (owned) {
        counts.release += 1
        assert.equal(fs.existsSync(lock), false)
        if (release) {
          counts.injected += 1
          throw cause
        }
      }
      return result
    }
    fs.readFileSync = function (...args) {
      if (ownedPath(args[0])) ownerIo += 1
      return Reflect.apply(originals.readFileSync, this, args)
    }
    fs.existsSync = function (...args) {
      if (ownedPath(args[0])) ownerIo += 1
      return Reflect.apply(originals.existsSync, this, args)
    }
    fs.statSync = function (...args) {
      if (ownedPath(args[0])) ownerIo += 1
      return Reflect.apply(originals.statSync, this, args)
    }
    fs.mkdirSync = function (...args) {
      if (ownedPath(args[0])) ownerIo += 1
      return Reflect.apply(originals.mkdirSync, this, args)
    }
    syncBuiltinESMExports()

    let inquiryId
    const physicalView = () => {
      const writerCreated = fs.existsSync(file)
      const bytes = writerCreated ? fs.readFileSync(file) : Buffer.alloc(0)
      const lines = writerCreated ? bytes.toString('utf8').trimEnd().split('\n').map(JSON.parse) : []
      assert.equal(bytes.toString('utf8'), lines.map(event => JSON.stringify(canonical(event)) + '\n').join(''))
      const facts = lines.map(dto)
      for (const fact of facts) {
        assert.deepEqual(store.read(handle, fact.id), fact)
        assert.deepEqual(store.heads(handle, fact.stream), [fact.id])
        assert.equal(store.head(handle, fact.stream), fact.id)
      }
      return { writerCreated, bytes: bytes.toString('base64'), facts,
        current: persistence.canonicalCurrent(handle, digest, inquiryId),
        lockReleased: !fs.existsSync(lock), openDescriptors: descriptors.size,
        syncedDescriptors: synced.size, counts: { ...counts } }
    }
    const observations = []
    const timeline = []
    const observe = observation => {
      assert.equal(observation.originalRequested.length, 1)
      inquiryId = observation.originalRequested[0].payload.inquiry
      observations.push({ ...observation, physical: physicalView() })
      timeline.push('append-settled')
    }
    const port = controlled
      ? store.createAppendFailureStore(handle, {
        code: scenario === 'not-attempted-controlled' ? 'AppendNotAttempted' : 'NoNewWriteReleaseFailed',
        phase: scenario === 'not-attempted-controlled' ? 'BeforePhysicalAppend' : 'StoreRelease', cause,
      }, append => observe({ originalRequested: append.requested, append }))
      : store.createAppendPayloadStore(handle, malformed, observe)
    handles.push(port)
    const incidents = []
    const incidentReceipts = []
    runtime = commands.create(port, request.configuration, incident => {
      const observation = observations.at(-1)
      incidents.push(incident)
      incidentReceipts.push({ inquiryId: incident.inquiryId, commandId: incident.commandId,
        eventId: incident.eventId, causeSame: incident.cause === cause,
        evidenceSame: observation === undefined ? false : incident.matchesAppendEvidence(observation.append.originalError),
        observedSettlements: observations.length, physical: physicalView() })
      timeline.push('incident')
    })
    const result = await commands.start(runtime, request.command)
    timeline.push('returned')
    assert.equal(observations.length, 1, 'One Commands.start must reach exactly one append result')
    const observation = observations[0]
    const [original] = observation.originalRequested
    assert.equal(observation.originalRequested.length, 1)
    assert.equal(original.type, 'sphinx/v2-transition@2')
    assert.equal(original.payload.inquiry, inquiryId)
    assert.equal(original.payload.commandId, request.command.commandId)
    assert.equal(original.payload.events.length, 1)
    assert.equal(original.payload.events[0].case, 'InquiryCreated')
    assert.equal(original.payload.events[0].payload.goal.originalText, request.command.goalText)
    const physical = physicalView()
    const expectedCounts = controlled ? { append: 0, fsync: 0, close: 0, release: 0, injected: 0 }
      : { append: 1, fsync: 1, close: 1, release: 1, injected: release ? 1 : 0 }
    assert.deepEqual(counts, expectedCounts)
    assert.equal(physical.writerCreated, !controlled)
    assert.equal(physical.lockReleased, true)
    assert.equal(physical.openDescriptors, 0)
    assert.equal(physical.syncedDescriptors, 0)
    assert.deepEqual(observation.physical, physical)
    assert.equal(physical.facts.length, controlled ? 0 : malformed ? 2 : 1)
    const requested = { ...original, payload: malformed ? {} : original.payload }
    assert.deepEqual(observation.append.requested, [requested])
    if (!controlled) assert.deepEqual(physical.facts[0], requested)
    if (malformed) {
      const cut = physical.facts[1]
      assert.equal(cut.type, 'ProjectionCutTail')
      assert.equal(cut.payload.rule, 'SphinxV2')
      assert.equal(cut.payload.failed_event_id, original.id)
      assert.deepEqual(cut.parents, [original.id])
      assert.equal(observation.append.cuts.length, 1)
      assert.equal(observation.append.cuts[0].cutEventId, cut.id)
      assert.equal(observation.append.cuts[0].failedEventId, original.id)
      assert.equal(physical.current.ok, false)
      assert.equal(physical.current.error.code, 'SemanticCut')
      assert.match(physical.current.error.message, /INVALID_TRANSITION_DTO/)
      assert.equal(Object.hasOwn(physical.current, 'value'), false)
    } else if (controlled) {
      assert.equal(physical.current.ok, false)
      assert.equal(physical.current.error.code, 'UNKNOWN_INQUIRY')
    } else {
      assert.equal(physical.current.ok, true, JSON.stringify(physical.current.error))
      assert.equal(physical.current.value.eventHead, original.id)
      assert.equal(physical.current.value.revision, '0')
      assert.equal(physical.current.value.goal.originalText, request.command.goalText)
    }

    let redelivery = null
    if (incidents.length === 1) {
      const before = physicalView()
      const callbacksBefore = incidents.length
      const ioBefore = ownerIo
      let errorMessage = null
      try {
        commands.settleAppendCutUnknown(runtime, incidents[0].incident, observation.append.originalError)
      } catch (error) {
        errorMessage = error.message
      }
      const ioAfter = ownerIo
      const callbacksAfter = incidents.length
      const after = physicalView()
      redelivery = { errorMessage, callbacksBefore, callbacksAfter, ioBefore, ioAfter,
        bytesUnchanged: before.bytes === after.bytes,
        currentUnchanged: JSON.stringify(before.current) === JSON.stringify(after.current),
        countsBefore: before.counts, countsAfter: after.counts }
    }
    const appendError = observation.append.error
    const errorView = appendError === null ? null : {
      code: appendError.code, phase: appendError.phase, causeSame: appendError.cause === cause,
      requested: appendError.requested, prepared: appendError.prepared,
      cleanupFailures: appendError.cleanupFailures, priorRejection: appendError.priorRejection,
    }
    fs.writeSync(1, JSON.stringify({ pid: process.pid, inquiryId, commandId: request.command.commandId,
      original, requested, physical, result, incidentReceipts, redelivery, timeline,
      appendError: errorView, cuts: observation.append.cuts }) + '\n')
  }
} finally {
  Object.assign(fs, originals)
  syncBuiltinESMExports()
  if (runtime) commands.dispose(runtime)
  for (const owned of handles.reverse()) store.dispose(owned)
}
