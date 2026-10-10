import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  store, persistence, digest, body, envelope, createdBody, work, transition,
  accepted, batch, current, mustOk,
} from './persistence-support.mjs'

export const interpretationInquiry = 'interpretation-inquiry'
export const interpretationWork = 'interpretation-work'
export const interpretationObservation = 'interpretation-observation'
export const rawObservation = body('ResultAccepted', {
  ...accepted(interpretationWork, interpretationObservation).payload,
  canonicalResult: '{"answer":"原始回答\\r\\n不改写"}',
})
export const interpretationPending = body('InterpretationPending', {
  observationId: interpretationObservation, workId: interpretationWork, attempt: 1,
})
export const interpretationApplied = body('InterpretationApplied', {
  observationId: interpretationObservation, interpretationId: 'interpretation-receipt',
  pluginRef: 'proof-plugin@original', delta: envelope('{"interpretation":"原解释"}'),
})
export const interpretationFailed = body('InterpretationFailed', {
  observationId: interpretationObservation, interpretationId: 'interpretation-receipt',
  pluginRef: 'proof-plugin@original', reason: '插件失败\r\n原异常理由保留',
})
export const interpretationRunningBodies = () => [
  createdBody('只恢复纯解释，不买第二个回答'),
  body('WorkPlanned', { work: [{ ...work(interpretationWork), roundId: null }] }),
  body('BudgetReserved', {
    reservation: { workId: interpretationWork, attempt: 1, resources: [{ key: 'calls', value: 1 }], moneyMinor: null },
    renderReserve: [{ key: 'calls', value: 1 }],
  }),
  transition(interpretationWork, 'Planned', {
    case: 'Running', fence: interpretationWork + ':1:logical', physicalRef: 'interpretation-physical',
  }),
]
export const interpretationSeedBodies = () => [
  ...interpretationRunningBodies(), rawObservation, interpretationPending,
]
export const pendingInterpretationRecord = {
  observationId: interpretationObservation, workId: interpretationWork, attempt: 1,
  interpretationId: null, pluginRef: null, status: 'pending', reason: null,
}
export const appliedInterpretationRecord = {
  ...pendingInterpretationRecord,
  interpretationId: interpretationApplied.payload.interpretationId,
  pluginRef: interpretationApplied.payload.pluginRef, status: 'applied',
  delta: interpretationApplied.payload.delta,
}
export const failedInterpretationRecord = {
  ...pendingInterpretationRecord,
  interpretationId: interpretationFailed.payload.interpretationId,
  pluginRef: interpretationFailed.payload.pluginRef, status: 'failed',
  reason: interpretationFailed.payload.reason,
}
export const interpretationRecord = result => mustOk(result).interpretations.find(
  entry => entry.key === interpretationObservation,
)?.value
export const journalBytes = commonDir => {
  const directory = join(commonDir, 'wanxiangshu', 'events')
  return readdirSync(directory).filter(name => name.endsWith('.ndjson')).sort().map(
    name => [name, readFileSync(join(directory, name)).toString('base64')],
  )
}
export const expectInterpretationRefusal = (writer, parent, events, commonDir, message = /interpretation|observation|work|attempt/i) => {
  const before = current(writer, interpretationInquiry)
  const bytes = journalBytes(commonDir)
  const result = persistence.prepareTransition(writer, digest, batch(
    interpretationInquiry, 'refused-interpretation', events, parent,
  ))
  assert.equal(result.ok, false, 'invalid interpretation facts must refuse their whole transition')
  assert.equal(result.error.code, 'TRANSITION_REJECTED')
  assert.match(result.error.message, message)
  assert.equal(Object.hasOwn(result, 'value'), false)
  assert.deepEqual(current(writer, interpretationInquiry), before, 'a valid prefix must not become Current')
  assert.deepEqual(store.heads(writer, parent.stream), [parent.id])
  assert.deepEqual(journalBytes(commonDir), bytes, 'a rejected preparation must not append bytes')
}
