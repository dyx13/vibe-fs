import test from 'node:test'


{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");
const Strength = await import("../../../dist/Strength/Surface.js");

const H = (text) => `H(${text})`
const opportunity = {
  isRootWork: true, requestKind: 'work-main', canonicalRole: 'engineer', ownerSessionId: 'owner',
  ownerLogicalRun: ['logical-1', 'authority-root-1'], sourcePhysicalUserMessageId: 'user-1',
  sourceProviderRun: 'run-1', sourceToolCallIds: ['call-1'], requestedRounds: 1, contractRevision: 1,
  hasPrefixProbe: false, isReplicaOrInternalLeaf: false, isInteractionRepair: false, isExplicitRecoveryBranch: false,
  ownerCancelled: false, targetProviderRunBound: true, eventStoreHealthy: true, hostBoundaryHealthy: true,
  processFuseHealthy: true, ownerLogicalRunSuperseded: false, pendingRequested: true, predictorConfigured: true,
}

// WHAT[011]/[014]: no environment variable, switch or artificial fingerprint can
// turn delegation on, off or into a dry run.
test('WHAT[speculative-investigation-011] STRENGTH_011_no_host_environment_variable_changes_the_delegation_decision', () => {
  const withEnv = (name, value, run) => {
    const previous = process.env[name]
    try {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
      run()
    } finally {
      if (previous === undefined) delete process.env[name]
      else process.env[name] = previous
    }
  }
  const expected = Strength.policyDecide(H, opportunity)
  assert.equal(expected.kind, 'Admit')
  for (const name of ['WANXIANGSHU_STRENGTH_MODE', 'WANXIANGSHU_STRENGTH_DRY_RUN_BUDGET', 'WANXIANGSHU_STRENGTH_HOST_CANARY', 'WANXIANGSHU_STRENGTH_ENABLED']) {
    for (const value of ['dry-run', 'shadow', 'treatment', 'off', 'K1', 'K2', 'pass', '']) {
      withEnv(name, value, () => assert.deepEqual(Strength.policyDecide(H, opportunity), expected))
    }
  }
  for (const exportName of ['settingsLoad', 'settingsDryRunBudget', 'settingsHostCanaryHealthy', 'settingsHostCanaryFingerprint', 'startDryRun', 'observeDryRun', 'closeDryRunAtPrimaryTerminal']) {
    assert.equal(Strength[exportName], undefined, `no ${exportName} entry may remain`)
  }
})
test('WHAT[speculative-investigation-011] STRENGTH_011_process_fuse_is_first_failure_latched_and_cannot_be_cleared_by_a_session_cleanup', () => {
  const scope = Strength.scopeCreate()
  assert.equal(Strength.scopeFuseReason(scope), null)
  Strength.scopeTripFuse(scope, 'projection-conflict')
  assert.equal(Strength.scopeFuseReason(scope), 'projection-conflict')
  Strength.scopeTripFuse(scope, 'later-noise')
  assert.equal(Strength.scopeFuseReason(scope), 'projection-conflict')
  Strength.scopeClearSession(scope, 'owner')
  assert.equal(Strength.scopeFuseReason(scope), 'projection-conflict')
  Strength.scopeDispose(scope)
})
test('WHAT[speculative-investigation-011] STRENGTH_011_ordinary_argument_errors_never_trip_process_fuse_unlike_invariant_failures', async () => {
  const { readonlyDelegationSelfNoteOf } = await import("../../../dist/OpenCode/Host/PluginHooksSurface.js");
  const scope = Strength.scopeCreate()
  assert.equal(Strength.scopeFuseReason(scope), null)

  const badArgs = [
    { estimated_readonly_rounds: -1 },
    { estimated_readonly_rounds: '2' },
    { estimated_readonly_rounds: 2, self_note: 'ok', delegate_readonly_rounds: 2 },
  ]
  for (const args of badArgs) {
    const parsed = readonlyDelegationSelfNoteOf(args)
    assert.equal(parsed.ok, false, 'must be rejected as argument error')
    assert.equal(Strength.scopeFuseReason(scope), null, 'ordinary argument error must never trip the process fuse')
  }

  Strength.scopeTripFuse(scope, 'projection-conflict')
  assert.equal(Strength.scopeFuseReason(scope), 'projection-conflict', 'invariant violation trips the fuse')
  Strength.scopeDispose(scope)
})
test('WHAT[speculative-investigation-011] STRENGTH_011_scope_dispose_drops_process_local_caches_but_never_untrips_the_fuse', () => {
  const scope = Strength.scopeCreate()
  const binding = Strength.runtimeBinding('owner-d', 'replica-d', 'dec-d', 'run-dec-d', 'Engineer', 1, 'sem-d', [])
  assert.equal(Strength.scopeRuntimeRegister(scope, binding).ok, true)
  assert.notEqual(Strength.scopeRuntimeFindByReplica(scope, 'replica-d'), null)
  Strength.scopeTripFuse(scope, 'boom')
  Strength.scopeDispose(scope)
  assert.equal(Strength.scopeRuntimeFindByReplica(scope, 'replica-d'), null)
  assert.equal(Strength.scopeFuseReason(scope), 'boom')
})

test('WHAT[speculative-investigation-011] STRENGTH_011_shared_predictor_scope_shares_registry_and_refcounts_across_instances', () => {
  const key = 'test-common-runtime-key'
  const scope1 = Strength.scopeAcquireShared(key)
  const scope2 = Strength.scopeAcquireShared(key)

  const binding = Strength.runtimeBinding('shared-owner', 'shared-replica', 'dec-shared', 'run-shared', 'Engineer', 1, 'sem-shared', [])
  assert.equal(Strength.scopeRuntimeRegister(scope1, binding).ok, true)

  // Both instances see the exact same registered child
  assert.notEqual(Strength.scopeRuntimeFindByReplica(scope2, 'shared-replica'), null)
  const duplicate = Strength.runtimeBinding('shared-owner', 'loser-replica', 'dec-loser', 'run-loser', 'Engineer', 1, 'sem-loser', [])
  assert.equal(Strength.scopeRuntimeRegister(scope2, duplicate).error, 'OwnerAlreadyHasReplica')

  // Unloading first instance does not drop shared registry or unbind child
  Strength.scopeReleaseShared(scope1)
  assert.notEqual(Strength.scopeRuntimeFindByReplica(scope2, 'shared-replica'), null)

  // Releasing the second (last) instance drops resources
  Strength.scopeReleaseShared(scope2)
  assert.equal(Strength.scopeRuntimeFindByReplica(scope2, 'shared-replica'), null)
})
}

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");
const Strength = await import("../../../dist/Strength/Surface.js");

