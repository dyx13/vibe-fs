import test from 'node:test'
import { integrationTest } from '../../verification-system/tests/support/tier-gate.mjs'

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");

const change = await import('../../../dist/Change/Surface.js')

test('WHAT[change-integration-005] rebase conflict records machine fact and continues the loop outside the gate', async () => {
  const observation = await change.observeRelayProgram('rebase-conflict')

  assert.deepEqual(observation.facts, ['CandidateReady', 'ConflictDetected'])
  assert.deepEqual(observation.invalidations, ['InitialRebaseRequired'])
  assert.deepEqual(observation.continuations, ['surface-loop-1'])
})
test('WHAT[change-integration-005] artifact conflict continues the loop outside the gate', async () => {
  const observation = await change.observeRelayProgram('artifact-conflict')

  assert.deepEqual(observation.facts, ['ConflictDetected'])
  assert.deepEqual(observation.invalidations, ['ArtifactAdmissionUnmerged'])
  assert.deepEqual(observation.continuations, ['surface-loop-1'])
})
}

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");

const change = await import('../../../dist/Change/Surface.js')
const hostSurface = await import('../../../dist/Change/Host/Surface.js')
const fakeRunner = (answers) => {
  const calls = []
  const runner = (command) => {
    const args = command.args
    calls.push({ file: command.fileName, args, cwd: command.workingDirectory })
    const key = args.join(' ')
    for (const [prefix, response] of answers) {
      if (!key.startsWith(prefix)) continue
      if (Array.isArray(response) && Array.isArray(response[0])) {
        const triple = response.length > 1 ? response.shift() : response[0]
        return Promise.resolve(triple)
      }
      return Promise.resolve(response)
    }
    return Promise.resolve([0, '', ''])
  }
  return { runner, calls }
}
const REPO = '/repo'
const WORKTREE = '/repo/.worktrees/job-1'
const git = (runner) => change.createGit(REPO, runner)
const ok = (result) => {
  assert.equal(result.ok, true, result.ok ? '' : result.error)
  return result.value
}
const ffAnswers = ({ candidate = 'cafe01', targetHead = 'beef02', branch = 'main' } = {}) => [
  ['symbolic-ref --short HEAD', [0, `${branch}\n`, '']],
  ['rev-parse HEAD', [0, `${candidate}\n`, '']],
  ['rev-parse refs/heads/main', [0, `${targetHead}\n`, '']],
  ['merge-base --is-ancestor', [0, '', '']],
  ['status --porcelain', [0, '', '']],
  ['merge --ff-only', [0, '', '']],
]
const ff = (answers) => change.gitFfMerge(git(fakeRunner(answers).runner), WORKTREE, 'main', 'beef02', 'cafe01')

