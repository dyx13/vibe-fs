import assert from 'node:assert/strict'
import test from 'node:test'
import * as planning from '../../../dist/Mission/Planning/Surface.js'

// WHAT[planning-003]/[004]: stage advances only through PlanReviewed(Promoted)
// and each incumbency carries at most one review, so reaching an authorized S3
// tenure requires the full ladder: review promotes in place, relay swaps the
// tenure at the same stage.
const buildAuthorizedS3 = (workId) => {
  let state = planning.empty()
  state = planning.applyWorkEvent(planning.workOpened(workId, '/repo/root'), state).state
  state = planning.applyWorkEvent(planning.incumbencyOpened(workId, 'inc-1', 'S1', 0n), state).state
  state = planning.applyWorkEvent(planning.reviewed('inc-1', 'S1', 'Promoted'), state).state
  state = planning.applyWorkEvent(planning.incumbencyRetired('inc-1', 'Relayed', 10n), state).state
  state = planning.applyWorkEvent(planning.incumbencyOpened(workId, 'inc-2', 'S2', 11n), state).state
  state = planning.applyWorkEvent(planning.reviewed('inc-2', 'S2', 'Promoted'), state).state
  state = planning.applyWorkEvent(planning.incumbencyRetired('inc-2', 'Relayed', 20n), state).state
  state = planning.applyWorkEvent(planning.incumbencyOpened(workId, 'inc-3', 'S3', 21n), state).state
  state = planning.applyWorkEvent(planning.reviewed('inc-3', 'S3', 'Promoted'), state).state
  return state
}

test('WHAT[planning-003] seven durable events drive plan lifecycle with idempotent replay', () => {
  const empty = planning.empty()

  // 1. PlanWorkOpened
  const open1 = planning.applyWorkEvent(planning.workOpened('work-1', '/repo/root'), empty)
  assert.equal(open1.ok, true)
  assert.equal(open1.state.Root, '/repo/root')

  // Replay PlanWorkOpened identically -> idempotent
  const openReplay = planning.applyWorkEvent(planning.workOpened('work-1', '/repo/root'), open1.state)
  assert.equal(openReplay.ok, true)
  assert.deepEqual(openReplay.state, open1.state)

  // 2. PlanDevOpsBound
  const bound1 = planning.applyWorkEvent(planning.devOpsBound('work-1', 'devops-1', 'gpt-4o'), open1.state)
  assert.equal(bound1.ok, true)

  // Replay PlanDevOpsBound identically -> idempotent
  const boundReplay = planning.applyWorkEvent(planning.devOpsBound('work-1', 'devops-1', 'gpt-4o'), bound1.state)
  assert.equal(boundReplay.ok, true)
  assert.deepEqual(boundReplay.state, bound1.state)

  // 3. PlanIncumbencyOpened (S1)
  const inc1 = planning.applyWorkEvent(
    planning.incumbencyOpened('work-1', 'inc-1', 'S1', 0n),
    bound1.state,
  )
  assert.equal(inc1.ok, true)
  assert.equal(planning.activeStage(inc1.state), 'S1')
  assert.equal(planning.retiredCount(inc1.state), 0)

  // 4. PlanReviewed (Promoted) advances the active tenure S1 -> S2
  const rev1 = planning.applyWorkEvent(planning.reviewed('inc-1', 'S1', 'Promoted'), inc1.state)
  assert.equal(rev1.ok, true)
  assert.equal(planning.activeStage(rev1.state), 'S2')

  // Replay PlanReviewed identically -> idempotent
  const rev1Replay = planning.applyWorkEvent(planning.reviewed('inc-1', 'S1', 'Promoted'), rev1.state)
  assert.equal(rev1Replay.ok, true)
  assert.deepEqual(rev1Replay.state, rev1.state)

  // 5. PlanIncumbencyRetired (Relayed) — relay retirement, not terminal
  const ret1 = planning.applyWorkEvent(
    planning.incumbencyRetired('inc-1', 'Relayed', 10n),
    rev1.state,
  )
  assert.equal(ret1.ok, true)
  assert.equal(planning.activeStage(ret1.state), undefined)
  assert.equal(planning.retiredCount(ret1.state), 1)
  assert.equal(planning.isDelivered(ret1.state), false, 'Relayed must not set Delivered')

  // Replay PlanIncumbencyRetired identically -> idempotent
  const ret1Replay = planning.applyWorkEvent(
    planning.incumbencyRetired('inc-1', 'Relayed', 10n),
    ret1.state,
  )
  assert.equal(ret1Replay.ok, true)
  assert.deepEqual(ret1Replay.state, ret1.state)

  // 6. Relay opens the next tenure at the same (already promoted) stage
  const inc2 = planning.applyWorkEvent(
    planning.incumbencyOpened('work-1', 'inc-2', 'S2', 11n),
    ret1.state,
  )
  assert.equal(inc2.ok, true)
  assert.equal(planning.activeStage(inc2.state), 'S2')

  // 7. PlanDelivered records digest, path and execSessionId on the authorized tenure
  const authorized = buildAuthorizedS3('work-1')
  assert.equal(authorized.Active.Authorized, true)

  const retDelivered = planning.applyWorkEvent(
    planning.incumbencyRetired('inc-3', 'Delivered', 30n),
    authorized,
  )
  assert.equal(retDelivered.ok, true)

  const del = planning.applyWorkEvent(
    planning.delivered('inc-3', 'work-1', 'sha256-abc123', 'root/plan/work-1/plan.md', 'exec-session-1'),
    retDelivered.state,
  )
  assert.equal(del.ok, true)
  assert.equal(planning.isDelivered(del.state), true)
  assert.equal(planning.deliveredDigest(del.state), 'sha256-abc123')
  assert.equal(del.state.Delivered.ExecSessionId, 'exec-session-1')

  // Replay PlanDelivered identically -> idempotent
  const delReplay = planning.applyWorkEvent(
    planning.delivered('inc-3', 'work-1', 'sha256-abc123', 'root/plan/work-1/plan.md', 'exec-session-1'),
    del.state,
  )
  assert.equal(delReplay.ok, true)
  assert.deepEqual(delReplay.state, del.state)

  // 8. PlanReopened clears Delivered and restores the original incumbency
  const reopened = planning.applyWorkEvent(planning.reopened('inc-3'), del.state)
  assert.equal(reopened.ok, true)
  assert.equal(planning.isDelivered(reopened.state), false)
  assert.equal(planning.activeStage(reopened.state), 'S3', 'reopened work must restore the original tenure at its stage')
  assert.equal(reopened.state.Active.Id, 'inc-3', 'reopened work must reuse the original incumbencyId')

  // Replay PlanReopened identically -> idempotent
  const reopenedReplay = planning.applyWorkEvent(planning.reopened('inc-3'), reopened.state)
  assert.equal(reopenedReplay.ok, true)
  assert.deepEqual(reopenedReplay.state, reopened.state)

  // Retired history is preserved after reopen
  assert.equal(planning.retiredCount(reopened.state), 3)
})

