import test from 'node:test'

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");
const HostSignalSurface = await import("../../../dist/OpenCode/Host/HostSignalSurface.js");

const SESSION = 'ses_frag'
const decode = (raw) => HostSignalSurface.tryDecode(raw) ?? undefined
const decodeExecutionEnd = (raw) => HostSignalSurface.tryDecodePhysicalExecutionEnd(raw) ?? undefined
const decodeStepEnd = (raw) => HostSignalSurface.tryDecodeProviderStepEnd(raw) ?? undefined

test('WHAT[host-boundary-001] HOST_001_fragment_events_die_at_earliest_boundary', () => {
  const fragments = [
    { type: 'message.updated', properties: { sessionID: SESSION } },
    { type: 'part.delta', properties: { sessionID: SESSION } },
    { type: 'session.updated', properties: { sessionID: SESSION } },
    { type: 'chat.message', properties: { sessionID: SESSION } },
  ]
  assert.deepEqual(fragments.map(decode), [undefined, undefined, undefined, undefined])
})
test('WHAT[host-boundary-001] HOST_001_terminal_message_identity_is_physical_capacity_evidence_not_a_business_signal', () => {
  const running = {
    type: 'message.updated',
    properties: {
      sessionID: SESSION,
      info: { role: 'assistant', parentID: 'msg-current', time: { created: 1 } },
    },
  }
  const toolCallStep = {
    type: 'message.updated',
    properties: {
      // Plugin Hooks.event is typed against the legacy SDK Event, where the
      // session identity lives on info. The decoder also accepts v2's outer
      // properties.sessionID shape.
      info: {
        sessionID: SESSION,
        id: 'run-tool-call',
        role: 'assistant',
        parentID: 'msg-current',
        time: { created: 1, completed: 2 },
        finish: 'tool-calls',
      },
    },
  }
  const completed = {
    type: 'message.updated',
    properties: {
      info: {
        sessionID: SESSION,
        id: 'run-final',
        role: 'assistant',
        parentID: 'msg-current',
        time: { created: 1, completed: 3 },
        finish: 'stop',
      },
    },
  }
  const failed = {
    type: 'message.updated',
    properties: {
      info: {
        sessionID: SESSION,
        id: 'run-failed',
        role: 'assistant',
        parentID: 'msg-current',
        time: { created: 1, completed: 2 },
        error: { name: 'ProviderError' },
      },
    },
  }

  assert.equal(decode(running), undefined)
  assert.equal(decode(toolCallStep), undefined)
  assert.equal(decode(completed), undefined, 'message.updated still never becomes a business HostSignal')
  assert.equal(decodeExecutionEnd(running), undefined)
  assert.deepEqual(decodeStepEnd(toolCallStep), {
    sessionId: SESSION,
    physicalUserMessageId: 'msg-current',
    providerRun: 'run-tool-call',
  }, 'tool-calls ends the provider step even though the physical execution continues')
  assert.equal(
    decodeExecutionEnd(toolCallStep),
    undefined,
    'a completed tool-call provider step is not the end of the physical user execution',
  )
  assert.deepEqual(decodeExecutionEnd(completed), {
    sessionId: SESSION,
    physicalUserMessageId: 'msg-current',
  })
  assert.deepEqual(decodeStepEnd(completed), {
    sessionId: SESSION,
    physicalUserMessageId: 'msg-current',
    providerRun: 'run-final',
  })
  assert.deepEqual(decodeStepEnd(failed), {
    sessionId: SESSION,
    physicalUserMessageId: 'msg-current',
    providerRun: 'run-failed',
  })
  assert.equal(decodeExecutionEnd(failed), undefined)
  assert.equal(
    decodeExecutionEnd({ type: 'session.idle', properties: { sessionID: SESSION } }),
    undefined,
    'coarse idle has no physical identity and therefore cannot own capacity release',
  )
})
}

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");
const routing = await import("../../../dist/OpenCode/Host/ModelRoutingSurface.js");
const signals = await import("../../../dist/OpenCode/Host/HostSignalSurface.js");

const target = { model: 'provider/retry-stable', reasoning: 'none' }
const admit = async (runtime, sessionId, physicalUserMessageId, role, participant, lenderSessionId) => {
  const acquisition = await routing.acquireExecutionAdmission(
    runtime,
    sessionId,
    physicalUserMessageId,
    role,
    participant,
    lenderSessionId,
  )
  assert.equal(acquisition.kind, 'Acquired')
  const projected = routing.executionAdmissionTarget(runtime, acquisition.lease)
  const settlement = routing.commitExecutionAdmission(runtime, acquisition.lease, {
    sessionId,
    physicalUserMessageId,
    role,
    participant,
    target: projected,
  })
  assert.ok(['Applied', 'AlreadyApplied'].includes(settlement.kind))
}

