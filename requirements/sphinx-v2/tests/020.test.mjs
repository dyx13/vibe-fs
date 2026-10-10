import assert from 'node:assert/strict'
import test from 'node:test'
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import * as Core from '../../../dist/Sphinx/V2/Core/Surface.js'
import * as Wire from '../../../dist/Sphinx/V2/Wire/Surface.js'
import {store, digest, body, envelope, work, transition, batch, prepare, append} from './persistence-support.mjs'

test('WHAT[sphinx-v2-020] an actual created state has a usable content-sensitive semantic hash', () => {
  const states = ['\n原文甲\r\n  ', '\n原文乙\r\n  '].map(text => {
    const result = Core.stateOfCreate('semantic-hash-proof', text)
    assert.equal(Core.isOk(result), true)
    return Core.okValue(result)
  })
  const hashes = states.map(state => {
    let hash
    assert.doesNotThrow(() => { hash = Core.projectionSemanticHash(state) },
      'a valid semantic state must be hashable without exposing compiler values')
    assert.match(hash, /^[a-f0-9]{64}$/)
    return hash
  })
  assert.notEqual(hashes[0], hashes[1], 'different original text must change the semantic hash')
})

const configuration = {
  commandNamespace: 'hash-tests', createdBy: 'authorized-controller',
  profileRef: 'sphinx.default@2', executionMode: 'delegated',
  resourceSpecs: [{name: 'calls', kind: {case: 'consumed', payload: 'calls'}, authorizedLimit: 0}],
  renderReserve: {calls: 0},
}

const startArgs = (commandId, goalText) => ({
  commandId, goalText, constraints: [], materialRefs: [],
  authorizationRef: 'explicit-user-goal', profileRef: configuration.profileRef,
})

const plainObject = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))

const nativeJson = value => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(nativeJson)
  return plainObject(value) && Object.values(value).every(nativeJson)
}

const compareText = (left, right) => {
  const leftPoints = Array.from(left, character => character.codePointAt(0))
  const rightPoints = Array.from(right, character => character.codePointAt(0))
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index++) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index]
  }
  return leftPoints.length - rightPoints.length
}

const canonicalJson = value => {
  assert.equal(nativeJson(value), true, 'hash input must be entirely native JSON')
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (plainObject(value)) {
    return '{' + Object.keys(value).sort(compareText)
      .map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}'
  }
  return JSON.stringify(value)
}

const successful = value => {
  assert.equal(plainObject(value) && nativeJson(value), true, 'public result must be native JSON')
  assert.equal(value.apiVersion, '2')
  assert.notEqual(value.outcome, 'refused', JSON.stringify(value))
  return value
}

const refusal = (value, code) => {
  assert.equal(plainObject(value) && nativeJson(value), true, 'refusal must be native JSON')
  assert.equal(value.apiVersion, '2')
  assert.equal(value.outcome, 'refused')
  assert.equal(value.refusal.code, code)
  assert.equal(value.refusal.path, 'inquiryId')
  assert.notEqual(value.refusal.message.trim(), '')
  assert.equal(Object.hasOwn(value, 'events'), false, 'a refused export cannot publish a chosen trace')
  assert.equal(Object.hasOwn(value, 'state'), false, 'a refused export cannot publish a chosen state')
}

const fullExport = (handle, inquiryId) => {
  const exported = successful(Wire.exportInquiry(handle, {inquiryId, mode: 'full'}))
  assert.equal(exported.outcome, 'exported')
  assert.equal(exported.mode, 'full')
  assert.equal(exported.replayability, 'requires-external-inputs')
  assert.equal(exported.externalInputsComplete, false)
  assert.equal(typeof exported.replayabilityReason, 'string')
  assert.notEqual(exported.replayabilityReason.trim(), '')
  assert.equal(exported.inquiryId, inquiryId)
  assert.equal(typeof exported.revision, 'string')
  assert.equal(Array.isArray(exported.events), true)
  assert.ok(exported.events.length > 0)
  assert.equal(Array.isArray(exported.externalInputs), true)
  assert.ok(exported.externalInputs.length > 0, 'full trace cannot claim to include unresolved external inputs')
  assert.equal(exported.traceHash, digest(canonicalJson(exported.events)), 'trace hash covers complete ordered envelope objects')
  assert.equal(exported.stateHash, digest(canonicalJson(exported.state)), 'state hash covers the native complete state')
  assert.equal(exported.semanticHash, digest(canonicalJson(exported.inquiry)), 'semantic hash covers the native semantic view')
  assert.equal(exported.state.revision, exported.revision)
  assert.equal(exported.state.eventHead, exported.events.at(-1).event_id)
  for (let index = 0; index < exported.events.length; index++) {
    const event = exported.events[index]
    // durable-events-012: `payloads` appears exactly when the event carries
    // inline payload content; these Sphinx transitions reference none.
    assert.deepEqual(Object.keys(event).sort(), ['event_id', 'event_type', 'parents', 'payload', 'payload_refs', 'stream_id'])
    assert.equal(event.stream_id, 'sphinx-v2/' + inquiryId)
    assert.equal(event.event_type, 'sphinx/v2-transition@2')
    assert.deepEqual(event.parents, index === 0 ? [] : [exported.events[index - 1].event_id])
    assert.equal(event.payload.revision, String(index))
  }
  return exported
}

