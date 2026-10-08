import assert from 'node:assert/strict'
import test from 'node:test'
import * as relay from '../../../dist/Mission/Relay/Surface.js'
import * as workflow from '../../../dist/Mission/Manager/WorkflowSurface.js'
import * as dispatch from '../../../dist/Interaction/Dispatch/DispatchSurface.js'
import { withManagerLoop } from './support/manager-loop.mjs'

const open = (state, road = 'road-1', incumbent = 'inc-1', snapshot = 'snapshot-1') =>
  relay.openIncumbency(state, road, incumbent, snapshot, 'authority-1')

test('WHAT[relay-incumbency-006] Continue keeps the road open for a next iteration', () => {
  const first = open(relay.empty())
  const assessed = relay.assess(
    first.state,
    'road-1',
    'inc-1',
    'assessment-1',
    'snapshot-1',
    'authority-1',
    'REVISE', 'PERFECT', 'PERFECT', 'PERFECT', 'PERFECT', 'PERFECT', 'PERFECT', 'PERFECT',
  )
  assert.equal(assessed.ok, true)
  const retired = relay.retireContinue(assessed.state, 'road-1', 'inc-1', 'ret-1', 'run-1', 'tool-1', 'snapshot-2')
  assert.equal(retired.ok, true)
  assert.deepEqual(relay.retirement(retired.state, 'road-1'), {
    retirementId: 'ret-1',
    incumbentId: 'inc-1',
    outcome: 'Continue',
    certificateId: null,
    providerRunId: 'run-1',
    toolCallId: 'tool-1',
    snapshotId: 'snapshot-2',
    authorityRevision: 'authority-1',
  })
  assert.equal(relay.view(retired.state, 'road-1').activeIncumbency, null)

  const next = relay.openIncumbency(retired.state, 'road-1', 'inc-2', 'snapshot-2', 'authority-1')
  assert.equal(next.ok, true)
  assert.equal(relay.view(next.state, 'road-1').phase, 'AuditPending')
  assert.equal(relay.authority(next.state, 'road-1').activeSnapshot, 'snapshot-2')
})

test('WHAT[relay-incumbency-006] Accepted blocks reopening while valid, invalidation reopens it', () => {
  const first = open(relay.empty())
  const assessed = relay.assess(
    first.state,
    'road-1',
    'inc-1',
    'assessment-1',
    'snapshot-1',
    'authority-1',
    ...Array(8).fill('PERFECT'),
  )
  assert.equal(assessed.ok, true)
  const retired = relay.retireAccepted(
    assessed.state,
    'road-1',
    'inc-1',
    'ret-1',
    'run-1',
    'tool-1',
    'certificate:assessment-1',
    'snapshot-1',
  )
  assert.equal(retired.ok, true)
  assert.deepEqual(relay.retirement(retired.state, 'road-1'), {
    retirementId: 'ret-1',
    incumbentId: 'inc-1',
    outcome: 'Accepted',
    certificateId: 'certificate:assessment-1',
    providerRunId: 'run-1',
    toolCallId: 'tool-1',
    snapshotId: 'snapshot-1',
    authorityRevision: 'authority-1',
  })

  const blocked = relay.openIncumbency(retired.state, 'road-1', 'inc-2', 'snapshot-2', 'authority-1')
  assert.deepEqual(blocked, { ok: false, error: 'RoadAlreadyAccepted' })

  const invalidated = relay.invalidateCertificate(retired.state, 'road-1', 'WorkspaceChanged')
  assert.equal(invalidated.ok, true)
  assert.equal(relay.certificate(invalidated.state, 'road-1').valid, false)

  const next = relay.openIncumbency(invalidated.state, 'road-1', 'inc-2', 'snapshot-2', 'authority-1')
  assert.equal(next.ok, true)
  assert.deepEqual(relay.view(next.state, 'road-1'), {
    activeIncumbency: 'inc-2',
    iterationOrdinal: 2,
    phase: 'AuditPending',
    retired: ['inc-1'],
  })
  assert.deepEqual(relay.retirement(next.state, 'road-1'), {
    retirementId: 'ret-1',
    incumbentId: 'inc-1',
    outcome: 'Accepted',
    certificateId: 'certificate:assessment-1',
    providerRunId: 'run-1',
    toolCallId: 'tool-1',
    snapshotId: 'snapshot-1',
    authorityRevision: 'authority-1',
  })
})

for (const [caseName, sends] of [
  ['continue', 1],
  ['continue-active', 1],
  ['valid-accepted', 0],
  ['invalid-accepted', 1],
  ['invalid-accepted-active', 1],
  ['missing-certificate', 0],
  ['foreign-valid-certificate', 0],
  ['foreign-invalid-certificate', 0],
]) {
  test(`WHAT[relay-incumbency-006] production ContinueLoop ${caseName} preserves the original Root and completion observer`, async () => {
    await withManagerLoop(caseName, async context => {
      const { directory, session, profile, road, reopen, assertSubscriptionLive } = context
      const before = dispatch.projectionObservation(context.journal(), session)
      const beforeRoad = road()
      const sent = []
      const port = {
        SubscribeTerminal: () => ({ Dispose() {} }),
        SubscribeFutureTerminal: () => ({ Dispose() {} }),
        AbortSession: () => assert.fail('ordinary ContinueLoop must not abort the original session'),
        InterruptAttempt: () => assert.fail('ordinary ContinueLoop must not interrupt output or tools'),
        SendPrompt: async (target, text, options) => {
          const key = options.Metadata.wanxiangshu_prompt_key
          const pending = dispatch.projectionObservation(context.journal(), session).pendingClaims
          const claim = pending.find(candidate => candidate.promptKey === key)
          assert.ok(claim, 'the actual continuation claim must be durable before physical send')
          assert.equal(claim.origin, 'ManagerGuard')
          assert.equal(claim.logicalRun, profile.logicalRun)
          assert.equal(claim.authorityRoot, profile.authorityRoot)
          assert.equal(target, session)
          sent.push({ key, text })
          return dispatch.admittedWithPhysicalMessage(`manager-loop-physical-${session}`)
        },
      }
      const deliver = () => workflow.maybeDeliverLoop(port, context.journal(), session, directory)
      await deliver()
      assert.equal(sent.length, sends, 'only Continue or its exact invalidated Accepted certificate may send')
      const after = dispatch.projectionObservation(context.journal(), session)
      assert.deepEqual(after.activeLogicalRun, profile)
      assert.equal(after.pendingClaims.length, 0)
      assert.equal(after.claimSequences.length, before.claimSequences.length + sends)
      if (sends === 1) {
        assert.match(sent[0].text, /2/)
        assert.equal(road().activeIncumbencyPresent, true)
        assert.equal(road().iterationOrdinal, 2)
        assert.equal(road().retiredIncumbencyCount, 1)
        assert.equal(road().latestRetirementPresent, true)
      } else {
        assert.deepEqual(road(), beforeRoad, 'a missing or different certificate cannot open another incumbency')
      }
      await deliver()
      assert.equal(sent.length, sends, 'one exact retirement cut has at most one physical continuation')
      const persistedRoad = road()
      await reopen()
      assert.deepEqual(road(), persistedRoad, 'opening, retirement and certificate evidence must survive cold replay')
      assert.deepEqual(dispatch.projectionObservation(context.journal(), session).activeLogicalRun, profile)
      await deliver()
      assert.equal(sent.length, sends, 'cold replay must retain the exact gate dispatch identity')
      assertSubscriptionLive()
    })
  })
}
