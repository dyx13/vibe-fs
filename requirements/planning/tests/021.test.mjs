import assert from 'node:assert/strict'
import test from 'node:test'
import * as planning from '../../../dist/Mission/Planning/Surface.js'

// Build the ladder to an authorized S3 tenure, then deliver it.
const buildDelivered = (workId) => {
  let state = planning.empty()
  state = planning.applyWorkEvent(planning.workOpened(workId, '/root'), state).state
  state = planning.applyWorkEvent(planning.incumbencyOpened(workId, 'inc-1', 'S1', 0n), state).state
  state = planning.applyWorkEvent(planning.reviewed('inc-1', 'S1', 'Promoted'), state).state
  state = planning.applyWorkEvent(planning.incumbencyRetired('inc-1', 'Relayed', 10n), state).state
  state = planning.applyWorkEvent(planning.incumbencyOpened(workId, 'inc-2', 'S2', 11n), state).state
  state = planning.applyWorkEvent(planning.reviewed('inc-2', 'S2', 'Promoted'), state).state
  state = planning.applyWorkEvent(planning.incumbencyRetired('inc-2', 'Relayed', 20n), state).state
  state = planning.applyWorkEvent(planning.incumbencyOpened(workId, 'inc-3', 'S3', 21n), state).state
  state = planning.applyWorkEvent(planning.reviewed('inc-3', 'S3', 'Promoted'), state).state
  state = planning.applyWorkEvent(planning.incumbencyRetired('inc-3', 'Delivered', 30n), state).state
  state = planning.applyWorkEvent(planning.delivered('inc-3', workId, 'sha-1', 'plan.md', 'exec-1'), state).state
  return state
}

test('WHAT[planning-021] reprompt reopens the delivered work to active, reusing the original tenure', () => {
  const state = buildDelivered('work-21')
  assert.equal(planning.isDelivered(state), true)
  assert.equal(state.Active, undefined, 'delivery clears the active incumbency')

  // The user reprompts: the system appends PlanReopened with the delivered incumbency
  const reopened = planning.applyWorkEvent(planning.reopened('inc-3'), state)
  assert.equal(reopened.ok, true)
  assert.equal(planning.isDelivered(reopened.state), false, 'reopen must clear the delivered state')
  assert.equal(reopened.state.Active.Id, 'inc-3', 'reopen must reuse the original incumbency, not open a new one')
  assert.equal(planning.activeStage(reopened.state), 'S3', 'reopen must keep the stage')
  assert.equal(reopened.state.Active.Authorized, true, 'reopen must keep the authorization')

  // The retired history is never rewritten
  assert.equal(planning.retiredCount(reopened.state), 3)
})

test('WHAT[planning-021] a reopened work can deliver again, forming a full second cycle', () => {
  let state = buildDelivered('work-21b')
  state = planning.applyWorkEvent(planning.reopened('inc-3'), state).state

  // The model revises P and delivers a second time on the same tenure
  const secondRetirement = planning.applyWorkEvent(planning.incumbencyRetired('inc-3', 'Delivered', 40n), state)
  assert.equal(secondRetirement.ok, true, 'a reopened tenure may retire Delivered again')

  const secondDelivery = planning.applyWorkEvent(planning.delivered('inc-3', 'work-21b', 'sha-2', 'plan.md', 'exec-2'), secondRetirement.state)
  assert.equal(secondDelivery.ok, true)
  assert.equal(planning.isDelivered(secondDelivery.state), true)
  assert.equal(secondDelivery.state.Delivered.ExecSessionId, 'exec-2', 'each cycle records its own execution session')

  // A second reopen restores the same tenure again
  const reopenedAgain = planning.applyWorkEvent(planning.reopened('inc-3'), secondDelivery.state)
  assert.equal(reopenedAgain.ok, true)
  assert.equal(reopenedAgain.state.Active.Id, 'inc-3')
  assert.equal(reopenedAgain.state.Active.Authorized, true)
})