const storeEvent = event => ({
  id: event.event_id, stream: event.stream_id, type: event.event_type,
  parents: event.parents, payload: event.payload, payloadRefs: event.payload_refs,
})

const canonicalEvent = event => ({
  event_id: event.id, stream_id: event.stream, event_type: event.type,
  parents: event.parents, payload: event.payload, payload_refs: event.payloadRefs,
})

const journalBytes = commonDir => {
  const directory = join(commonDir, 'wanxiangshu', 'events')
  if (!existsSync(directory)) return []
  return readdirSync(directory).sort().map(name => ({
    name, bytes: readFileSync(join(directory, name)).toString('base64'),
  }))
}

async function withRuntime(scenario) {
  const root = mkdtempSync(join(tmpdir(), 'sphinx-native-hashes-'))
  const commonDir = join(root, '.git')
  mkdirSync(commonDir)
  const runtimes = new Set()
  const stores = new Set()
  let serial = 0
  const open = () => {
    const handle = Wire.create(commonDir, 'hash-runtime-' + (++serial), configuration)
    runtimes.add(handle)
    return handle
  }
  const close = handle => {
    Wire.dispose(handle)
    runtimes.delete(handle)
  }
  const openStore = () => {
    const handle = store.create(commonDir, 'hash-canonical-' + (++serial))
    stores.add(handle)
    return handle
  }
  try { await scenario({commonDir, open, close, openStore}) }
  finally {
    for (const handle of runtimes) Wire.dispose(handle)
    for (const handle of stores) store.dispose(handle)
    rmSync(root, {recursive: true, force: true})
  }
}

test('WHAT[sphinx-v2-020] same-length original goals produce distinct actual export hashes and native semantic views', async () => {
  await withRuntime(async ({open}) => {
    const handle = open()
    const texts = ['\n材料甲\r\n🙂é  ', '\n材料乙\r\n🙂é  ']
    assert.equal(Buffer.byteLength(texts[0]), Buffer.byteLength(texts[1]))
    const exports = []
    for (const [index, text] of texts.entries()) {
      const creation = successful(await Wire.start(handle, startArgs('goal-' + index, text)))
      const exported = fullExport(handle, creation.inquiryId)
      assert.equal(exported.events.length, 1)
      assert.equal(exported.state.goal.originalText, text)
      assert.equal(exported.inquiry.goal.originalText, text)
      assert.equal(exported.inquiry.goal.revision, '0')
      exports.push(exported)
    }
    assert.notEqual(exports[0].inquiryId, exports[1].inquiryId)
    for (const name of ['traceHash', 'stateHash', 'semanticHash']) {
      assert.notEqual(exports[0][name], exports[1][name], name + ' must change when original content changes')
    }
  })
})

