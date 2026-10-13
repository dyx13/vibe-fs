import test from 'node:test'

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");

const change = await import('../../../dist/Change/Surface.js')

test('WHAT[change-integration-001] fresh quality candidate runs the full publish lifecycle to Published', async () => {
  const observation = await change.observeRelayProgram('fresh')

  assert.deepEqual(observation.verdict, { kind: 'Published', detail: 'rebased-1' })
  assert.deepEqual(observation.invalidations, ['InitialRebaseRequired'])
  assert.deepEqual(observation.continuations, ['surface-loop-1'])

  assert.deepEqual(observation.timeline, [
    'await:Candidate',
    'fact:CandidateReady',
    'invalidate:InitialRebaseRequired',
    'git:rebase',
    'git:read-head:rebased-1',
    'fact:RebasedCandidateReady',
    'continue:surface-loop-1',
    'await:Candidate',
    'gate:acquire',
    'git:read-head:rebased-1',
    'fact:PublishClaimed',
    'git:ff:rebased-1',
    'fact:Published',
    'gate:release',
    'relay:terminate',
  ])
})
test('WHAT[change-integration-001] retirement without a valid certificate continues the loop', async () => {
  const observation = await change.observeRelayProgram('retired')

  assert.deepEqual(observation.continuations, ['surface-loop-1'])
  assert.deepEqual(observation.invalidations, [])
  assert.equal(observation.timeline[0], 'await:Continue')
  assert.equal(observation.timeline[1], 'continue:surface-loop-1')
  assert.equal(observation.timeline[2], 'await:ExceptionalTerminal')
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

test('WHAT[change-integration-001] ORCH_003_a_created_job_persists_the_manager_agent_and_the_worktree_identity', () => {
  const job = change.find(created(), JOB)
  assert.deepEqual(job, {
    jobId: 'job_1',
    managerSessionId: 'ses_m',
    managerAgent: 'manager',
    byname: 'Road',
    worktreeIdentity: 'wt_1',
    worktreePath: '/tmp/wt1',
    targetRef: 'refs/heads/main',
    targetBranchFrozen: 'refs/heads/main',
    facts: [],
  })
})
}

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");

const change = await import('../../../dist/Change/Surface.js')

test('WHAT[change-integration-001] fresh quality candidate runs to Published with verified publication evidence', async () => {
  const observation = await change.observeRelayProgram('fresh')

  assert.deepEqual(observation.verdict, { kind: 'Published', detail: 'rebased-1' })
  assert.deepEqual(observation.invalidations, ['InitialRebaseRequired'])
  assert.deepEqual(observation.continuations, ['surface-loop-1'])
  assert.equal(observation.ffGateHeld.length, 1)
  assert.equal(observation.ffGateHeld[0], true)
  assert.deepEqual(observation.ffExpectedHeads, ['target-1'])
  assert.equal(observation.gateAcquireCount, 1)
  assert.equal(observation.gateReleaseCount, 1)
  assert.deepEqual(observation.removedWorktreePaths, ['/tmp/wanxiangshu-change-surface'])
  assert.deepEqual(observation.deletedWorktreeIdentities, ['manager/surface-job'])
})
test('WHAT[change-integration-001] pre-rebase C1/S1 certificate cannot authorize rebased S2 candidate and fails closed', async () => {
  const observation = await change.observeRelayProgram('rebase-reuse-old-cert')

  assert.equal(observation.verdict.kind, 'IntegrationFailed')
  assert.match(observation.verdict.detail, /Live certificate snapshot does not match rebased evidence snapshot/)
  assert.deepEqual(observation.invalidations, ['InitialRebaseRequired'])
  assert.deepEqual(observation.continuations, ['surface-loop-1'])
  assert.equal(observation.ffCalls, 0)
  assert.equal(observation.gateAcquireCount, 0)
  assert.equal(observation.facts.includes('Published'), false)
})
test('WHAT[change-integration-001] cancellation during manager loop returns Cancelled verdict and does not burn retry budget', async () => {
  const observation = await change.observeRelayProgram('cancelled-program')

  assert.deepEqual(observation.verdict, { kind: 'Cancelled', detail: 'cancelled' })
  assert.equal(observation.facts.includes('Published'), false)
  assert.equal(observation.facts.includes('JobFailed'), false)
  assert.equal(observation.gateAcquireCount, 0)
  assert.equal(observation.gateReleaseCount, 0)
  assert.equal(observation.ffCalls, 0)
  assert.deepEqual(observation.ffPinnedCandidates, [])
  assert.deepEqual(observation.ffExpectedHeads, [])
  assert.deepEqual(observation.invalidations, [])
  assert.deepEqual(observation.continuations, [])
})
test('WHAT[change-integration-001] reentry gate cancellation returns Cancelled with zero FF', async () => {
  const observation = await change.observeRelayProgram('reentry-gate-cancelled')

  assert.deepEqual(observation.verdict, { kind: 'Cancelled', detail: 'cancelled' })
  assert.equal(observation.ffCalls, 0)
  assert.deepEqual(observation.ffPinnedCandidates, [])
  assert.equal(observation.gateAcquireCount, 0)
  assert.equal(observation.gateReleaseCount, 0)
  assert.equal(observation.facts.includes('Published'), false)
})
test('WHAT[change-integration-001] old certificate still fails closed after the rebased record supersedes it', async () => {
  const observation = await change.observeRelayProgram('rebase-reuse-old-cert')

  assert.deepEqual(observation.facts, ['CandidateReady', 'RebasedCandidateReady'])
  assert.equal(observation.verdict.kind, 'IntegrationFailed')
  assert.match(observation.verdict.detail, /Live certificate snapshot does not match rebased evidence snapshot/)
  assert.equal(observation.ffCalls, 0)
  assert.equal(observation.facts.includes('Published'), false)
})
}
