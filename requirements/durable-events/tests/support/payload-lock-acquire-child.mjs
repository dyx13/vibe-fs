import assert from 'node:assert/strict'
import fs from 'node:fs'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const [mode, commonDir, writerId, scenario, requestJson] = process.argv.slice(2)
const request = JSON.parse(requestJson)
assert.ok(['measure', 'cold'].includes(mode))
const target = path.join(commonDir, 'wanxiangshu')
const sourceFile = path.join(target, 'events', `${request.sourceWriterId}.ndjson`)
const writerFile = path.join(target, 'events', `${writerId}.ndjson`)
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex')
const oldDigest = digest(request.oldBody)
const incomingDigest = digest(request.incomingBody)
const oldRef = 'blobs/' + oldDigest
const incomingRef = 'blobs/' + incomingDigest
const journalSurface = await import('../../../../dist/Persistence/Journal/Surface.js')
const eventStore = await import('../../../../dist/Persistence/EventStore/Surface.js')
const mustOk = result => {
  assert.equal(result.ok, true, JSON.stringify(result.error))
  return result
}
const open = async writer => mustOk(await journalSurface.JournalSurface_bootWithWriterId(
  commonDir, writer, 'payload-g1-' + writer, process.pid, new Date().toISOString())).journal
const sourceFacts = () => fs.readFileSync(sourceFile, 'utf8').trimEnd().split('\n').map(JSON.parse).map(event => ({
  id: event.event_id, stream: event.stream_id, type: event.event_type, parents: event.parents,
  payload: event.payload, payloadRefs: event.payload_refs,
}))
const views = (handle, facts) => facts.map(fact => ({ event: eventStore.read(handle, fact.id),
  head: eventStore.head(handle, fact.stream), heads: eventStore.heads(handle, fact.stream) }))
// durable-events-012: payloads are inline in the ndjson event line; there is
// no payloads directory. The physical observation is the event line itself.
const physical = () => ({ eventFiles: readdirSync(path.dirname(sourceFile)).sort(), writerCreated: existsSync(writerFile) })

async function cold() {
  assert.notEqual(writerId, request.sourceWriterId)
  const journal = await open(writerId)
  const handle = eventStore.create(commonDir, writerId + '-views')
  let operationFailure
  try {
    const facts = sourceFacts()
    const output = { pid: process.pid, current: journalSurface.JournalSurface_snapshot(journal),
      oldRead: await journalSurface.JournalSurface_readPayload(journal, oldRef),
      incomingRead: await journalSurface.JournalSurface_readPayload(journal, incomingRef),
      factRefs: facts.map(fact => fact.payloadRefs), physical: physical() }
    assert.equal(output.physical.writerCreated, false)
    assert.equal(fs.existsSync(path.join(target, 'events', `${writerId}-views.ndjson`)), false)
    return output
  } catch (error) {
    operationFailure = { error }
    throw error
  } finally {
    const cleanupFailures = []
    try {
      journalSurface.JournalSurface_dispose(journal)
    } catch (error) {
      cleanupFailures.push(error)
    }
    try {
      eventStore.dispose(handle)
    } catch (error) {
      cleanupFailures.push(error)
    }
    if (cleanupFailures.length > 0) {
      throw new AggregateError(operationFailure === undefined ? cleanupFailures : [operationFailure.error, ...cleanupFailures],
        'payload cold fixture cleanup failed', { cause: operationFailure?.error })
    }
  }
}

