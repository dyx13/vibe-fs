import assert from 'node:assert/strict'
import test from 'node:test'
import * as surface from '../../../dist/Mission/Planning/Surface.js'
import { isAllowed } from '../../../dist/Participant/Persona/OfficeCapabilitySurface.js'
import {
  assistantText,
  cursors,
  ids,
  msgId,
  msgRole,
  msgText,
  syntheticLwr,
  userText,
} from './support/plan-messages.mjs'

// WHAT[planning-001] fixes the closed input set a Plan runner receives:
// U (verbatim, original order), LWR_prev (materialized, empty on the first
// tenure) and P (the only writable surface, reached through js-plan only).
// The assembly entry below is the same PlanningSurface.assembleTenureMessages
// the transform pipeline calls. It now takes the canonical 4th argument
// messageCursors (plain id -> bigint first-observation evidence); the
// materializePrev callback returns the previous work record for a valid
// previous range.

const assemble = (rawMessages, tenure, materializePrev, messageCursors) =>
  surface.PlanningSurface.assembleTenureMessages(rawMessages, tenure, materializePrev, messageCursors)

test('WHAT[planning-001] U messages are preserved verbatim in original order', () => {
  const rawMessages = [
    userText('u-1', '设计缓存架构\n第二行'),
    assistantText('a-old', 'previous tenure work', 'u-1'),
    userText('u-2', '补充约束: no cache invalidation'),
    assistantText('a-new', 'current tenure work', 'u-2'),
  ]
  const tenure = {
    workId: 'w-001-inputs',
    incumbencyId: 'inc-2',
    stage: 'S2',
    openingCursor: 20n,
    previousRange: [7n, 19n],
    isFreshHandover: false,
  }
  const result = assemble(
    rawMessages,
    tenure,
    () => '# Previous record',
    cursors({ 'a-old': 15n, 'a-new': 30n }),
  )
  // U messages are preserved verbatim, in original order, and the LWR record
  // is injected after them (before the first current interaction).
  const userContents = result.messages
    .filter((m) => msgRole(m) === 'user' && !msgId(m).startsWith('lwr-prev-'))
    .map(msgText)
  assert.deepEqual(userContents, ['设计缓存架构\n第二行', '补充约束: no cache invalidation'])
})

test('WHAT[planning-001] first tenure receives no LWR_prev materialization', () => {
  const rawMessages = [userText('u-1', 'go')]
  const tenure = {
    workId: 'w-001-inputs',
    incumbencyId: 'inc-1',
    stage: 'S1',
    openingCursor: 0n,
    previousRange: null,
    isFreshHandover: true,
  }
  let materializeCalls = 0
  const result = assemble(rawMessages, tenure, () => {
    materializeCalls += 1
    return 'must not appear'
  }, {})
  assert.equal(materializeCalls, 0, 'first tenure must not materialize a previous record')
  assert.ok(
    !result.messages.some((m) => msgId(m).startsWith('lwr-prev-')),
    'first tenure must not carry an LWR_prev message',
  )
  assert.equal(result.messages.length, 1)
  assert.equal(msgId(result.messages[0]), 'u-1')
})

test('WHAT[planning-001] assembled messages come only from U, LWR_prev and current-tenure interactions', () => {
  const rawMessages = [
    userText('u-1', 'go'),
    assistantText('a-1', 'current work', 'u-1'),
  ]
  const tenure = {
    workId: 'w-001-inputs',
    incumbencyId: 'inc-2',
    stage: 'S2',
    openingCursor: 20n,
    previousRange: [7n, 19n],
    isFreshHandover: false,
  }
  const result = assemble(
    rawMessages,
    tenure,
    () => 'prev record',
    cursors({ 'a-1': 30n }),
  )
  const inputIds = new Set(rawMessages.map(msgId))
  for (const m of result.messages) {
    assert.ok(
      inputIds.has(msgId(m)) || msgId(m).startsWith('lwr-prev-'),
      `assembled message id ${msgId(m)} must originate from the input messages or the LWR_prev record`,
    )
  }
  // The draft P is reachable only through the js-plan tool surface; the
  // assembled request never carries its content as an injected message.
  assert.equal(result.messages.length, rawMessages.length + 1)
})

test('WHAT[planning-001] the plan runner holds no write capability beyond P', () => {
  for (const perm of ['Write', 'Edit', 'Move', 'Remove', 'Exec', 'Pty']) {
    assert.equal(isAllowed('plan', perm), false, `plan must be denied ${perm}`)
  }
  // P itself is reached through the js-plan programming surface.
  assert.equal(isAllowed('plan', 'JsPlan'), true)
})

test('WHAT[planning-001] a non-empty previous range with empty materialized record rejects assembly', () => {
  const rawMessages = [
    userText('u-1', 'go'),
    assistantText('a-1', 'current work', 'u-1'),
  ]
  const tenure = {
    workId: 'w-001-inputs',
    incumbencyId: 'inc-2',
    stage: 'S2',
    openingCursor: 20n,
    previousRange: [7n, 19n],
    isFreshHandover: false,
  }
  // A valid non-empty previous range MUST materialize a real LWR_prev; an
  // empty/whitespace record is a missing required record and must fail closed.
  assert.throws(
    () => assemble(rawMessages, tenure, () => '   ', cursors({ 'a-1': 30n })),
    /previous work record is unavailable/i,
  )
})

test('WHAT[planning-001] an empty previous range contributes no LWR_prev', () => {
  const rawMessages = [userText('u-1', 'go')]
  const tenure = {
    workId: 'w-001-inputs',
    incumbencyId: 'inc-2',
    stage: 'S2',
    openingCursor: 20n,
    previousRange: [20n, 20n],
    isFreshHandover: false,
  }
  const result = assemble(rawMessages, tenure, () => 'unused', {})
  assert.ok(
    !result.messages.some((m) => msgId(m).startsWith('lwr-prev-')),
    'an empty previous range must not inject an LWR_prev record',
  )
  assert.deepEqual(ids(result.messages), ['u-1'])
})

test('WHAT[planning-001] synthetic previous LWR rows are stripped before the single current record', () => {
  const rawMessages = [
    userText('u-1', 'go'),
    syntheticLwr('inc-old', 'w-001', 'old synthesized previous row'),
    assistantText('a-1', 'current work', 'u-1'),
  ]
  const tenure = {
    workId: 'w-001-inputs',
    incumbencyId: 'inc-2',
    stage: 'S2',
    openingCursor: 20n,
    previousRange: [7n, 19n],
    isFreshHandover: false,
  }
  const result = assemble(
    rawMessages,
    tenure,
    () => '# Fresh current record',
    cursors({ 'a-1': 30n }),
  )
  const lwrRows = result.messages.filter((m) => msgId(m).startsWith('lwr-prev-'))
  assert.equal(lwrRows.length, 1, 'exactly one current LWR_prev record is injected')
  assert.equal(msgText(lwrRows[0]), '# Fresh current record')
  // The old synthetic row is gone; the fresh record is the only one.
  assert.ok(!result.messages.some((m) => msgId(m) === 'lwr-prev-inc-old'))
})