test('WHAT[sphinx-v2-020] an actual other-writer append appears in ordered public trace and repeated reads preserve all journal bytes', async () => {
  await withRuntime(async ({commonDir, open, close, openStore}) => {
    const handle = open()
    const empty = journalBytes(commonDir)
    const creation = successful(await Wire.start(handle, startArgs('multievent', '\r\n原文及历史\n')))
    const initial = fullExport(handle, creation.inquiryId)
    const afterCreation = journalBytes(commonDir)
    assert.notDeepEqual(afterCreation, empty, 'a real creation is the positive control for journal observation')
    const canonical = openStore()
    const request = await append(canonical, batch(creation.inquiryId, 'external-cancel', [
      body('CancelRequested', {reason: 'explicit external controller request'}),
    ], storeEvent(initial.events[0])))
    const afterWrite = journalBytes(commonDir)
    assert.notDeepEqual(afterWrite, afterCreation, 'the observer must see a real later writer append')
    const refreshed = fullExport(handle, creation.inquiryId)
    assert.equal(refreshed.revision, '1')
    assert.equal(refreshed.status, 'cancelling')
    assert.deepEqual(refreshed.events, [initial.events[0], canonicalEvent(request)])
    assert.notEqual(refreshed.traceHash, initial.traceHash)
    assert.notEqual(refreshed.stateHash, initial.stateHash)
    const summary = successful(Wire.exportInquiry(handle, {inquiryId: creation.inquiryId, mode: 'summary'}))
    assert.equal(summary.mode, 'summary')
    assert.equal(summary.replayability, 'summary-only')
    for (const name of ['traceHash', 'stateHash', 'semanticHash']) assert.equal(summary[name], refreshed[name])
    for (const privateField of ['events', 'state']) assert.equal(Object.hasOwn(summary, privateField), false)
    for (let index = 0; index < 3; index++) {
      const status = successful(Wire.status(handle, {inquiryId: creation.inquiryId}))
      assert.equal(status.status, 'cancelling')
      assert.equal(status.revision, '1')
      assert.deepEqual(status.inquiry, refreshed.inquiry)
      assert.deepEqual(fullExport(handle, creation.inquiryId), refreshed)
      assert.deepEqual(Wire.exportInquiry(handle, {inquiryId: creation.inquiryId, mode: 'summary'}), summary)
    }
    assert.deepEqual(journalBytes(commonDir), afterWrite, 'status/export/refresh cannot append business facts or a new writer')
    close(handle)
    const reopened = open()
    assert.deepEqual(fullExport(reopened, creation.inquiryId), refreshed)
    assert.deepEqual(journalBytes(commonDir), afterWrite, 'cold replay and reads cannot rewrite the durable history')
  })
})

test('WHAT[sphinx-v2-020] actual physical work references change state and trace hashes while preserving semantic content', async () => {
  await withRuntime(async first => {
    await withRuntime(async second => {
      const handle = first.open()
      const created = successful(await Wire.start(handle, startArgs('physical-hash', 'same logical inquiry')))
      const origin = fullExport(handle, created.inquiryId).events[0]
      const copied = await store.append(second.openStore(), [storeEvent(origin)])
      assert.equal(copied.ok, true, JSON.stringify(copied.error))
      assert.deepEqual(copied.cuts, [])
      const other = second.open()
      assert.deepEqual(fullExport(other, created.inquiryId), fullExport(handle, created.inquiryId), 'both histories begin with the same accepted logical facts')
      const histories = []
      for (const [runtime, writer, physicalRef] of [
        [handle, first.openStore(), 'actual-adapter-A'],
        [other, second.openStore(), 'actual-adapter-B'],
      ]) {
        const spec = {...work('work-hash'), roundId: null, reserved: [{key: 'calls', value: 0}]}
        await append(writer, batch(created.inquiryId, 'record-physical-run', [
          body('WorkPlanned', {work: [spec]}),
          transition(spec.id, 'Planned', {case: 'Running', fence: spec.fence, physicalRef}),
        ], storeEvent(origin)))
        const exported = fullExport(runtime, created.inquiryId)
        assert.equal(exported.state.work[0].value.spec.physicalRef, physicalRef)
        assert.equal(exported.state.work[0].value.state.physicalRef, physicalRef)
        histories.push(exported)
      }
      assert.deepEqual(histories[0].inquiry, histories[1].inquiry)
      assert.equal(histories[0].semanticHash, histories[1].semanticHash)
      assert.notEqual(histories[0].stateHash, histories[1].stateHash)
      assert.notEqual(histories[0].traceHash, histories[1].traceHash)
    })
  })
})

