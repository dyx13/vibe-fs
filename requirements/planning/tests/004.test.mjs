import assert from 'node:assert/strict'
import test from 'node:test'
import * as planning from '../../../dist/Mission/Planning/Surface.js'

const openActive = (workId, incId, stage) => {
  let state = planning.empty()
  state = planning.applyWorkEvent(planning.workOpened(workId, '/root'), state).state
  state = planning.applyWorkEvent(planning.incumbencyOpened(workId, incId, stage, 0n), state).state
  return state
}

test('WHAT[planning-004] stage advances only through PlanReviewed(Promoted): S1 -> S2 -> S3 -> authorized', () => {
  // S1 incumbency
  let state = openActive('work-1', 'inc-1', 'S1')
  assert.equal(planning.activeStage(state), 'S1')

  // PlanReviewed(Stayed) leaves the stage unchanged
  const stayed = planning.applyWorkEvent(planning.reviewed('inc-1', 'S1', 'Stayed'), state)
  assert.equal(stayed.ok, true)
  assert.equal(planning.activeStage(stayed.state), 'S1', 'Stayed must not advance the stage')

  // PlanReviewed(Promoted) advances the active tenure S1 -> S2
  const promoted1 = planning.applyWorkEvent(planning.reviewed('inc-1', 'S1', 'Promoted'), state)
  assert.equal(promoted1.ok, true)
  assert.equal(planning.activeStage(promoted1.state), 'S2')
  assert.notEqual(promoted1.state.Active.Authorized, true, 'S1 promotion grants a stage, not authorization')

  // The same incumbency cannot review a second time; a relay swaps the tenure
  let s2 = planning.applyWorkEvent(
    planning.incumbencyRetired('inc-1', 'Relayed', 10n),
    promoted1.state,
  ).state
  s2 = planning.applyWorkEvent(planning.incumbencyOpened('work-1', 'inc-2', 'S2', 11n), s2).state
  assert.equal(planning.activeStage(s2), 'S2', 'relay must keep the stage of the retired tenure')

  // PlanReviewed(Promoted) advances the second tenure S2 -> S3
  const promoted2 = planning.applyWorkEvent(planning.reviewed('inc-2', 'S2', 'Promoted'), s2)
  assert.equal(promoted2.ok, true)
  assert.equal(planning.activeStage(promoted2.state), 'S3')
  assert.notEqual(promoted2.state.Active.Authorized, true, 'S3 tenure must be unauthorized before its own review')

  // A second relay brings a third tenure at S3
  let s3 = planning.applyWorkEvent(
    planning.incumbencyRetired('inc-2', 'Relayed', 20n),
    promoted2.state,
  ).state
  s3 = planning.applyWorkEvent(planning.incumbencyOpened('work-1', 'inc-3', 'S3', 21n), s3).state

  // PlanReviewed(Promoted) at S3 grants delivery authorization instead of a fourth stage
  const promoted3 = planning.applyWorkEvent(planning.reviewed('inc-3', 'S3', 'Promoted'), s3)
  assert.equal(promoted3.ok, true)
  assert.equal(planning.activeStage(promoted3.state), 'S3', 'S3 promotion grants authorization, not a new stage')
  assert.equal(promoted3.state.Active.Authorized, true, 'S3 promotion must set Authorized = true')
})

test('WHAT[planning-004] state is orthogonal to stage: delivered and reopened do not touch the stage', () => {
  // Build an authorized S3 tenure through the full ladder and deliver it
  let state = openActive('work-2', 'inc-9', 'S1')
  state = planning.applyWorkEvent(planning.reviewed('inc-9', 'S1', 'Promoted'), state).state
  state = planning.applyWorkEvent(planning.incumbencyRetired('inc-9', 'Relayed', 10n), state).state
  state = planning.applyWorkEvent(planning.incumbencyOpened('work-2', 'inc-10', 'S2', 11n), state).state
  state = planning.applyWorkEvent(planning.reviewed('inc-10', 'S2', 'Promoted'), state).state
  state = planning.applyWorkEvent(planning.incumbencyRetired('inc-10', 'Relayed', 20n), state).state
  state = planning.applyWorkEvent(planning.incumbencyOpened('work-2', 'inc-11', 'S3', 21n), state).state
  state = planning.applyWorkEvent(planning.reviewed('inc-11', 'S3', 'Promoted'), state).state
  assert.equal(state.Active.Authorized, true)

  state = planning.applyWorkEvent(planning.incumbencyRetired('inc-11', 'Delivered', 30n), state).state
  state = planning.applyWorkEvent(
    planning.delivered('inc-11', 'work-2', 'sha256-x', 'plan.md', 'exec-1'),
    state,
  ).state
  assert.equal(planning.isDelivered(state), true)

  // Reopen restores the same tenure at the same stage with the same authorization
  const reopened = planning.applyWorkEvent(planning.reopened('inc-11'), state)
  assert.equal(reopened.ok, true)
  assert.equal(planning.isDelivered(reopened.state), false)
  assert.equal(planning.activeStage(reopened.state), 'S3')
  assert.equal(reopened.state.Active.Id, 'inc-11')
  assert.equal(reopened.state.Active.Authorized, true, 'reopened tenure must keep its authorization')
})

test('WHAT[planning-004] illegal stage and review transitions are rejected by the fold', () => {
  // Reviewed against an unknown incumbency is rejected
  const state = openActive('work-3', 'inc-1', 'S1')
  const ghost = planning.applyWorkEvent(planning.reviewed('inc-ghost', 'S1', 'Promoted'), state)
  assert.equal(ghost.ok, false, 'review of an unknown incumbency must be rejected')

  // Reviewed against a retired incumbency is rejected
  let retired = planning.applyWorkEvent(planning.reviewed('inc-1', 'S1', 'Promoted'), state).state
  retired = planning.applyWorkEvent(planning.incumbencyRetired('inc-1', 'Relayed', 10n), retired).state
  const lateReview = planning.applyWorkEvent(planning.reviewed('inc-1', 'S1', 'Promoted'), retired)
  assert.equal(lateReview.ok, false, 'review of a retired incumbency must be rejected')

  // A successor opened at a stage different from the retired stage is rejected
  const successorWrongStage = planning.applyWorkEvent(
    planning.incumbencyOpened('work-3', 'inc-2', 'S3', 11n),
    retired,
  )
  assert.equal(successorWrongStage.ok, false, 'relay successor must open at the retired stage (S2), not skip to S3')
})