async function measure() {
  assert.notEqual(writerId, request.sourceWriterId)
  assert.notEqual(oldDigest, incomingDigest)
  let seedJournal
  let journal
  let handle
  let output
  let operationFailure
  const cleanupFailures = []
  try {
    seedJournal = await open(request.sourceWriterId)
    const oldReceipt = mustOk(await journalSurface.JournalSurface_writePayload(seedJournal, request.oldBody))
    assert.equal(oldReceipt.blobRef, oldRef)
    assert.equal(oldReceipt.blobDigest, oldDigest)
    mustOk(await journalSurface.JournalSurface_appendAgent(seedJournal,
      { kind: 'Session', session: request.sessionId }, null,
      { family: 'Companion', case: 'TerminalOutputCaptured', payload: { SessionId: request.sessionId,
        TextRef: oldRef, TextDigest: oldDigest, ProviderRun: 'payload-g1-seed-run' } }))
    assert.equal(journalSurface.JournalSurface_hasSession(seedJournal, request.sessionId), true)
    journalSurface.JournalSurface_dispose(seedJournal)
    seedJournal = undefined

    // The seed event line must embed the old payload inline (durable-events-012).
    const seedLines = fs.readFileSync(sourceFile, 'utf8').trimEnd().split('\n').map(JSON.parse)
    const seedEvent = seedLines.at(-1)
    assert.equal(seedEvent.payload_refs.length, 1)
    assert.equal(seedEvent.payload_refs[0], oldDigest)
    assert.equal(seedEvent.payloads[oldDigest], Buffer.from(request.oldBody, 'utf8').toString('base64'))
    assert.equal(fs.existsSync(path.join(target, 'payloads')), false,
      'ndjson is the only carrier; no payloads directory may exist')

    journal = await open(writerId)
    handle = eventStore.create(commonDir, writerId + '-views')
    const beforeCurrent = journalSurface.JournalSurface_snapshot(journal)
    const before = physical()
    const facts = sourceFacts()
    const beforeViews = views(handle, facts)
    assert.ok(beforeCurrent.sessions.includes(request.sessionId))
    assert.deepEqual(beforeCurrent.sessionProjections[request.sessionId].xTrace,
      { openingPresent: false, partCount: 0, latestTerminalPresent: true })
    assert.deepEqual(beforeViews, facts.map(fact => ({ event: fact, head: fact.id, heads: [fact.id] })))
    assert.equal(facts.length, 2)
    assert.deepEqual(facts.at(-1).payloadRefs, [oldDigest])
    assert.deepEqual(before.eventFiles, [`${request.sourceWriterId}.ndjson`])
    assert.equal(before.writerCreated, false)

    // WritePayload stages in memory; ReadPayload serves the staged bytes even
    // before any append embeds them (durable-events-012).
    const staged = mustOk(await journalSurface.JournalSurface_writePayload(journal, request.incomingBody))
    assert.equal(staged.blobRef, incomingRef)
    assert.equal(staged.blobDigest, incomingDigest)
    assert.equal(fs.existsSync(path.join(target, 'payloads')), false,
      'staged inline payloads never create a payloads directory')

    const afterCurrent = journalSurface.JournalSurface_snapshot(journal)
    assert.deepEqual(afterCurrent, beforeCurrent)
    output = { pid: process.pid, result: staged, observed: { append: 0, payloadWrite: 0, payloadFsync: 0,
      payloadClose: 0, release: 0, injected: 0 }, oldDigest, incomingDigest, before, physical: physical(),
      beforeCurrent, afterCurrent,
      factRefs: facts.map(fact => fact.payloadRefs),
      payloadBeforeRelease: false, oldRead: await journalSurface.JournalSurface_readPayload(journal, oldRef),
      incomingRead: await journalSurface.JournalSurface_readPayload(journal, incomingRef) }
  } catch (error) {
    operationFailure = { error }
  } finally {
    try {
      if (seedJournal !== undefined) journalSurface.JournalSurface_dispose(seedJournal)
    } catch (error) {
      cleanupFailures.push(error)
    }
    try {
      if (journal !== undefined) journalSurface.JournalSurface_dispose(journal)
    } catch (error) {
      cleanupFailures.push(error)
    }
    try {
      if (handle !== undefined) eventStore.dispose(handle)
    } catch (error) {
      cleanupFailures.push(error)
    }
  }
  if (cleanupFailures.length > 0) {
    throw new AggregateError(operationFailure === undefined ? cleanupFailures : [operationFailure.error, ...cleanupFailures],
      'payload lock fixture cleanup failed', { cause: operationFailure?.error })
  }
  if (operationFailure !== undefined) throw operationFailure.error
  return output
}

process.stdout.write(JSON.stringify(mode === 'measure' ? await measure() : await cold(),
  (_key, value) => typeof value === 'bigint' ? value.toString() : value))
