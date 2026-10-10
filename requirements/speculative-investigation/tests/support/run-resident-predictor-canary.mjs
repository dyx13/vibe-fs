import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { ProcessHost } from '../../../verification-system/tests/e2e/support/process-host.js'
import { initGitWorkspace } from '../../../verification-system/tests/e2e/support/process-host-utils.js'
import { buildTextChunks, buildToolCallChunks, sendJSON, sendSSE } from '../../../verification-system/tests/e2e/support/strict-mock-sse.js'
const root = path.resolve(import.meta.dirname, '../../../..')
const instruction = fs.readFileSync(path.join(root, 'resources/provider/delegation/readonly-investigation/en.md'), 'utf8').trim()
const allProviderRequests = []
const replicaRequests = []
let ownerStep = 0
let replicaStep = 0
let subOwnerStep = 0
const predictorConclusion = step => `Predictor conclusion ${step}.`
const predictorTextChunks = step => {
  const chunks = buildTextChunks(`replica-done-${step}`, predictorConclusion(step), 20)
  return [{
    ...chunks[0],
    choices: [{ index: 0, delta: { role: 'assistant', reasoning_content: `Predictor private ${step}.` }, finish_reason: null }],
  }, ...chunks]
}
const provider = http.createServer(async (req, res) => {
  if (req.method === 'GET') {
    sendJSON(res, 200, { object: 'list', data: [{ id: 'test-model', object: 'model' }] })
    return
  }
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = JSON.parse(Buffer.concat(chunks).toString())
  allProviderRequests.push(body)
  const names = (body.tools ?? []).map(tool => tool.function?.name ?? tool.name)
  if (names.includes('js-predictor')) {
    replicaRequests.push(body)
    replicaStep += 1
    // Decision 1 (replicaStep 1..3): 2 rounds of js-predictor tool calls, then completed on round 3
    if (replicaStep === 1 || replicaStep === 2) {
      fs.writeFileSync(path.join(workspace, 'fixture.txt'), `readonly-evidence-${replicaStep}`)
      sendSSE(res, buildToolCallChunks(`replica-${replicaStep}`, 'js-predictor', JSON.stringify({ program: "class Js extends JsProgram { async run() { const f = await this.file('fixture.txt'); return f.text('^', '$'); } }" }), 10))
      return
    }
    if (replicaStep === 3) {
      sendSSE(res, predictorTextChunks(replicaStep))
      return
    }
    // Decision 2 (replicaStep 4..5, budget 2):
    // Round 1 (replicaStep 4): model calls malformed / unknown tool (e.g. "<tool_call>js-predictor")
    // causing Host to record status=error (no readonly exchange collected for request ordinal 1)
    if (replicaStep === 4) {
      sendSSE(res, buildToolCallChunks(`replica-${replicaStep}`, '<tool_call>js-predictor', JSON.stringify({ program: "malformed" }), 10))
      return
    }
    // Round 2 (replicaStep 5): model recovers and calls valid js-predictor tool (request ordinal 2 from host perspective)
    if (replicaStep === 5) {
      fs.writeFileSync(path.join(workspace, 'fixture.txt'), `readonly-evidence-${replicaStep}`)
      sendSSE(res, buildToolCallChunks(`replica-${replicaStep}`, 'js-predictor', JSON.stringify({ program: "class Js extends JsProgram { async run() { const f = await this.file('fixture.txt'); return f.text('^', '$'); } }" }), 10))
      return
    }
    // Decision 3 (post restart, replicaStep 6..7):
    if (replicaStep === 6) {
      fs.writeFileSync(path.join(workspace, 'fixture.txt'), `readonly-evidence-${replicaStep}`)
      sendSSE(res, buildToolCallChunks(`replica-${replicaStep}`, 'js-predictor', JSON.stringify({ program: "class Js extends JsProgram { async run() { const f = await this.file('fixture.txt'); return f.text('^', '$'); } }" }), 10))
      return
    }
    if (replicaStep === 7) {
      sendSSE(res, predictorTextChunks(replicaStep))
      return
    }
    // Decision 4 (sub-owner, replicaStep 8..9):
    if (replicaStep === 8) {
      fs.writeFileSync(path.join(workspace, 'fixture.txt'), `readonly-evidence-${replicaStep}`)
      sendSSE(res, buildToolCallChunks(`replica-${replicaStep}`, 'js-predictor', JSON.stringify({ program: "class Js extends JsProgram { async run() { const f = await this.file('fixture.txt'); return f.text('^', '$'); } }" }), 10))
      return
    }
    if (replicaStep === 9) {
      sendSSE(res, predictorTextChunks(replicaStep))
      return
    }
    return
  }
  if (names.includes('js-engineer')) {
    subOwnerStep += 1
    if (subOwnerStep === 1) {
      sendSSE(res, buildToolCallChunks('owner-sub', 'js-engineer', JSON.stringify({
        program: "class Js extends JsProgram { async run() { const f = await this.file('fixture.txt'); return f.text('^', '$'); } }",
        estimated_readonly_rounds: 2,
        self_note: 'Inspect the fixture and stop once its contents are verified.',
      }), 10))
    } else {
      sendSSE(res, buildTextChunks('owner-done-sub-owner', 'Sub-owner smoke complete.', 20))
    }
    return
  }
  if (names.includes('js-manager')) {
    ownerStep += 1
    if (ownerStep === 1) {
      sendSSE(res, buildToolCallChunks(`owner-${ownerStep}`, 'js-manager', JSON.stringify({ program: "class Js extends JsProgram { async run() { const f = await this.file('fixture.txt'); return f.text('^', '$'); } }", contract: 'do-not-use-except-for-review', estimated_readonly_rounds: 3, self_note: 'Inspect the fixture in two tool rounds plus terminal.' }), 10))
    } else if (ownerStep === 2) {
      sendSSE(res, buildToolCallChunks(`owner-${ownerStep}`, 'js-manager', JSON.stringify({ program: "class Js extends JsProgram { async run() { const f = await this.file('fixture.txt'); return f.text('^', '$'); } }", contract: 'do-not-use-except-for-review', estimated_readonly_rounds: 2, self_note: 'Inspect the fixture with one malformed and one valid tool.' }), 10))
    } else if (ownerStep === 3) {
      sendSSE(res, buildTextChunks('owner-done', 'Smoke complete.', 20))
    } else if (ownerStep === 4) {
      sendSSE(res, buildToolCallChunks(`owner-${ownerStep}`, 'js-manager', JSON.stringify({ program: "class Js extends JsProgram { async run() { const f = await this.file('fixture.txt'); return f.text('^', '$'); } }", contract: 'do-not-use-except-for-review', estimated_readonly_rounds: 2, self_note: 'Inspect the fixture third time post restart.' }), 10))
    } else {
      sendSSE(res, buildTextChunks('owner-done-post-restart', 'Restart smoke complete.', 20))
    }
    return
  }
  sendSSE(res, buildTextChunks('aux', 'Auxiliary response.', 20))
})
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve))
const scenarioDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wxs-assignment-smoke-'))
const workspace = path.join(scenarioDir, 'workspace')
fs.mkdirSync(workspace)
fs.writeFileSync(path.join(workspace, 'fixture.txt'), 'verified fixture evidence\n')
fs.writeFileSync(path.join(workspace, 'opencode.json'), JSON.stringify({
  provider: { test: { models: { 'test-model': {
    reasoning: true, interleaved: { field: 'reasoning_content' },
  } } } },
}))
await initGitWorkspace(workspace)
let currentHost = new ProcessHost()
const request = async (hostInstance, method, pathname, body) => {
  const response = await fetch(hostInstance.baseUrl + pathname, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  assert.ok(response.ok, `${method} ${pathname}: ${response.status} ${text}`)
  return text ? JSON.parse(text) : null
}
let session
let subOwner
let timer
const promptOwner = async (messageID, text, targetSession = session, agent = 'manager') => {
  try {
    return await Promise.race([
      request(currentHost, 'POST', `/session/${targetSession}/message`, {
        messageID,
        agent,
        model: { providerID: 'test', modelID: 'test-model' },
        parts: [{ type: 'text', text }],
      }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Owner assignment did not complete')), 45000) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
try {
  await currentHost.start({ scenarioDir, providerUrl: `http://127.0.0.1:${provider.address().port}/v1`, pluginPaths: [path.join(root, 'dist/OpenCode/Plugin/Plugin.js')], routingSource: `export const routingProtocol = 2\nexport const hasTheoreticalCapacity = () => true\nexport const predictorConfiguration = () => ({ state: 'configured', reason: null })\nexport default function route() { return { model: 'test/test-model', reasoning: 'none' } }\n` })
  const created = await request(currentHost, 'POST', '/session', { title: 'resident predictor canary' })
  session = created.id
  assert.ok(session)
  const first = await promptOwner('msg_assignment_smoke', 'Review the fixture, checking it in two successive investigation batches.')
  assert.ok(first.info.time.completed)
  assert.ok(first.parts.some(part => part.text === 'Smoke complete.'))
  assert.equal(replicaRequests.length, 5, 'decision 1 has 3 requests (2 tool rounds + 1 completion), decision 2 has 2 requests')
  const childrenPayload1 = await request(currentHost, 'GET', `/session/${session}/children`)
  const residents = childrenPayload1.filter(child => child.permission?.some(rule => rule.permission === 'js-predictor' && rule.action === 'allow'))
  assert.equal(residents.length, 1, 'one readonly resident before restart')
  const residentChildId = residents[0].id
  assert.equal(residents[0].parentID, session, 'predictor physical parent is the main session')

  // Process restart: stop host, launch new host with same scenarioDir/storage
  await currentHost.stop()
  currentHost = new ProcessHost()
  await currentHost.start({ scenarioDir, providerUrl: `http://127.0.0.1:${provider.address().port}/v1`, pluginPaths: [path.join(root, 'dist/OpenCode/Plugin/Plugin.js')], routingSource: `export const routingProtocol = 2\nexport const hasTheoreticalCapacity = () => true\nexport const predictorConfiguration = () => ({ state: 'configured', reason: null })\nexport default function route() { return { model: 'test/test-model', reasoning: 'none' } }\n` })

  // Send third assignment to same main session post restart
  const restarted = await promptOwner('msg_assignment_restart', 'Review the fixture a third time post restart.')
  assert.ok(restarted.info.time.completed)
  assert.ok(restarted.parts.some(part => part.text === 'Restart smoke complete.'))

  assert.equal(replicaRequests.length, 7, 'decision 1 has 3 requests, decision 2 has 2 (1 malformed tool + 1 js-predictor, budget reached), decision 3 has 2 (total 7 across 3 decisions)')
  for (const body of replicaRequests) {
    assert.deepEqual(body.tools.map(tool => tool.function?.name ?? tool.name), ['js-predictor'])
    assert.ok(body.messages.some(message => message.role === 'system' && JSON.stringify(message.content).includes(instruction)), JSON.stringify(body.messages.filter(message => message.role === 'system' || message.role === 'developer')))
  }
  const childrenPayload = await request(currentHost, 'GET', `/session/${session}/children`)
  const children = childrenPayload
  const transcripts = []
  for (const child of children) {
    const messagesPayload = await request(currentHost, 'GET', `/session/${child.id}/message`)
    const messages = messagesPayload
    const prompts = messages.filter(message => message.info?.role === 'user').flatMap(message => message.parts ?? []).filter(part => part.type === 'text').map(part => part.text)
    if (prompts.includes(instruction)) transcripts.push({ child: child.id, prompts, messages })
  }
  assert.equal(transcripts.length, 1, 'one resident predictor child reused across restart')
  assert.equal(transcripts[0].child, residentChildId, 'child ID must match across process restart')
  assert.deepEqual(transcripts[0].prompts, [instruction, instruction, instruction])
  assert.doesNotMatch(currentHost.stderrLog, /ActiveRunIdentityConflict|prompt_async failed|failed ref=|fuse|bundle invalid/i)

  const eventFiles = fs.readdirSync(path.join(workspace, '.git/wanxiangshu/events'))
  const events = eventFiles.flatMap(file => fs.readFileSync(path.join(workspace, '.git/wanxiangshu/events', file), 'utf8').trim().split('\n').map(line => JSON.parse(line)))
  const bound = events.filter(event => event.event_type === 'DelegationBound')
  assert.equal(bound.length, 3, 'exactly 3 Bound decisions')

  const prepared = events.filter(event => event.event_type === 'StrengthCandidatePrepared')
  assert.equal(prepared.length, 3, 'exactly 3 Prepared decisions')

  const requested = events.filter(event => event.event_type === 'DelegationRequested')
  assert.equal(requested.length, 3, 'each real source batch authorizes one decision')
  const byDecision = new Map(requested.map(row => [row.payload.decision_id, row.payload]))
  const ownerMessages = await request(currentHost, 'GET', `/session/${session}/message`)
  for (const row of prepared) {
    const authorization = byDecision.get(row.payload.decision_id)
    assert.ok(authorization, 'Prepared has durable authorization')
    const target = bound.find(item => item.payload.decision_id === authorization.decision_id)
    assert.notEqual(authorization.source_provider_run, target.payload.target_provider_run)
    const source = ownerMessages.find(message => message.info?.id === authorization.source_provider_run)
    assert.ok(source, 'source is a real stored assistant, not the outgoing target placeholder')
    assert.equal(source.info.parentID, authorization.source_physical_user_message_id, 'source authorization belongs to its actual physical input')
    assert.ok(source.parts.some(part => part.callID === authorization.source_tool_call_ids[0]))
    const sourceCallId = authorization.source_tool_call_ids[0]
    const ordinal = new Map([['owner-1', 1], ['owner-2', 5], ['owner-4', 6]]).get(sourceCallId)
    assert.ok(ordinal, 'known source batch')
    const exchangeParts = transcripts[0].messages.flatMap(message => message.parts).filter(part => part.callID?.startsWith('replica-'))
    let expected = ''
    if (sourceCallId === 'owner-1') {
      const exchange1 = exchangeParts.find(part => part.callID === 'replica-1')
      const exchange2 = exchangeParts.find(part => part.callID === 'replica-2')
      assert.equal(exchange1.state.status, 'completed')
      assert.equal(exchange2.state.status, 'completed')
      assert.match(exchange1.state.output, /readonly-evidence-1/)
      assert.match(exchange2.state.output, /readonly-evidence-2/)
      expected = `${exchange1.state.output}\n${exchange2.state.output}`
    } else {
      const exchange = exchangeParts.find(part => part.callID === `replica-${ordinal}`)
      assert.equal(exchange.state.status, 'completed')
      expected = exchange.state.output
      assert.match(expected, new RegExp(`readonly-evidence-${ordinal}`))
    }
    for (const other of [1, 2, 5, 6].filter(value => value !== ordinal && (sourceCallId !== 'owner-1' || value !== 2))) {
      assert.doesNotMatch(expected, new RegExp(`readonly-evidence-${other}`))
    }
    assert.equal(row.payload_refs.length, 1)
    const ref = row.payload_refs[0]
    assert.match(ref, /^[a-f0-9]{64}$/)
    // durable-events-012: the frame bundle is inline in the ndjson event line.
    const inlinePayload = row.payloads[ref]
    assert.ok(inlinePayload, 'Prepared frame bundle is inline in the event line')
    const bundle = JSON.parse(Buffer.from(inlinePayload, 'base64').toString('utf8'))
    assert.doesNotMatch(JSON.stringify(bundle), /Predictor private/, 'native reasoning is never published')
    const toolBatches = bundle.batches.filter(batch => batch.exchanges.length > 0)
    const terminalStep = new Map([['owner-1', 3], ['owner-4', 7]]).get(sourceCallId)
    assert.deepEqual(bundle.batches.flatMap(batch => batch.assistant_text ?? []),
      terminalStep ? [predictorConclusion(terminalStep)] : [])
    if (sourceCallId === 'owner-1') {
      assert.equal(toolBatches.length, 2, 'decision 1 carries two rounds of tool batches')
      assert.deepEqual(toolBatches.map(b => b.request_ordinal), [1, 2], 'sequential request ordinals 1 and 2')
    } else if (sourceCallId === 'owner-2') {
      // Decision 2: round 1 was unknown tool (filtered out, not a readonly exchange), round 2 was js-predictor
      // Its single completed exchange came from host round 2.
      const exchange = exchangeParts.find(part => part.callID === 'replica-5')
      assert.equal(exchange.state.status, 'completed')
      assert.deepEqual(toolBatches.map(batch => ({
        results: batch.exchanges.map(exchange => exchange.result),
      })), [{ results: [exchange.state.output] }], 'Prepared contains only evidence from this decision')
    } else {
      const exchange = exchangeParts.find(part => part.callID === `replica-${ordinal}`)
      assert.equal(exchange.state.status, 'completed')
      assert.deepEqual(toolBatches.map(batch => ({
        ordinal: batch.request_ordinal,
        results: batch.exchanges.map(exchange => exchange.result),
      })), [{ ordinal: 1, results: [exchange.state.output] }], 'Prepared contains only evidence from this decision')
    }
  }

  const createdSubOwner = await request(currentHost, 'POST', '/session', {
    parentID: session,
    title: 'restored physical sub-owner canary',
  })
  subOwner = createdSubOwner.id
  assert.equal(createdSubOwner.parentID, session, 'logical owner is an actual physical child')
  const subResult = await promptOwner('msg_assignment_sub_owner', 'Review the fixture from this sub-session.', subOwner, 'engineer')
  assert.ok(subResult.info.time.completed)
  assert.ok(subResult.parts.some(part => part.text === 'Sub-owner smoke complete.'))
  const finalEvents = fs.readdirSync(path.join(workspace, '.git/wanxiangshu/events')).flatMap(file =>
    fs.readFileSync(path.join(workspace, '.git/wanxiangshu/events', file), 'utf8').trim().split('\n').map(line => JSON.parse(line)),
  )
  const subRequested = finalEvents.filter(row =>
    row.event_type === 'DelegationRequested' && row.payload.owner_session_id === subOwner,
  )
  assert.equal(subRequested.length, 1)
  const subBinding = finalEvents.filter(row =>
    row.event_type === 'DelegationBound' && row.payload.decision_id === subRequested[0].payload.decision_id,
  )
  assert.equal(subBinding.length, 1)
  const subReplica = subBinding[0].payload.replica_session_id
  assert.notEqual(subReplica, residentChildId, 'logical owners do not share one predictor')
  const subMessages = await request(currentHost, 'GET', `/session/${subOwner}/message`)
  const subSource = subMessages.find(message => message.info.id === subRequested[0].payload.source_provider_run)
  assert.ok(subSource)
  assert.equal(subSource.info.parentID, 'msg_assignment_sub_owner')
  assert.deepEqual(subRequested[0].payload.source_tool_call_ids, ['owner-sub'])
  assert.notEqual(subSource.info.id, subBinding[0].payload.target_provider_run)
  const subTranscript = await request(currentHost, 'GET', `/session/${subReplica}/message`)
  for (const messages of [transcripts[0].messages, subTranscript]) {
    assert.equal(messages.flatMap(message => message.parts ?? []).some(part =>
      part.type === 'reasoning' && part.text.includes('Predictor private')), true,
    'native predictor thinking was actually produced, so its exclusion is observable')
  }
  assert.deepEqual(
    subTranscript.filter(message => message.info.role === 'user').flatMap(message => message.parts).map(part => part.text),
    [instruction],
  )
  const subExchange = subTranscript.flatMap(message => message.parts).find(part => part.callID === 'replica-8')
  assert.equal(subExchange.state.status, 'completed')
  assert.match(subExchange.state.output, /readonly-evidence-8/)
  const subPrepared = finalEvents.filter(row =>
    row.event_type === 'StrengthCandidatePrepared' && row.payload.decision_id === subRequested[0].payload.decision_id,
  )
  assert.equal(subPrepared.length, 1)
  assert.equal(subPrepared[0].payload_refs.length, 1)
  const subInline = subPrepared[0].payloads[subPrepared[0].payload_refs[0]]
  assert.ok(subInline, 'sub-owner Prepared frame bundle is inline in the event line')
  const subBundle = JSON.parse(Buffer.from(subInline, 'base64').toString('utf8'))
  assert.deepEqual(subBundle.batches.flatMap(batch => batch.exchanges.map(exchange => exchange.result)), [subExchange.state.output])
  assert.deepEqual(subBundle.batches.flatMap(batch => batch.assistant_text ?? []), [predictorConclusion(9)])
  for (const body of replicaRequests.slice(7)) {
    assert.deepEqual(body.tools.map(tool => tool.function?.name ?? tool.name), ['js-predictor'])
  }
  const physicalFamily = await request(currentHost, 'GET', `/session/${session}/children`)
  assert.ok(physicalFamily.some(child => child.id === subReplica && child.parentID === session))
  const subChildren = await request(currentHost, 'GET', `/session/${subOwner}/children`)
  assert.deepEqual(subChildren, [], 'managed companions of the sub-owner are physically flattened to the family root')
  assert.equal(finalEvents.filter(row => row.event_type === 'DelegationRequested').length, 4)
  assert.equal(finalEvents.filter(row => row.event_type === 'DelegationBound').length, 4)
  assert.equal(finalEvents.filter(row => row.event_type === 'StrengthCandidatePrepared').length, 4)
  assert.equal(replicaRequests.length, 9, 'total 9 predictor requests (decision 1: 3, decision 2: 2, decision 3: 2, sub-owner decision 4: 2)')

  // Assertions on main model provider requests (provider wire):
  // Main model requests must observe the injected candidate/replay tool exchanges
  // under the owner's own js-<role> name (js-manager or js-engineer), not js-predictor,
  // paired as tool_calls with corresponding tool results, preserving original program args,
  // Text crosses as reasoning; the predictor's original reasoning stays private.
  const mainRequests = allProviderRequests.filter(req => {
    const names = (req.tools ?? []).map(t => t.function?.name ?? t.name)
    return !names.includes('js-predictor')
  })
  assert.ok(mainRequests.length > 0, 'must have observed main model provider requests')

  for (const req of mainRequests) {
    for (const msg of req.messages ?? []) {
      if (msg.role === 'assistant' && typeof msg.content === 'string') {
        assert.doesNotMatch(msg.content, /Predictor conclusion/, 'predictor text is not main assistant speech')
      }
      assert.doesNotMatch(JSON.stringify(msg), /Predictor private/, 'native predictor reasoning does not cross')
      // Tool calls on main wire must only use owner-visible tool names, NEVER js-predictor
      if (Array.isArray(msg.tool_calls)) {
        for (const call of msg.tool_calls) {
          const name = call.function?.name ?? call.name
          assert.notEqual(name, 'js-predictor', 'main model must never receive tool call named js-predictor')
        }
      }
    }
  }

  const managerRequests = mainRequests.filter(req =>
    req.tools?.some(tool => tool.function?.name === 'js-manager'))
  const engineerRequests = mainRequests.filter(req =>
    req.tools?.some(tool => tool.function?.name === 'js-engineer'))
  for (const [body, step] of [[managerRequests[1], 3], [managerRequests[4], 7], [engineerRequests[1], 9]]) {
    const demoted = body.messages.filter(message => message.reasoning_content?.includes(predictorConclusion(step)))
    assert.equal(demoted.length, 1, `main receives predictor conclusion ${step} exactly once as reasoning`)
  }
  for (const body of replicaRequests.slice(3, 7)) {
    const ownText = body.messages.filter(message => message.content?.includes?.(predictorConclusion(3)))
    assert.equal(ownText.length, 1, 'mirrored conclusion returns to predictor once as original text')
  }
  const originalCallIds = new Set(['owner-1', 'owner-2', 'owner-4', 'owner-sub',
    ...transcripts[0].messages.flatMap(message => message.parts).map(part => part.callID),
    ...subTranscript.flatMap(message => message.parts).map(part => part.callID)])
  const verifyDeliveredExchange = (body, role, exchange) => {
    assert.ok(body, `${role} target request was observed`)
    const messages = body.messages
    const results = messages.filter(message => message.role === 'tool' && message.content === exchange.state.output)
    const matching = results.flatMap(result => messages.flatMap(message => message.tool_calls ?? [])
      .filter(call => call.id === result.tool_call_id
        && !originalCallIds.has(call.id)
        && call.function?.name === `js-${role}`
        && JSON.stringify(JSON.parse(call.function.arguments)) === JSON.stringify(exchange.state.input)))
    assert.equal(matching.length, 1, `${role} target receives exactly one relocated call/result pair: ${exchange.callID}`)
  }
  const residentParts = transcripts[0].messages.flatMap(message => message.parts)
  for (const ordinal of [1, 2]) {
    verifyDeliveredExchange(managerRequests[1], 'manager',
      residentParts.find(part => part.callID === `replica-${ordinal}`))
  }
  verifyDeliveredExchange(managerRequests[2], 'manager', residentParts.find(part => part.callID === 'replica-5'))
  verifyDeliveredExchange(managerRequests[4], 'manager', residentParts.find(part => part.callID === 'replica-6'))
  verifyDeliveredExchange(engineerRequests[1], 'engineer', subExchange)
  const firstTwoDecisions = requested.filter(row =>
    ['owner-1', 'owner-2'].includes(row.payload.source_tool_call_ids[0])).map(row => row.payload.decision_id)
  for (const decision of firstTwoDecisions) {
    assert.ok(finalEvents.some(row => row.event_type === 'StrengthCandidatePromoted' && row.payload.decision_id === decision))
    assert.ok(finalEvents.some(row => row.event_type === 'StrengthFramesTraced' && row.payload.decision_id === decision))
  }

  // Stderr must be clean of errors, fuses, or invalid bundles
  assert.doesNotMatch(currentHost.stderrLog, /failed ref=|fuse|bundle invalid|InvalidRequestOrdinal/i, 'stderr must contain no failed ref, fuse, or bundle invalid')

  console.log(`RESIDENT_PREDICTOR_CANARY ${JSON.stringify({ managerAssignments: 3, subOwnerAssignments: 1, predictorRequests: replicaRequests.length, residentChild: transcripts[0].child, readableBootstrapMessages: transcripts[0].prompts.length, boundDecisions: 4, preparedDecisions: 4, bareContinueMessages: 0, predictorTools: ['js-predictor'], restarted: true, sourceIdentityVerified: true, decisionMaterialIsolated: true, subOwnerFlattened: true, mainReceivedExchanges: 5, promotedReplayTraced: true, textDemotedToReasoning: true, nativeReasoningExcluded: true, textRoundtripExact: true })}`)
} catch (error) {
  console.error(currentHost.stdoutLog.slice(-5000))
  console.error(currentHost.stderrLog.slice(-5000))
  throw error
} finally {
  clearTimeout(timer)
  if (subOwner && currentHost.baseUrl) {
    try { await request(currentHost, 'POST', `/session/${subOwner}/abort`, {}) } catch {}
  }
  if (session && currentHost.baseUrl) {
    try { await request(currentHost, 'POST', `/session/${session}/abort`, {}) } catch {}
  }
  await currentHost.stop()
  await new Promise(resolve => provider.close(resolve))
  fs.rmSync(scenarioDir, { recursive: true, force: true })
}