const H = (text) => `H(${text})`
const hostText = (text) => ({ type: 'text', text })
const hostResult = (callId, tool, input, output) => ({ type: 'tool', tool, callID: callId, state: { status: 'completed', input, output } })
const user = (id, sessionId, parts) => ({ info: { id, role: 'user', sessionID: sessionId }, parts })
const assistant = (id, sessionId, parts) => ({ info: { id, role: 'assistant', sessionID: sessionId }, parts })
const binding = (owner, replica, decision, rounds) =>
  Strength.runtimeBinding(owner, replica, decision, `run-${decision}`, 'Engineer', rounds, `sem-${decision}`, [{ role: 'user', parts: [{ kind: 'text', text: 'owner mirror' }] }])
const attach = (replica, rounds, owner = 'owner') => {
  const handle = Strength.replicaRuntimeCreate()
  const decision = `decision-${replica}`
  const result = Strength.replicaAttach(handle, binding(owner, replica, decision, rounds))
  assert.equal(result.ok, true, result.error)
  return { handle, completion: result.value.completion }
}
const turn = (sessionId, outcome, providerRun = 'run-t') => ({ sessionId, physicalUserMessageId: 'u1', providerRun, outcome, parts: [] })
const oneBatch = (replica) => ({ messages: [user('u1', replica, [hostText('Continue.')]), assistant('a1', replica, [hostResult('c1', 'read', { filePath: 'a' }, 'alpha')])] })

