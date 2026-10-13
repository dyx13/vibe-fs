import test from 'node:test'

{
const { default: assert } = await import('node:assert/strict')
const change = await import('../../../dist/Change/Surface.js')
const JOB = 'job_ea'
const baseJob = {
  jobId: JOB,
  managerSessionId: 'ses_ea',
  managerAgent: 'manager',
  byname: 'Road',
  worktreeIdentity: 'wt_ea',
  worktreePath: '/tmp/wt_ea',
  targetRef: 'refs/heads/main',
  targetBranchFrozen: 'refs/heads/main',
}
const managerCreated = { kind: 'ManagerJobCreated', payload: baseJob }
const rebased = {
  kind: 'RebasedCandidateReady',
  payload: { jobId: JOB, rebasedCommit: 'r1', targetHeadSnapshot: 'h1', workspaceSnapshotId: 'snap_2' },
}
const claimed = {
  kind: 'PublishClaimed',
  payload: {
    jobId: JOB,
    targetRef: 'refs/heads/main',
    rebasedCommit: 'r1',
    expectedHead: 'h1',
    workspaceSnapshotId: 'snap_2',
    qualityCertificateId: 'cert_ea',
    authorityRevision: 'rev_ea',
  },
}
const fold = (events) => {
  const result = change.fold(events)
  assert.equal(result.ok, true, result.error ?? '')
  return change.unwrapFold(result)
}

test('WHAT[change-integration-007] publish_claimed_recovery_three_branch_order_is_fixed', () => {
  const projection = fold([
    managerCreated,
    rebased,
    claimed,
  ])
  assert.deepEqual(change.find(projection, JOB).facts, ['RebasedCandidateReady', 'PublishClaimed'])
  assert.equal(change.classifyPublishClaim('r1', 'r1', 'h1').kind, 'AlreadyFastForwarded')
  assert.equal(change.classifyPublishClaim('h1', 'r1', 'h1').kind, 'PublishReady')
  assert.equal(change.classifyPublishClaim('zzz', 'r1', 'h1').kind, 'ClaimExpired')
  assert.equal(change.classifyPublishClaim(null, 'r1', 'h1').kind, 'HeadUnreadable')
})
}

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");

const change = await import('../../../dist/Change/Surface.js')
const JOB = 'job_1'
const MANAGER = 'ses_m'
const payload = (overrides = {}) => ({
  jobId: JOB,
  managerSessionId: MANAGER,
  managerAgent: 'manager',
  byname: 'Road',
  worktreeIdentity: 'wt_1',
  worktreePath: '/tmp/wt1',
  targetRef: 'refs/heads/main',
  targetBranchFrozen: 'refs/heads/main',
  ...overrides,
})
const created = (overrides) => change.createJob(change.empty(), payload(overrides))
const fact = {
  candidateReady: (candidateCommit = 'c1', workspaceSnapshotId = 'snapshot-1', qualityCertificateId = 'certificate-1') =>
    change.fact('CandidateReady', { candidateCommit, workspaceSnapshotId, qualityCertificateId }),
  conflictDetected: (conflictFiles = ['a.fs', 'b.fs']) =>
    change.fact('ConflictDetected', {
      candidateCommit: 'c1',
      targetHeadSnapshot: 'h1',
      workspaceSnapshotId: 'snapshot-conflict',
      conflictFiles,
      diagnosticsDigest: 'digest',
    }),
  rebased: (targetHeadSnapshot = 'h1', workspaceSnapshotId = 'snapshot-rebased') =>
    change.fact('RebasedCandidateReady', {
      rebasedCommit: 'r1',
      targetHeadSnapshot,
      workspaceSnapshotId,
    }),
  publishClaimed: (
    workspaceSnapshotId = 'snapshot-rebased',
    qualityCertificateId = 'certificate-1',
    authorityRevision = 'authority-1',
  ) =>
    change.fact('PublishClaimed', {
      targetRef: 'refs/heads/main',
      rebasedCommit: 'r1',
      expectedHead: 'h1',
      workspaceSnapshotId,
      qualityCertificateId,
      authorityRevision,
    }),
  published: () => change.fact('Published', { candidateCommit: 'c1', resultingTargetHead: 'r1' }),
  failed: (reason = 'boom') => change.fact('JobFailed', { reason }),
  abandoned: () => change.fact('JobAbandoned', null),
}
const jobAt = (value, projection = created()) => {
  const next = change.recordFact(projection, JOB, value)
  return { projection: next, job: change.find(next, JOB) }
}
const classifyRebased = (head, rebasedCommit = 'r1', snapshot = 'h1') =>
  change.classifyRebasedCandidate(head ?? null, rebasedCommit, snapshot)
