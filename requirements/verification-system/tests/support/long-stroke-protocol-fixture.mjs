import assert from 'node:assert/strict'
import * as Strength from '../../../../dist/Strength/Surface.js'
import * as Hooks from '../../../../dist/OpenCode/Host/PluginHooksSurface.js'
import { createState } from '../e2e/support/strict-mock-state.js'
import { respond } from '../e2e/support/strict-mock-responses.js'
import { createLocalEventStore } from './local-event-store.mjs'
import { createHash } from 'node:crypto'
import * as Projection from '../../../../dist/Participant/Provider/Projection/Surface.js'

// Decode the real provider's written SSE, independently of its source ledger.
const emittedCalls = (writes) => {
  const calls = new Map()
  for (const line of writes.join('').split('\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
    const chunk = JSON.parse(line.slice(6))
    for (const delta of chunk.choices?.[0]?.delta?.tool_calls ?? []) {
      const call = calls.get(delta.index) ?? { id: '', name: '', arguments: '' }
      if (delta.id) call.id = delta.id
      if (delta.function?.name) call.name += delta.function.name
      if (delta.function?.arguments) call.arguments += delta.function.arguments
      calls.set(delta.index, call)
    }
  }
  return [...calls.values()]
}

export async function delegationProtocolFixture(workDir, { extraCalls = [], businessFields = false, resultText = 'Actual completed tool result' } = {}) {
  const tools = ['js-manager', 'read', 'join', 'custom_tool'].map((name) => {
    const definition = {
      description: `Original ${name} definition`,
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    }
    if (businessFields && Strength.classifyTool(name) !== 'EstimateAfterCall') {
      Object.assign(definition.parameters.properties, {
        estimated_readonly_rounds: { type: 'string', description: 'Business estimate label' },
        self_note: { type: 'object', description: 'Business note payload' },
        delegate_readonly_rounds: { type: 'boolean', description: 'Business legacy label' },
      })
      definition.parameters.required.push('estimated_readonly_rounds', 'self_note')
    }
    const original = structuredClone(definition)
    Hooks.decorateReadonlyDelegationToolDefinition(name, definition)
    if (Strength.classifyTool(name) !== 'EstimateAfterCall') assert.deepEqual(definition, original)
    return { type: 'function', function: { name, ...definition } }
  })
  const state = createState()
  const toolCallBatches = []
  const requests = []
  const snapshots = new Map()
  const facts = []
  const addBatch = async (sessionID, history, calls) => {
    for (const call of calls) {
      if (Strength.classifyTool(call.tool) !== 'EstimateAfterCall') continue
      const parsed = Strength.parseParticipatingArguments(call.args)
      assert.equal(parsed.ok, true, `${call.tool}: fixture must use the real argument contract`)
      assert.deepEqual(Hooks.readonlyDelegationSelfNoteOf(call.args), { ok: true, note: parsed.selfNote })
    }
    const request = { sessionID, model: 'test-model-b', tools, messages: structuredClone(history) }
    requests.push(request)
    state.requests.push(request)
    const writes = []
    const sink = { writeHead() {}, write(chunk) { writes.push(chunk) }, end() {} }
    await respond(state, sink, { respond: { type: 'tool-calls', calls } }, request, { sessionId: sessionID })
    assert.ok(writes.includes('data: [DONE]\n\n'), 'source evidence requires an actual completed SSE response')
    const source = { sessionId: sessionID, requestIndex: requests.length - 1, calls: emittedCalls(writes) }
    toolCallBatches.push(source)
    const restored = source.calls.map((call) => {
      const args = JSON.parse(call.arguments)
      const original = structuredClone(args)
      if (Strength.classifyTool(call.name) === 'EstimateAfterCall') {
        Hooks.hideReadonlyDelegationArgs(args)
        assert.equal(Object.hasOwn(args, 'estimated_readonly_rounds'), false)
        assert.equal(Object.hasOwn(args, 'self_note'), false)
        Hooks.restoreReadonlyDelegationArgs(args)
      }
      assert.deepEqual(args, original, 'history must use the real same-call restoration result')
      return { id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(args) } }
    })
    history.push({ role: 'assistant', tool_calls: restored })
    for (const call of restored) history.push({ role: 'tool', tool_call_id: call.id, content: resultText })
    const carrier = { sessionID, model: 'test-model-b', tools, messages: structuredClone(history) }
    requests.push(carrier)
    state.requests.push(carrier)
  }
  for (const [sessionID, rounds] of [['owner-normal', 2], ['owner-recovery', 1]]) {
    const history = [{ role: 'user', content: `Original ${sessionID} task` }]
    await addBatch(sessionID, history, [{ tool: 'js-manager', args: {
      path: `${sessionID}.txt`, estimated_readonly_rounds: rounds, self_note: `  ${sessionID}\t original note\n`,
    } }, ...(sessionID === 'owner-normal' ? extraCalls : [])])
    await addBatch(sessionID, history, [{ tool: 'read', args: { path: `${sessionID}.txt`, estimated_readonly_rounds: 0 } }])
    const [source, target] = toolCallBatches.filter((batch) => batch.sessionId === sessionID)
    const physical = `protocol-root-${sessionID}`
    const sourceProviderRun = `protocol-source-${sessionID}`
    const targetProviderRun = `protocol-target-${sessionID}`
    const parts = (batch) => batch.calls.map((call) => ({ type: 'tool', tool: call.name, callID: call.id,
      state: { status: 'completed', input: JSON.parse(call.arguments) } }))
    snapshots.set(sessionID, [
      { info: { id: physical, role: 'user' }, parts: [{ type: 'text', text: history[0].content }] },
      { info: { id: sourceProviderRun, role: 'assistant', parentID: physical }, parts: parts(source) },
      { info: { id: targetProviderRun, role: 'assistant', parentID: physical }, parts: parts(target) },
    ])
    facts.push(Strength.eventRequested({ decisionId: `protocol-decision-${sessionID}`, ownerSessionId: sessionID,
      ownerLogicalRun: { logicalRunId: `protocol-logical-${sessionID}`, authorityRootUserMessageId: physical },
      sourcePhysicalUserMessageId: physical, sourceProviderRun, sourceToolCallIds: source.calls.map((call) => call.id),
      requestedRounds: rounds, contractRevision: Strength.protocolRevision }),
    Strength.eventBound(`protocol-decision-${sessionID}`, targetProviderRun, `protocol-replica-${sessionID}`, 'protocol-anchor'))
  }
  const local = createLocalEventStore({ commonDir: workDir + '/.git', writerId: 'protocol-oracle' })
  try {
    const durability = Strength.durabilityCreate(local.store)
    for (const fact of facts) {
      const appended = await Strength.durabilityAppend(durability, fact)
      assert.equal(appended.ok, true, appended.error)
    }
  } finally { local.close() }
  return { host: { workDir }, provider: { requests, toolCallBatches }, sourceState: state, tools,
    client: { messages: async (owner) => ({ ok: true, data: snapshots.get(owner) ?? [] }) } }
}