test('WHAT[speculative-investigation-011] exact terminal collects text even without a subsequent predictor request', async () => {
  const { handle, completion } = attach('replica-text-stop', 2)
  try {
    await Strength.replicaHandleTransform(handle, {
      messages: [user('u1', 'replica-text-stop', [hostText('readonly assignment')])],
    })
    const terminal = {
      ...turn('replica-text-stop', 'completed', 'text-response'),
      finish: 'stop',
      parts: [{ kind: 'reasoning', text: 'private thinking' }, { kind: 'text', text: 'visible conclusion' }],
    }
    Strength.replicaHandleTurn(handle, { ...terminal, physicalUserMessageId: 'old-decision' })
    assert.equal(Strength.replicaPeek(handle, 'replica-text-stop').terminal, null)
    Strength.replicaHandleTurn(handle, terminal)
    const result = await Strength.replicaAwaitOutcome(completion)
    assert.deepEqual(result.batches, [{ requestOrdinal: 1, assistantText: ['visible conclusion'], exchanges: [] }])
    assert.equal(result.requestsAdmitted, 1)
    assert.equal(result.terminal.kind, 'TextCompleted')
  } finally {
    Strength.replicaDispose(handle)
  }
})

test('WHAT[speculative-investigation-011] STRENGTH_011_replica_semantic_vs_physical_tail_lifecycle_split', () => {
  const runtime = Strength.runtimeCreate()
  const live = binding('owner-life', 'replica-life', 'd-life', 1)
  assert.equal(Strength.runtimeRegister(runtime, live).ok, true)
  assert.equal(Strength.runtimeFindByReplica(runtime, 'replica-life').decisionId, 'd-life')
  const retired = Strength.runtimeRetire(runtime, 'replica-life')
  assert.equal(retired.decisionId, 'd-life')
  assert.equal(Strength.runtimeFindByReplica(runtime, 'replica-life'), null)
})
test('WHAT[speculative-investigation-011] STRENGTH_011_semantic_terminal_is_first_wins_and_physical_tail_cannot_restart_business', async () => {
  const { handle, completion } = attach('replica-sem', 1)
  assert.equal(await Strength.replicaHandleTransform(handle, oneBatch('replica-sem')), true)
  const admitted = Strength.replicaPeek(handle, 'replica-sem')
  assert.equal(admitted.requestsAdmitted, 1)
  assert.equal(await Strength.replicaHandleTransform(handle, { messages: [
    user('u1', 'replica-sem', [hostText('Continue.')]),
    assistant('a1', 'replica-sem', [hostResult('c1', 'read', { filePath: 'a' }, 'alpha')]),
    assistant('a2', 'replica-sem', [hostResult('c2', 'grep', { pattern: 'x' }, 'hit')]),
  ] }), true)
  const closed = Strength.replicaPeek(handle, 'replica-sem')
  assert.equal(closed.requestsAdmitted, 1, 'the refused outbound request never enters the count')
  assert.equal(closed.terminal.kind, 'BudgetReached')
  // The physical tail still has to be observed by the Host terminal.
  assert.equal(Strength.replicaHandleTurn(handle, turn('replica-sem', 'failed')), true)
  const outcome = await Strength.replicaAwaitOutcome(completion)
  assert.equal(outcome.terminal.kind, 'BudgetReached')
  assert.equal(outcome.requestsAdmitted, 1)
  assert.equal(Strength.replicaPeek(handle, 'replica-sem'), null)
  assert.equal(Strength.replicaLiveFind(handle, 'replica-sem'), null)
  assert.equal(Strength.replicaIsReplica(handle, 'replica-sem'), false)
  assert.equal(Strength.replicaHandleTurn(handle, turn('replica-sem', 'completed')), false)
  assert.deepEqual(Strength.replicaReleased(handle), ['replica-sem'])
})
test('WHAT[speculative-investigation-011] exact empty stop settles the readonly leaf without waiting for nonexistent interaction repair', async () => {
  const { handle, completion } = attach('replica-empty-stop', 3)
  try {
    assert.equal(await Strength.replicaHandleTransform(handle, {
      messages: [user('u1', 'replica-empty-stop', [hostText('readonly assignment')])],
    }), true)
    const emptyStop = {
      sessionId: 'replica-empty-stop', physicalUserMessageId: 'u1', providerRun: 'empty-response',
      outcome: 'needs-continuation', finish: 'stop',
      parts: [{ kind: 'step-start' }, { kind: 'step-finish' }],
    }
    for (const ignored of [
      { ...emptyStop, physicalUserMessageId: 'previous-decision' },
      { ...emptyStop, finish: null },
      { ...emptyStop, finish: 'tool-calls' },
      { ...emptyStop, errorName: 'APIError' },
    ]) {
      assert.equal(Strength.replicaHandleTurn(handle, ignored), true)
      assert.equal(Strength.replicaPeek(handle, 'replica-empty-stop')?.terminal, null)
    }
    assert.equal(Strength.replicaHandleTurn(handle, emptyStop), true)
    assert.equal(Strength.replicaPeek(handle, 'replica-empty-stop'), null,
      'physically stopped leaf must not retain an unfinishable decision')
    const result = await Strength.replicaAwaitOutcome(completion)
    assert.equal(result.terminal.kind, 'TextCompleted')
    assert.equal(result.requestsAdmitted, 1, 'empty terminal does not admit a repair request')
    assert.deepEqual(result.batches, [], 'bookkeeping is not invented readonly evidence')
    assert.equal(Strength.replicaLiveFind(handle, 'replica-empty-stop'), null)
    assert.deepEqual(Strength.replicaReleased(handle), ['replica-empty-stop'])
    assert.equal(Strength.replicaHandleTurn(handle, emptyStop), false)
    assert.deepEqual(Strength.replicaReleased(handle), ['replica-empty-stop'])
  } finally {
    Strength.replicaDispose(handle)
  }
})
test('WHAT[speculative-investigation-011] empty stop preserves complete readonly prefix but cannot settle a reused resident from an old physical turn', async () => {
  const { handle, completion } = attach('replica-prefix-stop', 3)
  try {
    await Strength.replicaHandleTransform(handle, oneBatch('replica-prefix-stop'))
    const emptyStop = {
      sessionId: 'replica-prefix-stop', physicalUserMessageId: 'u1', providerRun: 'empty-response',
      outcome: 'needs-continuation', finish: 'stop', parts: [],
    }
    Strength.replicaHandleTurn(handle, emptyStop)
    assert.equal(Strength.replicaPeek(handle, 'replica-prefix-stop'), null)
    const result = await Strength.replicaAwaitOutcome(completion)
    assert.equal(result.requestsAdmitted, 1)
    assert.deepEqual(result.batches, [{
      requestOrdinal: 1,
      exchanges: [{ toolName: 'read', canonicalArguments: '{"filePath":"a"}', canonicalResult: 'alpha' }],
    }])
    const next = Strength.replicaAttach(handle, binding('owner', 'replica-prefix-stop', 'next-decision', 2))
    assert.equal(next.ok, true, next.error)
    await Strength.replicaHandleTransform(handle, {
      messages: [user('u2', 'replica-prefix-stop', [hostText('next assignment')])],
    })
    Strength.replicaHandleTurn(handle, emptyStop)
    assert.equal(Strength.replicaPeek(handle, 'replica-prefix-stop').terminal, null)
    Strength.replicaHandleTurn(handle, { ...emptyStop, physicalUserMessageId: 'u2', providerRun: 'next-empty-response' })
    assert.equal(Strength.replicaPeek(handle, 'replica-prefix-stop'), null)
    const nextResult = await Strength.replicaAwaitOutcome(next.value.completion)
    assert.equal(nextResult.terminal.kind, 'TextCompleted')
    assert.deepEqual(nextResult.batches, [])
  } finally {
    Strength.replicaDispose(handle)
  }
})
test('WHAT[speculative-investigation-011] STRENGTH_011_session_delete_retires_live_and_orphan_bindings_with_one_lease_release', () => {
  const live = attach('replica-del', 1, 'owner-del')
  Strength.replicaSessionDeleted(live.handle, 'replica-del')
  assert.equal(Strength.replicaPeek(live.handle, 'replica-del'), null)
  assert.equal(Strength.replicaLiveFind(live.handle, 'replica-del'), null)
  assert.deepEqual(Strength.replicaReleased(live.handle), ['replica-del'])
  Strength.replicaSessionDeleted(live.handle, 'replica-del')
  assert.deepEqual(Strength.replicaReleased(live.handle), ['replica-del'])

  const orphan = Strength.replicaRuntimeCreate()
  assert.equal(Strength.replicaLiveRegister(orphan, binding('owner-orph', 'replica-orph', 'dec-orph', 1)).ok, true)
  assert.equal(Strength.replicaPeek(orphan, 'replica-orph'), null)
  Strength.replicaSessionDeleted(orphan, 'replica-orph')
  assert.equal(Strength.replicaLiveFind(orphan, 'replica-orph'), null)
  assert.deepEqual(Strength.replicaReleased(orphan), ['replica-orph'])

  const owned = attach('replica-owned', 1, 'owner-owned')
  Strength.replicaSessionDeleted(owned.handle, 'owner-owned')
  assert.equal(Strength.replicaPeek(owned.handle, 'replica-owned'), null)
  assert.deepEqual(Strength.replicaReleased(owned.handle), ['replica-owned'])
})
test('WHAT[speculative-investigation-011] STRENGTH_011_replica_dispose_keeps_first_terminal_and_clears_all_live_resources', async () => {
  const open = attach('replica-open', 1)
  Strength.replicaDispose(open.handle)
  const cancelled = await Strength.replicaAwaitOutcome(open.completion)
  assert.equal(cancelled.terminal.kind, 'Cancelled')
  assert.equal(Strength.replicaPeek(open.handle, 'replica-open'), null)
  assert.equal(Strength.replicaLiveFind(open.handle, 'replica-open'), null)
  assert.deepEqual(Strength.replicaReleased(open.handle), ['replica-open'])

  const closed = attach('replica-closed', 1)
  assert.equal(await Strength.replicaHandleTransform(closed.handle, { messages: [user('u1', 'replica-closed', [hostText('readonly assignment')])] }), true)
  assert.equal(Strength.replicaHandleTurn(closed.handle, {
    sessionId: 'replica-closed', physicalUserMessageId: 'u1', providerRun: 'run-t', outcome: 'completed', parts: [{ kind: 'text', text: 'plain answer' }],
  }), true)
  const first = await Strength.replicaAwaitOutcome(closed.completion)
  assert.equal(first.terminal.kind, 'TextCompleted')
  Strength.replicaDispose(closed.handle)
  const kept = await Strength.replicaAwaitOutcome(closed.completion)
  assert.deepEqual(kept, first)
  assert.deepEqual(Strength.replicaReleased(closed.handle), ['replica-closed'])
})
test('WHAT[speculative-investigation-011] STRENGTH_011_owner_cancel_releases_the_replica_without_promoting_material', async () => {
  const { handle } = attach('replica-cancel', 1, 'owner-cancel')
  await Strength.replicaCancelOwner(handle, 'owner-cancel')
  assert.equal(Strength.replicaPeek(handle, 'replica-cancel'), null)
  assert.equal(Strength.replicaLiveFind(handle, 'replica-cancel'), null)
  assert.deepEqual(Strength.replicaReleased(handle), ['replica-cancel'])
})

}