const classifyClaim = (head, rebasedCommit = 'r1', expectedHead = 'h1') =>
  change.classifyPublishClaim(head ?? null, rebasedCommit, expectedHead)
const createdEvent = {
  kind: 'ManagerJobCreated',
  payload: payload(),
}
const candidateEvent = {
  kind: 'CandidateReady',
  payload: {
    jobId: JOB,
    candidateCommit: 'c1',
    workspaceSnapshotId: 'snapshot-1',
    qualityCertificateId: 'certificate-1',
  },
}
const publishedEvent = {
  kind: 'Published',
  payload: { jobId: JOB, candidateCommit: 'c1', resultingTargetHead: 'r1' },
}
const foldProjection = (events) => {
  const result = change.fold(events)
  assert.equal(result.ok, true, result.ok ? '' : result.error)
  return result.value
}
const worktreeRequested = { kind: 'WorktreeCreateRequested', payload: { jobId: JOB, worktreeIdentity: 'manager/job_1', worktreePath: '/tmp/wt1' } }
const worktreeCreated = { kind: 'WorktreeCreated', payload: { jobId: JOB, worktreeIdentity: 'manager/job_1', worktreePath: '/tmp/wt1' } }

test('WHAT[change-integration-007] ORCH_007_the_three_publish_claim_branches_are_evaluated_in_the_clause_order', () => {
  assert.equal(classifyClaim('r1').kind, 'AlreadyFastForwarded')
  assert.equal(classifyClaim('h1').kind, 'PublishReady')
  assert.equal(classifyClaim('h9').kind, 'ClaimExpired')
})
test('WHAT[change-integration-007] ORCH_008_an_unreadable_target_head_fails_closed_for_every_head_dependent_case', () => {
  assert.equal(classifyRebased(undefined).kind, 'HeadUnreadable')
  assert.equal(classifyClaim(undefined).kind, 'HeadUnreadable')
})
}

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");

const change = await import('../../../dist/Change/Surface.js')
const JOB_A = 'job_a'
const JOB_B = 'job_b'
const createEvent = (jobId, managerSessionId, worktreeIdentity = `wt_${jobId.slice(-1)}`) => ({
  kind: 'ManagerJobCreated',
  payload: {
    jobId,
    managerSessionId,
    managerAgent: 'manager',
    byname: 'Road',
    worktreeIdentity,
    worktreePath: `/tmp/${worktreeIdentity}`,
    targetRef: 'refs/heads/main',
    targetBranchFrozen: 'refs/heads/main',
  },
})
const candidateEvent = (
  jobId,
  candidateCommit = 'c1',
  workspaceSnapshotId = 'snapshot-1',
  qualityCertificateId = 'certificate-1',
) => ({
  kind: 'CandidateReady',
  payload: { jobId, candidateCommit, workspaceSnapshotId, qualityCertificateId },
})
const conflictEvent = (jobId, { candidateCommit = 'c1', targetHeadSnapshot = 'h1', conflictFiles = ['publish_proof.txt'] } = {}) => ({
  kind: 'ConflictDetected',
  payload: {
    jobId,
    candidateCommit,
    targetHeadSnapshot,
    workspaceSnapshotId: 'snapshot-conflict',
    conflictFiles,
    diagnosticsDigest: 'conflict-digest',
  },
})
const rebasedEvent = (
  jobId,
  { rebasedCommit = 'r1', targetHeadSnapshot = 'h1', workspaceSnapshotId = 'snapshot-rebased' } = {},
) => ({
  kind: 'RebasedCandidateReady',
  payload: { jobId, rebasedCommit, targetHeadSnapshot, workspaceSnapshotId },
})
const publishClaimedEvent = (jobId, expectedHead = 'h1') => ({
  kind: 'PublishClaimed',
  payload: {
    jobId,
    targetRef: 'refs/heads/main',
    rebasedCommit: 'r1',
    expectedHead,
    workspaceSnapshotId: 'snapshot-rebased',
    qualityCertificateId: 'certificate-1',
    authorityRevision: 'authority-1',
  },
})
const publishedEvent = (jobId, candidateCommit = 'c1', resultingTargetHead = 'r1') => ({
  kind: 'Published',
  payload: { jobId, candidateCommit, resultingTargetHead },
})
const foldEvents = (events) => {
  const result = change.fold(events)
  assert.equal(result.ok, true, result.ok ? '' : result.error)
  return result.value
}
const factsOf = (projection, jobId) => change.find(projection, jobId).facts
const classifyRebased = (head, rebasedCommit = 'r1', snapshot = 'h1') =>
  change.classifyRebasedCandidate(head ?? null, rebasedCommit, snapshot)