test('WHAT[change-integration-005] GIT_conflicted_files_parses_lines', async () => {
  const result = await change.gitConflictedFiles(git(fakeRunner([['diff --name-only --diff-filter=U', [0, 'a.fs\nb.fs\n', '']]]).runner), WORKTREE)
  assert.deepEqual(ok(result), ['a.fs', 'b.fs'])
})
test('WHAT[change-integration-005] GIT_conflicted_files_error_propagates', async () => {
  const result = await change.gitConflictedFiles(git(fakeRunner([['diff --name-only --diff-filter=U', [1, '', 'not a repo']]]).runner), WORKTREE)
  assert.equal(result.ok, false)
  assert.equal(result.error, 'not a repo')
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

test('WHAT[change-integration-005] ConflictDetected_preserves_machine_conflict_evidence_on_the_same_Road_worktree', () => {
  const { job } = jobAt(fact.conflictDetected(['src/a.fs', 'src/b.fs']))
  assert.deepEqual(job.facts, ['ConflictDetected'])
  const conflict = change.fact('ConflictDetected', {
    candidateCommit: 'c1',
    targetHeadSnapshot: 'h1',
    workspaceSnapshotId: 'snapshot-conflict',
    conflictFiles: ['src/a.fs', 'src/b.fs'],
    diagnosticsDigest: 'digest',
  })
  assert.deepEqual(conflict.payload.conflictFiles, ['src/a.fs', 'src/b.fs'])
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

test('WHAT[change-integration-005] THEOREM_conflict_detected_remains_independent_durable_evidence', () => {
  const folded = foldEvents([
    createEvent(JOB_A, 'ses_orch_a'),
    candidateEvent(JOB_A),
    conflictEvent(JOB_A, { conflictFiles: ['publish_proof.txt', 'src/a.fs'] }),
  ])
  assert.deepEqual(factsOf(folded, JOB_A), ['CandidateReady', 'ConflictDetected'])
})
test('WHAT[change-integration-005] THEOREM_drop_ephemeral_preserves_conflict_evidence', () => {
  const durable = [createEvent(JOB_A, 'ses_orch_a'), conflictEvent(JOB_A)]
  const before = foldEvents(durable)
  assert.deepEqual(factsOf(before, JOB_A), ['ConflictDetected'])

  const after = foldEvents(durable)
  assert.deepEqual(factsOf(after, JOB_A), ['ConflictDetected'])
})
}

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");

const change = await import('../../../dist/Change/Surface.js')

test('WHAT[change-integration-005] cleanup failure after landed FF preserves published fact as PublishedPendingCleanup', async () => {
  const observation = await change.observeRelayProgram('cleanup-failed')

  // In R12/R13, cleanup failure after FF succeeds must NEVER masquerade as IntegrationFailed
  // It must preserve the publication outcome and report PublishedPendingCleanup
  assert.equal(observation.verdict.kind, 'PublishedPendingCleanup')
  assert.match(observation.verdict.detail, /Published rebased-1/)
  assert.match(observation.verdict.detail, /cleanup pending:/)
  assert.match(observation.verdict.detail, /disk detached/)
  assert.ok(observation.facts.includes('Published'))
  assert.ok(!observation.facts.includes('JobFailed'))
  assert.deepEqual(observation.removedWorktreePaths, ['/tmp/wanxiangshu-change-surface'])
  assert.deepEqual(observation.deletedWorktreeIdentities, ['manager/surface-job'])
})
test('WHAT[change-integration-005] reentry cleanup failure preserves PublishedPendingCleanup', async () => {
  const observation = await change.observeRelayProgram('reentry-cleanup-failed')

  assert.equal(observation.verdict.kind, 'PublishedPendingCleanup')
  assert.match(observation.verdict.detail, /Published rebased-1/)
  assert.match(observation.verdict.detail, /cleanup pending:/)
  assert.match(observation.verdict.detail, /disk detached/)
  assert.equal(observation.ffCalls, 1)
  assert.deepEqual(observation.ffPinnedCandidates, ['rebased-1'])
  assert.ok(observation.facts.includes('Published'))
})
}

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");
const { assertOpaque } = await import("../../verification-system/tests/support/js-contract.mjs");

const change = await import('../../../dist/Change/Surface.js')
const PATH = '/repo/.worktrees/job-9'
const fakeRunner = (answers = []) => {
  const calls = []
  const runner = (command) => {
    const args = command.args
    calls.push({ args, cwd: command.workingDirectory })
    const key = args.join(' ')
    for (const [prefix, response] of answers) {
      if (key.startsWith(prefix)) return Promise.resolve(response)
    }
    return Promise.resolve([0, '', ''])
  }
  return { runner, calls }
}
const fakeGit = (answers = []) => {
  const fake = fakeRunner(answers)
  return { ...fake, git: change.createGit('/repo', fake.runner) }
}
const valueOf = async (promise) => {
  const result = await promise
  assert.equal(result.ok, true, result.ok ? '' : result.error)
  return result.value
}

test('WHAT[change-integration-005] WORKTREE_create_returns_owned_resource_and_marks_path_identity', async () => {
  const { git, calls } = fakeGit()
  const resource = await valueOf(change.worktreeCreate(git, 'job-9', PATH))

  assertOpaque(resource, 'owned worktree resource')
  assert.equal(change.worktreePath(resource), PATH)
  assert.equal(change.worktreeIdentity(resource), 'manager/job-9')
  assert.deepEqual(calls, [{ args: ['worktree', 'add', PATH, '-b', 'manager/job-9'], cwd: '/repo' }])
})
test('WHAT[change-integration-005] WORKTREE_release_removes_worktree_and_branch_once', async () => {
  const { git, calls } = fakeGit()
  const resource = await valueOf(change.worktreeCreate(git, 'job-9', PATH))

  const first = await change.worktreeRelease(resource)
  const second = await change.worktreeRelease(resource)
  assert.equal(first.ok, true)
  assert.equal(second.ok, true, 'release is idempotent')
  assert.equal(calls.filter(({ args }) => args[1] === 'remove').length, 1)
  assert.deepEqual(
    calls.filter(({ args }) => args[0] === 'branch'),
    [{ args: ['branch', '-D', 'manager/job-9'], cwd: '/repo' }],
  )
})
test('WHAT[change-integration-005] WORKTREE_release_aggregates_both_failures', async () => {
  const { git } = fakeGit([
    ['worktree remove', [1, '', 'rm failed']],
    ['branch -D', [1, '', 'branch failed']],
  ])
  const resource = await valueOf(change.worktreeCreate(git, 'job-9', PATH))
  const result = await change.worktreeRelease(resource)
  assert.equal(result.ok, false)
  assert.equal(result.error, 'worktree=rm failed; branch=branch failed')
})
test('WHAT[change-integration-005] WORKTREE_release_reports_single_failure_side', async () => {
  const first = fakeGit([['worktree remove', [1, '', 'rm failed']]])
  const resource = await valueOf(change.worktreeCreate(first.git, 'job-9', PATH))
  const result = await change.worktreeRelease(resource)
  assert.equal(result.error, 'worktree=rm failed')

  const second = fakeGit([['branch -D', [1, '', 'branch failed']]])
  const adopted = change.worktreeAdopt(second.git, 'manager/job-9', PATH)
  const result2 = await change.worktreeRelease(adopted)
  assert.equal(result2.error, 'branch=branch failed')
})
test('WHAT[change-integration-005] WORKTREE_unreleased_resource_disposes_by_releasing', async () => {
  const { git, calls } = fakeGit()
  const resource = await valueOf(change.worktreeCreate(git, 'job-9', PATH))
  await change.worktreeDispose(resource)
  assert.equal(calls.filter(({ args }) => args[1] === 'remove').length, 1)
})
test('WHAT[change-integration-005] WORKTREE_CMD_remove_force_flag_and_no_cwd', async () => {
  const fake = fakeRunner([])
  const git = change.createGit('/repo', fake.runner)
  const result = await change.gitRemoveWorktree(git, PATH)
  assert.equal(result.ok, true)
  assert.deepEqual(fake.calls[0].args, ['worktree', 'remove', '--force', PATH])
  assert.equal(fake.calls[0].cwd, undefined)
})
}

{
const { default: assert } = await import("node:assert/strict");
const { execFileSync, spawnSync } = await import("node:child_process");
const { chmodSync, mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const change = await import('../../../dist/Change/Surface.js');

const seedRepo = (repo) => {
  execFileSync('git', ['init', '--quiet', repo])
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo })
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo })
  writeFileSync(join(repo, 'seed.txt'), 'seed\n')
  execFileSync('git', ['add', 'seed.txt'], { cwd: repo })
  execFileSync('git', ['commit', '--quiet', '-m', 'seed'], { cwd: repo })
}