test('WHAT[sphinx-v2-020] complete canonical dispatch bindings change full hashes and retain the same semantic view', async () => {
  await withRuntime(async first => {
    await withRuntime(async second => {
      const handle = first.open()
      const created = successful(await Wire.start(handle, startArgs('dispatch-hash', 'same logical goal')))
      const origin = storeEvent(fullExport(handle, created.inquiryId).events[0])
      const copied = await store.append(second.openStore(), [origin])
      assert.equal(copied.ok, true)
      assert.deepEqual(copied.cuts, [])
      const other = second.open()
      const histories = []
      for (const [runtime, writer, physicalRef] of [
        [handle, first.openStore(), 'host-child-A'],
        [other, second.openStore(), 'host-child-B'],
      ]) {
        const spec = {...work('dispatch-hash-work'), roundId: null, reserved: [{key: 'calls', value: 0}]}
        const request = {
          work: spec, dispatchIntentId: 'dispatch-hash-intent', publicEnvelope: envelope('{}'),
          privateTicket: envelope(JSON.stringify({hostOwner: physicalRef})),
        }
        const intent = await append(writer, batch(created.inquiryId, 'intent', [
          body('WorkPlanned', {work: [spec]}),
          transition(spec.id, 'Planned', {case: 'Ready'}),
          body('BudgetReserved', {
            reservation: {workId: spec.id, attempt: 1, resources: spec.reserved, moneyMinor: null},
            renderReserve: [{key: 'calls', value: 0}],
          }),
          body('DispatchRequested', request),
        ], origin))
        const pending = fullExport(runtime, created.inquiryId)
        const receipt = {
          workId: spec.id, attempt: 1, fence: spec.fence, dispatchIntentId: request.dispatchIntentId,
          physicalRef, receipt: envelope(JSON.stringify({transportReceipt: 'receipt-for-' + physicalRef})),
        }
        await append(writer, batch(created.inquiryId, 'receipt', [body('DispatchReceiptRecorded', receipt)], intent))
        const bound = fullExport(runtime, created.inquiryId)
        assert.deepEqual(bound.state.physicalBindings, [{key: request.dispatchIntentId, value: {request, receipt}}])
        assert.deepEqual(bound.inquiry, pending.inquiry)
        assert.equal(bound.semanticHash, pending.semanticHash)
        assert.notEqual(bound.stateHash, pending.stateHash)
        assert.notEqual(bound.traceHash, pending.traceHash)
        histories.push(bound)
      }
      assert.deepEqual(histories[0].inquiry, histories[1].inquiry)
      assert.equal(histories[0].semanticHash, histories[1].semanticHash)
      assert.notEqual(histories[0].stateHash, histories[1].stateHash)
      assert.notEqual(histories[0].traceHash, histories[1].traceHash)
      first.close(handle)
      assert.deepEqual(fullExport(first.open(), created.inquiryId), histories[0])
      second.close(other)
      assert.deepEqual(fullExport(second.open(), created.inquiryId), histories[1])
    })
  })
})

test('WHAT[sphinx-v2-020] unknown, semantically cut and forked inquiries never export a substituted trace', async () => {
  await withRuntime(async ({open, close, openStore}) => {
    let handle = open()
    for (const mode of ['summary', 'full']) {
      refusal(Wire.exportInquiry(handle, {inquiryId: 'never-created', mode}), 'UNKNOWN_INQUIRY')
    }
    refusal(Wire.status(handle, {inquiryId: 'never-created'}), 'UNKNOWN_INQUIRY')
    const cutCreation = successful(await Wire.start(handle, startArgs('cut', 'a cut remains visible')))
    const cutOrigin = fullExport(handle, cutCreation.inquiryId).events[0]
    const cutWriter = openStore()
    const damaged = prepare(cutWriter, batch(cutCreation.inquiryId, 'invalid-business-body', [
      body('CancelRequested', {reason: 'not an accepted prefix'}),
    ], storeEvent(cutOrigin)))
    damaged.payload.events.push(body('UnknownBody', {reason: 'must cut'}))
    const cutReceipt = await store.append(cutWriter, [damaged])
    assert.equal(cutReceipt.ok, true, JSON.stringify(cutReceipt.error))
    assert.equal(cutReceipt.cuts.length, 1)
    assert.equal(cutReceipt.cuts[0].failedEventId, damaged.id)
    const forkCreation = successful(await Wire.start(handle, startArgs('fork', 'both branches stay durable')))
    const forkOrigin = fullExport(handle, forkCreation.inquiryId).events[0]
    const leftWriter = openStore()
    const rightWriter = openStore()
    const left = prepare(leftWriter, batch(forkCreation.inquiryId, 'left-branch', [
      body('CancelRequested', {reason: 'left'}),
    ], storeEvent(forkOrigin)))
    const right = prepare(rightWriter, batch(forkCreation.inquiryId, 'right-branch', [
      body('InquirySuspended', {reason: 'right'}),
    ], storeEvent(forkOrigin)))
    for (const [writer, event] of [[leftWriter, left], [rightWriter, right]]) {
      const receipt = await store.append(writer, [event])
      assert.equal(receipt.ok, true, JSON.stringify(receipt.error))
      assert.deepEqual(receipt.cuts, [])
    }
    const forkReader = openStore()
    assert.deepEqual(store.heads(forkReader, forkOrigin.stream_id), [left.id, right.id].sort())
    assert.deepEqual(store.read(forkReader, left.id), left)
    assert.deepEqual(store.read(forkReader, right.id), right)
    for (let restart = 0; restart < 2; restart++) {
      for (const [inquiryId, code] of [
        [cutCreation.inquiryId, 'PERSISTENCE_SEMANTIC_CUT'],
        [forkCreation.inquiryId, 'DOMAIN_CONFLICT'],
      ]) {
        refusal(Wire.status(handle, {inquiryId}), code)
        for (const mode of ['summary', 'full']) refusal(Wire.exportInquiry(handle, {inquiryId, mode}), code)
      }
      close(handle)
      handle = open()
    }
  })
})