const classifyClaim = (head, rebasedCommit = 'r1', expectedHead = 'h1') =>
  change.classifyPublishClaim(head ?? null, rebasedCommit, expectedHead)

test('WHAT[change-integration-007] THEOREM_publish_claimed_three_branch_order_is_fixed', () => {
  const folded = foldEvents([
    createEvent(JOB_A, 'ses_orch_a'),
    candidateEvent(JOB_A),
    rebasedEvent(JOB_A),
    publishClaimedEvent(JOB_A),
  ])
  assert.deepEqual(factsOf(folded, JOB_A), ['CandidateReady', 'RebasedCandidateReady', 'PublishClaimed'])
  assert.equal(classifyClaim('r1').kind, 'AlreadyFastForwarded')
  assert.equal(classifyClaim('h1').kind, 'PublishReady')
  assert.equal(classifyClaim('h9').kind, 'ClaimExpired')
})
test('WHAT[change-integration-007] repeating the same pure fold preserves publish-claim classification', () => {
  const durable = [createEvent(JOB_A, 'ses_orch_a'), candidateEvent(JOB_A), rebasedEvent(JOB_A), publishClaimedEvent(JOB_A)]
  const before = foldEvents(durable)
  assert.deepEqual(factsOf(before, JOB_A), ['CandidateReady', 'RebasedCandidateReady', 'PublishClaimed'])
  assert.equal(classifyClaim('r1').kind, 'AlreadyFastForwarded')
  assert.equal(classifyClaim('h1').kind, 'PublishReady')
  assert.equal(classifyClaim('h9').kind, 'ClaimExpired')

  const after = foldEvents(durable)
  assert.deepEqual(factsOf(after, JOB_A), ['CandidateReady', 'RebasedCandidateReady', 'PublishClaimed'])
  assert.equal(classifyClaim('r1').kind, 'AlreadyFastForwarded')
  assert.equal(classifyClaim('h1').kind, 'PublishReady')
  assert.equal(classifyClaim('h9').kind, 'ClaimExpired')
  assert.equal(classifyClaim(undefined).kind, 'HeadUnreadable')
})
}

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");

const change = await import('../../../dist/Change/Surface.js')

test('WHAT[change-integration-007] classifyPublishClaim three-way reality ordering', () => {
  assert.equal(change.classifyPublishClaim('r1', 'r1', 'h1').kind, 'AlreadyFastForwarded')
  assert.equal(change.classifyPublishClaim('h1', 'r1', 'h1').kind, 'PublishReady')
  assert.equal(change.classifyPublishClaim('h9', 'r1', 'h1').kind, 'ClaimExpired')
  assert.equal(change.classifyPublishClaim(null, 'r1', 'h1').kind, 'HeadUnreadable')
})
test('WHAT[change-integration-007] published-but-unsettled reentry never replays FF', async () => {
  const observation = await change.observeRelayProgram('reentry-published-unsettled')

  assert.equal(observation.ffCalls, 0)
  assert.deepEqual(observation.ffPinnedCandidates, [])
  assert.deepEqual(observation.ffExpectedHeads, [])
})
test('WHAT[change-integration-007] complete claim whose target already landed backfills publication without FF', async () => {
  const observation = await change.observeRelayProgram('reentry-already-fast-forwarded')

  assert.deepEqual(observation.verdict, { kind: 'Published', detail: 'rebased-1' })
  assert.deepEqual(observation.facts, ['Published'])
  assert.equal(observation.ffCalls, 0)
  assert.equal(observation.gateAcquireCount, 0)
  assert.equal(observation.gateReleaseCount, 0)
  assert.equal(observation.signalCount, 0)
  assert.deepEqual(observation.removedWorktreePaths, ['/tmp/wanxiangshu-change-surface'])
  assert.deepEqual(observation.deletedWorktreeIdentities, ['manager/surface-job'])
})
test('WHAT[change-integration-007] complete claim whose target moved resumes the manager loop without publication', async () => {
  const observation = await change.observeRelayProgram('reentry-claim-expired')

  assert.deepEqual(observation.verdict, { kind: 'IntegrationFailed', detail: 'scenario-complete' })
  assert.deepEqual(observation.facts, [])
  assert.deepEqual(observation.continuations, ['surface-loop-1'])
  assert.equal(observation.signalCount, 2)
  assert.equal(observation.ffCalls, 0)
  assert.equal(observation.gateAcquireCount, 0)
  assert.equal(observation.gateReleaseCount, 0)
  assert.deepEqual(observation.removedWorktreePaths, [])
  assert.deepEqual(observation.deletedWorktreeIdentities, [])
})
}