test('WHAT[planning-021] reopening without a delivery is rejected', () => {
  let state = planning.empty()
  state = planning.applyWorkEvent(planning.workOpened('work-21c', '/root'), state).state
  state = planning.applyWorkEvent(planning.incumbencyOpened('work-21c', 'inc-1', 'S1', 0n), state).state

  // An active, never-delivered work cannot be reopened
  const reopenActive = planning.applyWorkEvent(planning.reopened('inc-1'), state)
  assert.equal(reopenActive.ok, false, 'reopen requires an existing delivery')

  // A relayed retirement is not a delivery either
  let relayed = planning.applyWorkEvent(planning.reviewed('inc-1', 'S1', 'Stayed'), state).state
  relayed = planning.applyWorkEvent(planning.incumbencyRetired('inc-1', 'Relayed', 10n), relayed).state
  const reopenRelayed = planning.applyWorkEvent(planning.reopened('inc-1'), relayed)
  assert.equal(reopenRelayed.ok, false, 'reopen requires a Delivered retirement, not a Relayed one')
})

test('WHAT[planning-021] reopen preserves the tenure predecessor range and never mistakes its own delivery for the predecessor', () => {
  // inc-3 opened as the S3 successor from inc-2's retirement, so its
  // PredecessorRange is inc-2's consumed range [10n, 20n]. That predecessor
  // range must survive inc-3's own Delivered retirement and the reopen — the
  // reopen must not treat inc-3's own delivery record as the predecessor.
  let state = planning.empty()
  state = planning.applyWorkEvent(planning.workOpened('work-21d', '/root'), state).state
  state = planning.applyWorkEvent(planning.incumbencyOpened('work-21d', 'inc-1', 'S1', 0n), state).state
  state = planning.applyWorkEvent(planning.reviewed('inc-1', 'S1', 'Promoted'), state).state
  state = planning.applyWorkEvent(planning.incumbencyRetired('inc-1', 'Relayed', 10n), state).state
  state = planning.applyWorkEvent(planning.incumbencyOpened('work-21d', 'inc-2', 'S2', 10n), state).state
  // Every successor inherits the retired tenure's consumed range as its
  // PredecessorRange; inc-2 inherits inc-1's [0n, 10n].
  assert.deepEqual(planning.predecessorRange(state), [0n, 10n], 'a successor tenure must carry a predecessor range')

  // inc-2 promotes to S3 and relays to inc-3; inc-3 opens at S3 with inc-2's
  // consumed range [10n, 20n] as its predecessor, is reviewed to grant
  // delivery authorization (planning-004), then delivers.
  state = planning.applyWorkEvent(planning.reviewed('inc-2', 'S2', 'Promoted'), state).state
  state = planning.applyWorkEvent(planning.incumbencyRetired('inc-2', 'Relayed', 20n), state).state
  state = planning.applyWorkEvent(planning.incumbencyOpened('work-21d', 'inc-3', 'S3', 20n), state).state
  assert.deepEqual(planning.predecessorRange(state), [10n, 20n])
  state = planning.applyWorkEvent(planning.reviewed('inc-3', 'S3', 'Promoted'), state).state
  state = planning.applyWorkEvent(planning.incumbencyRetired('inc-3', 'Delivered', 30n), state).state
  state = planning.applyWorkEvent(planning.delivered('inc-3', 'work-21d', 'sha-3', 'plan.md', 'exec-3'), state).state

  // Reopen restores inc-3 with the predecessor range it inherited at opening
  // ([10n, 20n], inc-2's consumed range), never inc-3's own delivery range.
  const reopened = planning.applyWorkEvent(planning.reopened('inc-3'), state)
  assert.equal(reopened.ok, true)
  assert.equal(reopened.state.Active.Id, 'inc-3')

  // The fold must keep the predecessor range that was set at inc-3's opening
  // (inc-2's consumed range), never inc-3's own delivery record.
  assert.deepEqual(planning.predecessorRange(reopened.state), [10n, 20n], 'reopen must preserve the predecessor range')
  // LatestRetirement still records inc-3's own delivered range for the same
  // incumbent; it is not the predecessor.
  assert.deepEqual(planning.latestRetirementRange(reopened.state), [20n, 30n])
})