export async function appendProtocolReplicaProjection(scenario) {
  const sessionId = 'protocol-replica-owner-normal'
  const state = scenario.sourceState
  const requestIndex = scenario.provider.requests.length
  const request = { sessionID: sessionId, model: 'test-model-b', tools: [],
    messages: [{ role: 'user', content: 'Readonly continuation of the original task' }] }
  scenario.provider.requests.push(request)
  state.requests.push(request)
  const writes = []
  const sink = { writeHead() {}, write(chunk) { writes.push(chunk) }, end() {} }
  await respond(state, sink, { respond: { type: 'tool-call', tool: 'js-predictor',
    args: { program: 'readonly probe', estimated_readonly_rounds: 0 } } }, request, { sessionId })
  const calls = emittedCalls(writes)
  assert.equal(calls.length, 1)
  scenario.provider.toolCallBatches.push({ sessionId, requestIndex, calls })
  const sha256 = (text) => createHash('sha256').update(text).digest('hex')
  const source = calls[0]
  const batches = Strength.collectCompleteBatches([
    { role: 'assistant', parts: [{ kind: 'tool-call', callId: source.id, name: source.name, args: source.arguments }] },
    { role: 'tool', parts: [{ kind: 'tool-result', callId: source.id, result: 'Actual readonly Replica evidence' }] },
  ])
  const built = Strength.frameTryBuild(sha256, batches)
  assert.equal(built.ok, true, built.error)
  const intent = Strength.candidate(sha256, { ownerSessionId: 'owner-normal', ownerRole: 'manager',
    decisionId: 'protocol-decision-owner-normal', targetProviderRun: 'protocol-target-owner-normal',
    currentProviderRun: 'protocol-target-owner-normal', bundle: built.value })
  assert.equal(intent.ok, true, intent.error)
  const rendered = Projection.renderMessages(Projection.projectionSnapshot(Projection.semanticProjection([])), [], [intent.value])
  const projected = rendered.flatMap((message) => message.role === 'assistant'
    ? [{ role: 'assistant', tool_calls: message.parts.filter((part) => part.kind === 'tool-call')
      .map((part) => ({ id: part.callId, type: 'function', function: { name: part.name, arguments: part.args } })) }]
    : message.parts.filter((part) => part.kind === 'tool-result')
      .map((part) => ({ role: 'tool', tool_call_id: part.callId, content: part.result })))
  assert.equal(projected[0].tool_calls[0].function.name, 'js-manager', 'the owner name must come from the real projection')
  assert.notEqual(projected[0].tool_calls[0].id, source.id, 'the real projection localizes the Replica identity')
  assert.deepEqual(JSON.parse(projected[0].tool_calls[0].function.arguments), JSON.parse(source.arguments))
  const previous = scenario.provider.requests.findLast((item) => item.sessionID === 'owner-normal')
  const carrier = { ...previous, messages: [...structuredClone(previous.messages), ...projected] }
  scenario.provider.requests.push(carrier)
  state.requests.push(carrier)
  return projected[0].tool_calls[0]
}
