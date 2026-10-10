import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as eventStore from '../../../../dist/Persistence/EventStore/Surface.js'
import * as casebook from '../../../../dist/Repository/Knowledge/Casebook/Surface.js'

const [directory, requestJson] = process.argv.slice(2)
const request = JSON.parse(requestJson)
const before = { ...request.before, accessOrder: BigInt(request.before.accessOrder), lastAccessOrder: BigInt(request.before.lastAccessOrder) }
const writerId = 'independent-cold-reader'
const eventsDirectory = join(directory, 'wanxiangshu', 'events')
const handle = eventStore.create(directory, writerId)
try {
  assert.deepEqual(readFileSync(join(eventsDirectory, 'setup.ndjson')).toString('base64'), request.setupBytes)
  assert.deepEqual(readFileSync(join(eventsDirectory, `${request.writer}.ndjson`)).toString('base64'), request.operationBytes)
  let expected = before
  if (request.refreshed === undefined) {
    const badFact = eventStore.read(handle, request.failedEventId)
    const cutFact = eventStore.read(handle, request.cutEventId)
    assert.equal(badFact.id, request.failedEventId)
    assert.deepEqual(badFact.payload, {})
    assert.equal(cutFact.type, 'ProjectionCutTail')
    assert.equal(cutFact.payload.rule, 'Casebook')
    assert.equal(cutFact.payload.failed_event_id, badFact.id)
    assert.deepEqual(cutFact.parents, [badFact.id])
  } else {
    const { fact, maintenanceFileState, targetPayloadRef, targetPayloadBytes } = request.refreshed
    assert.equal(fact.type, 'EngineerCaseRefreshed')
    assert.deepEqual(eventStore.read(handle, fact.id), fact)
    assert.equal(eventStore.head(handle, fact.stream), fact.id)
    assert.deepEqual(eventStore.heads(handle, fact.stream), [fact.id])
    assert.notEqual(maintenanceFileState, request.baseline)
    assert.equal(fact.payload.maintenance_file_state, maintenanceFileState)
    const targetEntry = JSON.parse(maintenanceFileState)['subject.txt']
    assert.equal(targetEntry.kind, 'Present')
    assert.equal(targetEntry.payloadRef, targetPayloadRef)
    assert.notEqual(targetPayloadRef, request.payloadRef)
    assert.equal(Buffer.from(await eventStore.readPayload(handle, targetPayloadRef)).toString('base64'), targetPayloadBytes)
    assert.equal(before.accessOrder, 0n)
    assert.equal(before.lastAccessOrder, 0n)
    expected = { ...before, q: fact.payload.q, a: fact.payload.a, maintenanceFileState,
      accessOrder: 1n, lastAccessOrder: 1n }
  }
  const current = await casebook.fetchCaseByIdentity(handle, request.identity)
  assert.deepEqual(current, expected)
  if (request.missingIdentity !== undefined) {
    assert.equal(await casebook.fetchCaseByIdentity(handle, request.missingIdentity), null)
  }
  assert.equal(current.completionFileState, request.baseline)
  assert.equal(current.maintenanceFileState, expected.maintenanceFileState)
  assert.equal(Buffer.from(await eventStore.readPayload(handle, request.payloadRef)).toString('base64'), request.payloadBytes)
  assert.deepEqual(readdirSync(eventsDirectory).sort(), ['setup.ndjson', `${request.writer}.ndjson`].sort())
  assert.equal(existsSync(join(eventsDirectory, `${writerId}.ndjson`)), false)
  assert.equal(existsSync(join(directory, 'wanxiangshu.lock')), false)
  process.stdout.write(JSON.stringify({ pid: process.pid,
    current: { ...current, accessOrder: current.accessOrder.toString(), lastAccessOrder: current.lastAccessOrder.toString() },
    writerId, missingIdentity: request.missingIdentity }) + '\n')
} finally {
  eventStore.dispose(handle)
}