test('WHAT[speculative-investigation-011] registered transform diagnostics retain the first process fuse reason after later failure and cleanup', async () => {
  const assert = (await import('node:assert/strict')).default
  const { spawnSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const fixture = fileURLToPath(new URL('./support/fuse-diagnostic.fixture.mjs', import.meta.url))
  const child = spawnSync(process.execPath, [fixture], {
    encoding: 'utf8',
    env: { ...process.env, WANXIANGSHU_DIAG: '1' },
  })
  assert.ifError(child.error)
  assert.equal(child.signal, null, child.stderr)
  assert.equal(child.status, 0, child.stderr)
  assert.deepEqual(JSON.parse(child.stdout), {
    afterFirst: 'projection-conflict original cause',
    afterLaterFailureAndCleanup: 'projection-conflict original cause',
    afterPluginDispose: 'projection-conflict original cause',
  })
  const diagnostics = child.stderr.split('\n').flatMap((line) => {
    try { return [JSON.parse(line)] } catch { return [] }
  }).filter((record) => record.operation === 'strength-delegation-skip'
    && record.result?.startsWith('skipped-recovery-fuse'))
  assert.equal(diagnostics.length, 2, child.stderr)
  for (const record of diagnostics) {
    assert.equal(record.session_id, 'ses-fuse-diagnostic')
    assert.equal(record.result, 'skipped-recovery-fuse: projection-conflict original cause')
  }
  assert.doesNotMatch(child.stderr, /later-noise/)
})