test('WHAT[host-boundary-001] HOST_001_failed_provider_step_keeps_same_physical_execution_binding_for_host_retry', async () => {
  const runtime = routing.createRuntime(() => target)
  const sessionId = 'session-retry'
  const physicalUserMessageId = 'msg-retry'
  const role = 'engineer'
  const participant = 'engineer'

  await admit(runtime, sessionId, physicalUserMessageId, role, participant, undefined)
  await routing.enterProviderStep(runtime, sessionId, physicalUserMessageId, [])

  const failedAssistant = {
    type: 'message.updated',
    properties: {
      info: {
        sessionID: sessionId,
        id: 'run-failed',
        role: 'assistant',
        parentID: physicalUserMessageId,
        time: { created: 1, completed: 2 },
        error: { name: 'ProviderError' },
      },
    },
  }

  const stepEnd = signals.tryDecodeProviderStepEnd(failedAssistant)
  assert.deepEqual(stepEnd, {
    sessionId,
    physicalUserMessageId,
    providerRun: 'run-failed',
  })
  routing.endProviderStep(runtime, stepEnd.sessionId, stepEnd.physicalUserMessageId, stepEnd.providerRun)

  const physicalEnd = signals.tryDecodePhysicalExecutionEnd(failedAssistant)
  assert.equal(physicalEnd, null)
  if (physicalEnd !== null) {
    routing.releasePhysicalExecution(runtime, physicalEnd.sessionId, physicalEnd.physicalUserMessageId)
  }

  await routing.enterProviderStep(runtime, sessionId, physicalUserMessageId, ['run-failed'])
  assert.deepEqual(routing.tryLease(runtime, sessionId, physicalUserMessageId, role, participant, undefined), target)
})
test('WHAT[host-boundary-001] HOST_001_ambiguous_finish_keeps_same_physical_execution_binding_for_host_retry', async () => {
  for (const finish of ['unknown', 'error']) {
    const runtime = routing.createRuntime(() => target)
    const sessionId = `session-retry-${finish}`
    const physicalUserMessageId = `msg-retry-${finish}`
    const providerRun = `run-${finish}`
    const role = 'engineer'
    const participant = 'engineer'

    await admit(runtime, sessionId, physicalUserMessageId, role, participant, undefined)
    await routing.enterProviderStep(runtime, sessionId, physicalUserMessageId, [])

    // OpenCode can normalize an upstream streaming failure into a completed
    // assistant with an ambiguous finish and no error field, then retry the
    // same PhysicalUserMessageId. That ends the provider step, not the physical
    // execution.
    const ambiguousAssistant = {
      type: 'message.updated',
      properties: {
        info: {
          sessionID: sessionId,
          id: providerRun,
          role: 'assistant',
          parentID: physicalUserMessageId,
          time: { created: 1, completed: 2 },
          finish,
        },
      },
    }

    const stepEnd = signals.tryDecodeProviderStepEnd(ambiguousAssistant)
    assert.deepEqual(stepEnd, { sessionId, physicalUserMessageId, providerRun })
    routing.endProviderStep(runtime, stepEnd.sessionId, stepEnd.physicalUserMessageId, stepEnd.providerRun)

    const physicalEnd = signals.tryDecodePhysicalExecutionEnd(ambiguousAssistant)
    assert.equal(physicalEnd, null)
    if (physicalEnd !== null) {
      routing.releasePhysicalExecution(runtime, physicalEnd.sessionId, physicalEnd.physicalUserMessageId)
    }

    await routing.enterProviderStep(runtime, sessionId, physicalUserMessageId, [providerRun])
    assert.deepEqual(routing.tryLease(runtime, sessionId, physicalUserMessageId, role, participant, undefined), target)
  }
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

test('WHAT[host-boundary-001] MISC_signals_router_loop_delta_bypasses_adapt', () => {
  // Loop text deltas are not coarse session lifecycle signals — the codec
  // drops them before adaptation. tryAdapt returns null.
  assert.equal(HostSignalSurface.tryAdapt(['x'], { type: 'message.part.delta', properties: { sessionID: 'x' } }), null)
  // But a real signal for the same owned session does adapt.
  assert.notEqual(HostSignalSurface.tryAdapt(['x'], errorRaw('x')), null)
})
}
