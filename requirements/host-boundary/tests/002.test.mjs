import test from 'node:test'

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");
const HostSignalSurface = await import("../../../dist/OpenCode/Host/HostSignalSurface.js");

const SESSION = 'ses_frag'
const decode = (raw) => HostSignalSurface.tryDecode(raw) ?? undefined
const decodeExecutionEnd = (raw) => HostSignalSurface.tryDecodePhysicalExecutionEnd(raw) ?? undefined
const decodeStepEnd = (raw) => HostSignalSurface.tryDecodeProviderStepEnd(raw) ?? undefined

test('WHAT[host-boundary-002] HOST_001_only_coarse_session_lifecycle_signals_cross_the_boundary', () => {
  const idle = decode({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } })
  const dedicatedIdle = decode({ type: 'session.idle', properties: { sessionID: SESSION } })
  const retry = decode({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'retry', attempt: 2 } } })
  const deleted = decode({ type: 'session.deleted', properties: { sessionID: SESSION, parentID: 'root' } })
  const aborted = decode({ type: 'session.error', properties: { sessionID: SESSION, error: { name: 'AbortError' } } })
  assert.equal(idle.kind, 'SessionIdle')
  assert.equal(dedicatedIdle.kind, 'SessionIdle')
  assert.equal(retry.kind, 'ProviderRetry')
  assert.equal(deleted.kind, 'SessionDeleted')
  assert.equal(deleted.parentSessionId, 'root')
  assert.equal(aborted.kind, 'AttemptAborted')
})
}

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");
const HostSignalSurface = await import("../../../dist/OpenCode/Host/HostSignalSurface.js");
const HostSignalSubscribeSurface = await import("../../../dist/OpenCode/Host/HostSignalSubscribeSurface.js");

const idleRaw = (sessionId) => ({ type: 'session.status', sessionID: sessionId, properties: { status: { type: 'idle' } } })
const dedicatedIdleRaw = (sessionId) => ({ type: 'session.idle', properties: { sessionID: sessionId } })
const retryRaw = (sessionId) => ({ type: 'session.status', sessionID: sessionId, properties: { status: { type: 'retry', attempt: '2', message: 'rate limited' } } })
const deletedRaw = (sessionId, parentID) => ({ type: 'session.deleted', sessionID: sessionId, properties: { parentID } })
const errorRaw = (sessionId, name = 'TimeoutError') => ({ type: 'session.error', sessionID: sessionId, properties: { error: { name } } })
const trySubscribe = async (input = {}) => HostSignalSubscribeSurface.trySubscribe(input, () => {})

test('WHAT[host-boundary-002] the host signal boundary exposes the exact typed coarse-signal set', () => {
  assert.deepEqual(HostSignalSurface.tryDecode(idleRaw('s1')), {
    kind: 'SessionIdle',
    sessionId: 's1',
  })
  assert.deepEqual(HostSignalSurface.tryDecode(dedicatedIdleRaw('s1')), {
    kind: 'SessionIdle',
    sessionId: 's1',
  })
  assert.deepEqual(HostSignalSurface.tryDecode(retryRaw('s1')), {
    kind: 'ProviderRetry',
    sessionId: 's1',
    attempt: '2',
    failure: 'ProviderTransient',
    diagnostic: 'rate limited',
  })
  assert.deepEqual(HostSignalSurface.tryDecode(deletedRaw('s1', 'owner-1')), {
    kind: 'SessionDeleted',
    sessionId: 's1',
    parentSessionId: 'owner-1',
  })
  assert.deepEqual(HostSignalSurface.tryDecode(errorRaw('s1', 'OverloadedError')), {
    kind: 'ProviderFailure',
    sessionId: 's1',
    failure: 'ProviderTransient',
    diagnostic: 'provider failure',
  })
  assert.deepEqual(HostSignalSurface.tryDecode(errorRaw('s1', 'AbortError')), {
    kind: 'AttemptAborted',
    sessionId: 's1',
    failure: 'UserCancelled',
    diagnostic: 'provider failure',
  })
  assert.deepEqual(HostSignalSurface.tryDecode({ event: idleRaw('s2') }), {
    kind: 'SessionIdle',
    sessionId: 's2',
  })
  assert.deepEqual(HostSignalSurface.tryDecode({ payload: { ...idleRaw('s3'), sessionId: 's3' } }), {
    kind: 'SessionIdle',
    sessionId: 's3',
  })
  assert.equal(HostSignalSurface.tryDecode(null), null)
  assert.equal(HostSignalSurface.tryDecode({ type: 'chat.message', sessionID: 's1' }), null)
  assert.equal(HostSignalSurface.tryDecode({ type: 'session.status', sessionID: 's1', properties: { status: { type: 'busy' } } }), null)
})
test('WHAT[host-boundary-002] R3_abort_error_adapts_to_attempt_aborted_not_dropped', () => {
  assert.deepEqual(HostSignalSurface.tryDecode(errorRaw('s1', 'MessageAbortedError')), {
    kind: 'AttemptAborted',
    sessionId: 's1',
    failure: 'UserCancelled',
    diagnostic: 'provider failure',
  })
  assert.deepEqual(HostSignalSurface.tryAdapt(['s1'], errorRaw('s1', 'AbortError')), {
    kind: 'AttemptAborted',
    sessionId: 's1',
    failure: 'UserCancelled',
    diagnostic: 'provider failure',
  })
  assert.equal(HostSignalSurface.tryAdapt([], errorRaw('s1', 'AbortError')), null)
  assert.deepEqual(HostSignalSurface.tryAdapt([], errorRaw('s1', 'OverloadedError')), {
    kind: 'ProviderFailure',
    sessionId: 's1',
    failure: 'ProviderTransient',
    diagnostic: 'provider failure',
  })
})
test('WHAT[host-boundary-002] MISC_signals_try_adapt_ownership_gate', () => {
  // Production tryAdapt: unowned session signals are dropped except
  // ProviderFailure which always crosses (isOwned || signal is ProviderFailure).
  assert.equal(HostSignalSurface.tryAdapt([], idleRaw('s1')), null)
  assert.notEqual(HostSignalSurface.tryAdapt([], errorRaw('s1')), null)
  assert.notEqual(HostSignalSurface.tryAdapt(['s1'], idleRaw('s1')), null)
})
test('WHAT[host-boundary-002] MISC_signals_router_register_unregister', () => {
  // Production tryAdapt uses the owned array as a set; register = add to
  // array, unregister = remove. The ownership gate is the production
  // adapter, not a test-side router.
  assert.notEqual(HostSignalSurface.tryAdapt(['s1'], idleRaw('s1')), null)
  assert.notEqual(HostSignalSurface.tryAdapt(['s1'], retryRaw('s1')), null)
  assert.equal(HostSignalSurface.tryAdapt([], idleRaw('s1')), null)
})
test('WHAT[host-boundary-002] mutation_canary_ProviderFailure_crosses_without_ownership', () => {
  // ProviderFailure must always cross the boundary even for unowned sessions.
  // If someone adds an ownership gate to ProviderFailure, this canary fails.
  assert.notEqual(HostSignalSurface.tryAdapt([], errorRaw('s1', 'OverloadedError')), null,
    'mutation guard: ProviderFailure must cross without ownership')
})
}