const realRunner = (command) => {
  const result = spawnSync(command.fileName, command.args, {
    cwd: command.workingDirectory,
    encoding: 'utf8',
  })
  return Promise.resolve([result.status ?? 1, result.stdout ?? '', result.stderr ?? ''])
}

const createRealWorktree = async (repo, child, job) => {
  const git = change.createGit(repo, realRunner)
  return change.gitCreateWorktree(git, job, child)
}

integrationTest('WHAT[change-integration-005] CHGINT_worktree_create_argv_is_accepted_by_real_git', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wxs-worktree-real-'))
  const repo = join(root, 'repo')
  const child = join(root, 'manager-job-real')

  try {
    seedRepo(repo)
    const created = await createRealWorktree(repo, child, 'job-real')
    assert.equal(created.ok, true, created.ok ? '' : created.error)
    assert.equal(created.value, 'manager/job-real')
    assert.equal(execFileSync('git', ['-C', child, 'branch', '--show-current'], { encoding: 'utf8' }).trim(), 'manager/job-real')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

integrationTest('WHAT[change-integration-005] CHGINT_worktree_create_survives_installed_wanxiang_reference_transaction_hook', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wxs-worktree-hooked-'))
  const repo = join(root, 'repo')
  const child = join(root, 'manager-job-hooked')

  try {
    seedRepo(repo)
    const hook = join(repo, '.git', 'hooks', 'reference-transaction')
    writeFileSync(hook, '#!/bin/sh\nexit 0\n')
    chmodSync(hook, 0o755)

    const created = await createRealWorktree(repo, child, 'job-hooked')
    assert.equal(created.ok, true, created.ok ? '' : created.error)
    assert.equal(execFileSync('git', ['-C', child, 'branch', '--show-current'], { encoding: 'utf8' }).trim(), 'manager/job-hooked')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
}