test('WHAT[planning-003] conflicting payloads and illegal transitions fail-closed', () => {
  const empty = planning.empty()

  // Conflicting root on work opened
  const open1 = planning.applyWorkEvent(planning.workOpened('work-1', '/repo/root1'), empty)
  assert.equal(open1.ok, true)
  const openConflict = planning.applyWorkEvent(planning.workOpened('work-1', '/repo/root2'), open1.state)
  assert.equal(openConflict.ok, false)

  // Conflicting devops binding
  const bound1 = planning.applyWorkEvent(planning.devOpsBound('work-1', 'devops-1', null), open1.state)
  assert.equal(bound1.ok, true)
  const boundConflict = planning.applyWorkEvent(planning.devOpsBound('work-1', 'devops-2', null), bound1.state)
  assert.equal(boundConflict.ok, false)

  // Multiple active incumbencies forbidden
  const inc1 = planning.applyWorkEvent(
    planning.incumbencyOpened('work-1', 'inc-1', 'S1', 0n),
    bound1.state,
  )
  assert.equal(inc1.ok, true)
  const secondActive = planning.applyWorkEvent(
    planning.incumbencyOpened('work-1', 'inc-2', 'S1', 0n),
    inc1.state,
  )
  assert.equal(secondActive.ok, false, 'cannot open second active incumbency')

  // Second distinct PlanReviewed for the same incumbency is rejected
  const rev1 = planning.applyWorkEvent(planning.reviewed('inc-1', 'S1', 'Stayed'), inc1.state)
  assert.equal(rev1.ok, true)
  const revConflict = planning.applyWorkEvent(planning.reviewed('inc-1', 'S1', 'Promoted'), rev1.state)
  assert.equal(revConflict.ok, false, 'each incumbency may carry at most one PlanReviewed')

  // Relay must keep the stage: opening the successor at a different stage is rejected
  const ret1 = planning.applyWorkEvent(
    planning.incumbencyRetired('inc-1', 'Relayed', 10n),
    rev1.state,
  )
  assert.equal(ret1.ok, true)
  const successorSkipped = planning.applyWorkEvent(
    planning.incumbencyOpened('work-1', 'inc-2', 'S2', 11n),
    ret1.state,
  )
  assert.equal(successorSkipped.ok, false, 'relay successor must open at the retired tenure stage (S1 here, Stayed kept it)')

  // Cannot deliver while the incumbency is still active
  const inc2 = planning.applyWorkEvent(
    planning.incumbencyOpened('work-1', 'inc-2', 'S1', 11n),
    ret1.state,
  )
  assert.equal(inc2.ok, true)
  const deliverWhileActive = planning.applyWorkEvent(
    planning.delivered('inc-2', 'work-1', 'sha256-abc', 'path', 'exec-1'),
    inc2.state,
  )
  assert.equal(deliverWhileActive.ok, false, 'cannot deliver while active')

  // PlanReopened without Delivered is rejected
  const reopenWithoutDelivered = planning.applyWorkEvent(planning.reopened('inc-2'), inc2.state)
  assert.equal(reopenWithoutDelivered.ok, false, 'cannot reopen a work that was never delivered')

  // PlanReopened with a mismatched incumbencyId is rejected
  const authorized = buildAuthorizedS3('work-2')
  const retired = planning.applyWorkEvent(
    planning.incumbencyRetired('inc-3', 'Delivered', 30n),
    authorized,
  ).state
  const delivered = planning.applyWorkEvent(
    planning.delivered('inc-3', 'work-2', 'sha-1', 'plan.md', 'exec-1'),
    retired,
  ).state
  const reopenWrongInc = planning.applyWorkEvent(planning.reopened('inc-1'), delivered)
  assert.equal(reopenWrongInc.ok, false, 'reopened incumbencyId must match the delivered retirement')
})
