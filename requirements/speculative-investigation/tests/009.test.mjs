import test from 'node:test'

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");
const Strength = await import("../../../dist/Strength/Surface.js");
const { createHash } = await import("node:crypto");

// The fixture must hash the way the runtime does. A digest that echoes its
// input carries the note text into the derived call id, which would report a
// second visibility channel that no real digest produces.
const H = (text) => createHash('sha256').update(text).digest('hex')
const call = (callId, name, args) => ({ kind: 'tool-call', callId, name, args })
const result = (callId, resultText) => ({ kind: 'tool-result', callId, result: resultText })

test('WHAT[speculative-investigation-009] STRENGTH_009_replica_mirror_localizes_owner_call_ids_without_changing_semantics', () => {
  const ownerMessages = [
    { role: 'assistant', parts: [
      { kind: 'text', text: 'ordinary main response' },
      { kind: 'reasoning', text: 'ordinary main thinking' },
      call('owner-a', 'read', '{"filePath":"a"}'), call('owner-b', 'grep', '{"pattern":"x"}'),
    ] },
    { role: 'tool', parts: [result('owner-b', 'hit'), result('owner-a', 'alpha')] },
  ]
  const digest = H(Strength.renderSemantic(ownerMessages))
  const first = Strength.frameTryLocalizeMirror(H, 'd1', digest, ownerMessages)
  const second = Strength.frameTryLocalizeMirror(H, 'd1', digest, ownerMessages)
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(Strength.renderSemantic(first.value), Strength.renderSemantic(ownerMessages))
  assert.equal(Strength.renderWire(first.value), Strength.renderWire(second.value))
  assert.doesNotMatch(Strength.renderWire(first.value), /owner-a|owner-b/)
  const localizedCalls = first.value[0].parts.filter((part) => part.kind === 'tool-call').map((part) => part.callId)
  const localizedResults = first.value[1].parts.filter((part) => part.kind === 'tool-result').map((part) => part.callId)
  assert.deepEqual(localizedResults, [localizedCalls[1], localizedCalls[0]])
  const orphan = Strength.frameTryLocalizeMirror(H, 'd2', digest, [{ role: 'tool', parts: [result('missing', 'no-call')] }])
  assert.equal(orphan.ok, false)
  assert.equal(orphan.error, 'OrphanToolResultId')
  const media = Strength.frameTryLocalizeMirror(H, 'd3', digest, [{ role: 'user', parts: [{ kind: 'media', mediaType: null, contentDigest: 'digest' }] }])
  assert.equal(media.ok, false)
  assert.equal(media.error, 'MediaCannotCrossSession')
  // Regression test: completed tool calls in OpenCode native format are folded
  // into the assistant message as completed tool results. tryLocalizeMirror must
  // relocate them without rejecting them as orphan results.
  const assistantFolded = Strength.frameTryLocalizeMirror(H, 'd4', digest, [
    { role: 'assistant', parts: [result('owner-folded-1', 'alpha')] },
  ])
  assert.equal(assistantFolded.ok, true, 'assistant folded tool results must be localized without orphan error')
  assert.notEqual(assistantFolded.value[0].parts[0].callId, 'owner-folded-1', 'owner call id must be deterministically relocated')
})
test('WHAT[speculative-investigation-009] STRENGTH_009_self_note_rides_the_original_call_record_and_nowhere_else', () => {
  const ownerMessages = [
    { role: 'assistant', parts: [call('owner-1', 'read', '{"filePath":"a","self_note":"check the date of the lock file"}')] },
    { role: 'tool', parts: [result('owner-1', 'alpha')] },
  ]
  const digest = H(Strength.renderSemantic(ownerMessages))
  const localized = Strength.frameTryLocalizeMirror(H, 'd1', digest, ownerMessages)
  assert.equal(localized.ok, true)
  const localizedArgs = localized.value[0].parts.filter((part) => part.kind === 'tool-call').map((part) => part.args)
  assert.equal(localizedArgs.length, 1)
  assert.equal(localizedArgs[0].includes('check the date of the lock file'), true)
  // Exactly one visibility channel: the note is in the frozen call record, not
  // duplicated into any other rendered material of the mirror. The localized
  // call id is derived from the semantic digest, so it is a hash here; the
  // other rendering path (the adapter round-trip below) checks that too.
  const semantic = Strength.renderSemantic(localized.value)
  const wire = Strength.renderWire(localized.value)
  assert.equal(semantic.split('check the date of the lock file').length - 1, 1)
  assert.equal(wire.split('check the date of the lock file').length - 1, 1)
  assert.doesNotMatch(`${semantic}\n${wire}`, /self_note\s*=\s*"check the date of the lock file"[\s\S]*self_note\s*=\s*"check the date of the lock file"/)
})
test('WHAT[speculative-investigation-009] STRENGTH_009_every_note_in_one_batch_survives_in_original_call_order', () => {
  const ownerMessages = [
    { role: 'assistant', parts: [
      call('owner-1', 'read', '{"filePath":"a","self_note":"first note"}'),
      call('owner-2', 'grep', '{"pattern":"x","self_note":"second note"}'),
      call('owner-3', 'glob', '{"pattern":"**/*.fs","self_note":"third note"}'),
    ] },
    { role: 'tool', parts: [result('owner-2', 'hit'), result('owner-1', 'alpha'), result('owner-3', 'a.fs')] },
  ]
  const digest = H(Strength.renderSemantic(ownerMessages))
  const localized = Strength.frameTryLocalizeMirror(H, 'd1', digest, ownerMessages)
  assert.equal(localized.ok, true)
  const notes = localized.value[0].parts
    .filter((part) => part.kind === 'tool-call')
    .map((part) => /"self_note":"([^"]*)"/.exec(part.args)[1])
  assert.deepEqual(notes, ['first note', 'second note', 'third note'])
  // Only integers collapse to a maximum; a note is never the selected "best"
  // entry of the batch and never enlarges or shrinks the round budget.
  assert.deepEqual(Strength.budgetMaxOf([1, 5, 2]), { ok: true, value: 5 })
  assert.deepEqual(Strength.budgetMaxOf([0, 0, 0]), { ok: true, value: 0 })
})
}

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");
const Projection = await import("../../../dist/Participant/Provider/Projection/Surface.js");
const Strength = await import("../../../dist/Strength/Surface.js");
// Raw Host message decoding belongs to the codec surface: `decodeMessageView`
// is exported there, not from the Strength surface.
const Wire = await import("../../../dist/OpenCode/Codec/ProviderProjectionSurface.js");

const H = (text) => `H(${text})`
const text = (value) => ({ kind: 'text', text: value })
const call = (callId, name, args) => ({ kind: 'tool-call', callId, name, args })
const result = (callId, value) => ({ kind: 'tool-result', callId, result: value })
const msg = (role, parts) => ({ role, parts })
const rendered = (messages) => ({ messages, hostMessageIds: messages.map(() => null), hostIsPhysical: messages.map(() => false) })
const snapshot = (messages) => Projection.projectionSnapshot(Projection.semanticProjection(messages))

test('WHAT[speculative-investigation-009] STRENGTH_009_rendered_message_adapter_roundtrips_wire_semantics_with_host_only_ids', () => {
  const input = rendered([msg('user', [text('hello')]), msg('assistant', [text('world')])])
  const applied = Strength.tryApplyRenderedMessages('replica-session', H, input)
  assert.equal(applied.ok, true)
  assert.equal(applied.value.length, 2)
  assert.equal(applied.value[0].info.sessionID, 'replica-session')
  assert.doesNotMatch(applied.value[0].info.id, /strength|replica|prefetch/i)
  const decoded = Wire.decodeMessageView(applied.value)
  assert.equal(Projection.renderWire(decoded.messages), Projection.renderWire(input.messages))
})
test('WHAT[speculative-investigation-009] STRENGTH_009_host_adapter_encodes_delegation_tool_pairs_as_native_completed_OpenCode_parts', () => {
  const input = {
    messages: [msg('user', [text('owner mirror')]), msg('assistant', [call('c1', 'read', '{"filePath":"README.md"}'), call('c2', 'grep', '{"pattern":"Strength"}')]), msg('tool', [result('c1', 'alpha'), result('c2', 'beta')])],
    hostMessageIds: [null, 'synthetic-call-message', 'synthetic-result-message'],
    hostIsPhysical: [false, false, false],
  }
  const applied = Strength.tryApplyRenderedMessages('replica-session', H, input)
  assert.equal(applied.ok, true)
  assert.equal(applied.value.length, 2)
  assert.equal(applied.value[1].info.role, 'assistant')
  assert.deepEqual(applied.value[1].parts.map((part) => part.type), ['tool', 'tool'])
  assert.deepEqual(applied.value[1].parts.map((part) => part.callID), ['c1', 'c2'])
  assert.deepEqual(applied.value[1].parts.map((part) => part.state.input), [{ filePath: 'README.md' }, { pattern: 'Strength' }])
  assert.deepEqual(applied.value[1].parts.map((part) => part.state.output), ['alpha', 'beta'])
})
test('WHAT[speculative-investigation-009] native completed tool output preserves JSON-looking result bytes as text', () => {
  for (const output of ['[]', '{"value": 1}', '"quoted"', 'null', '42']) {
    const applied = Strength.tryApplyRenderedMessages('owner', H, {
      messages: [msg('assistant', [call('c1', 'js-manager', '{"program":"inspect"}')]),
        msg('tool', [result('c1', output)])],
      hostMessageIds: ['call', 'result'], hostIsPhysical: [false, false],
    })
    assert.equal(applied.ok, true, applied.error)
    assert.equal(applied.value[0].parts[0].state.output, output)
  }
})
test('WHAT[speculative-investigation-009] final owner encoding preserves physical rows and parallel exchange order', () => {
  const physical = { info: { id: 'physical', sessionID: 'owner', role: 'user' }, parts: [
    { type: 'text', text: 'inspect both files', id: 'original-part' },
    { type: 'file', url: 'file:///fixture.png', mime: 'image/png' },
  ] }
  const native = { info: { id: 'native', sessionID: 'owner', role: 'assistant' }, parts: [
    { type: 'tool', callID: 'native-call', tool: 'js-manager', state: {
      status: 'completed', input: { program: 'original' }, output: 'original result',
    } },
  ] }
  const logical = Wire.tryApplyRenderedMessages('owner', H, {
    messages: [msg('assistant', [
      call('first', 'js-manager', '{"program":"read first"}'),
      call('second', 'js-manager', '{"program":"read second"}'),
    ]), msg('tool', [result('first', 'first evidence'), result('second', 'second evidence')])],
    hostMessageIds: ['batch-call', 'batch-result'], hostIsPhysical: [false, false],
  })
  assert.equal(logical.ok, true, logical.error)
  const encoded = Strength.tryEncodeOwnerMessages(H, [physical, ...logical.value, native])
  assert.equal(encoded.ok, true, encoded.error)
  assert.equal(encoded.value[0], physical, 'physical objects and media are not reconstructed')
  assert.equal(encoded.value[2], native, 'native tools retain their original metadata')
  assert.equal(encoded.value[1].info.id, 'batch-call')
  assert.deepEqual(encoded.value[1].parts.map(part => [
    part.type, part.callID, part.tool, part.state.status, part.state.input.program, part.state.output,
  ]), [
    ['tool', 'first', 'js-manager', 'completed', 'read first', 'first evidence'],
    ['tool', 'second', 'js-manager', 'completed', 'read second', 'second evidence'],
  ])
  const incomplete = Strength.tryEncodeOwnerMessages(H, [physical, logical.value[0]])
  assert.equal(incomplete.ok, false)
  assert.match(incomplete.error, /incomplete/i)
  const orphan = structuredClone(logical.value[1])
  orphan.parts[0].callID = 'unmatched'
  const rejected = Strength.tryEncodeOwnerMessages(H, [physical, logical.value[0], orphan])
  assert.equal(rejected.ok, false)
  assert.match(rejected.error, /orphan/i)
})
test('WHAT[speculative-investigation-009] STRENGTH_006_009_candidate_wrong_target_and_promoted_replica_reflection_conflict', () => {
  const bundle = Strength.frameTryBuild(H, [{ requestOrdinal: 1, exchanges: [
    { toolName: 'read', canonicalArguments: '{"filePath":"a"}', canonicalResult: 'alpha' },
    { toolName: 'grep', canonicalArguments: '{"pattern":"x"}', canonicalResult: 'a:1:x' },
  ] }]).value
  const wrongTarget = Strength.candidate(H, { ownerSessionId: 'owner', decisionId: 'd1', targetProviderRun: 'target-a', currentProviderRun: 'target-b', bundle })
  assert.equal(wrongTarget.ok, false)
  assert.equal(wrongTarget.error, 'StrengthCandidateWrongTarget')
  const reflected = Strength.promoted(H, { ownerSessionId: 'owner', decisionId: 'd1', targetProviderRun: 'target-a', beforeIndex: 0, isReplicaRequest: true, bundle })
  assert.equal(reflected.ok, false)
  assert.equal(reflected.error, 'StrengthPromotedReplicaReflection')
  const badDigest = Strength.candidate(H, { ownerSessionId: 'owner', decisionId: 'd1', targetProviderRun: 'target-a', currentProviderRun: 'target-a', bundle: { ...bundle, digest: 'tampered' } })
  assert.equal(badDigest.ok, false)
  assert.equal(badDigest.error, 'StrengthFrameDigestMismatch')
  const invalidAnchor = Strength.promoted(H, { ownerSessionId: 'owner', decisionId: 'd1', targetProviderRun: 'target-a', beforeIndex: -1, isReplicaRequest: false, bundle })
  assert.equal(invalidAnchor.ok, false)
  assert.equal(invalidAnchor.error, 'InvalidStrengthAnchor')
})
test('WHAT[speculative-investigation-009] STRENGTH_009_012_promoted_frames_leave_later_pair_anchor_messages_in_place', () => {
  const bundle = Strength.frameTryBuild(H, [{ requestOrdinal: 1, exchanges: [{ toolName: 'read', canonicalArguments: '{"filePath":"a"}', canonicalResult: 'alpha' }] }]).value
  const base = [msg('user', [text('u1')]), msg('assistant', [text('target-assistant')]), msg('user', [text('pair-anchor-stand-in')])]
  const promoted = Strength.promoted(H, { ownerSessionId: 'owner', decisionId: 'd1', targetProviderRun: 'target-1', beforeIndex: 1, isReplicaRequest: false, bundle }).value
  const renderedOutput = Projection.renderMessagesWithHostIds(snapshot(base), base, [promoted])
  assert.deepEqual(renderedOutput.messages.map((item) => item.role), ['user', 'assistant', 'tool', 'assistant', 'user'])
  assert.equal(renderedOutput.messages.at(-1).parts[0].text, 'pair-anchor-stand-in')
})
test('WHAT[speculative-investigation-009] STRENGTH_009_replica_mirror_replaces_base_then_local_batches_append', () => {
  const bundle = Strength.frameTryBuild(H, [{ requestOrdinal: 1, exchanges: [{ toolName: 'read', canonicalArguments: '{"filePath":"a"}', canonicalResult: 'alpha' }] }]).value
  const mirrorMessages = [msg('user', [text('mirror-base')])]
  const mirror = Strength.projectionMirror({ decisionId: 'd1', targetProviderRun: 'target', semanticDigest: 'sem-a', rows: [{ message: mirrorMessages[0], hostMessageId: 'mirror-host-id', hostIsPhysical: true }] }).value
  const local = Strength.replicaLocal(H, { ownerSessionId: 'owner', decisionId: 'd1', bundle }).value
  const base = [msg('user', [text('child-physical')])]
  const renderedOutput = Projection.renderMessagesWithHostIds(snapshot(base), base, [mirror, local])
  assert.equal(renderedOutput.messages.length, 3)
  assert.equal(renderedOutput.messages[0].parts[0].text, 'mirror-base')
  assert.equal(renderedOutput.hostMessageIds[0], 'mirror-host-id')
  assert.equal(renderedOutput.hostIsPhysical[0], true)
  assert.deepEqual(renderedOutput.messages.slice(1).map((item) => item.role), ['assistant', 'tool'])
})
}

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");
const Strength = await import("../../../dist/Strength/Surface.js");
const Wire = await import("../../../dist/OpenCode/Codec/ProviderProjectionSurface.js");

const H = (text) => `H(${text})`
const hostText = (text) => ({ type: 'text', text })
const hostResult = (callId, tool, input, output) => ({ type: 'tool', tool, callID: callId, state: { status: 'completed', input, output } })
const user = (id, sessionId, parts) => ({ info: { id, role: 'user', sessionID: sessionId }, parts })
const assistant = (id, sessionId, parts) => ({ info: { id, role: 'assistant', sessionID: sessionId }, parts })

test('WHAT[speculative-investigation-009] STRENGTH_003_004_replica_initial_transform_replaces_bootstrap_with_frozen_owner_mirror', async () => {
  const runtime = Strength.runtimeCreate()
  const binding = Strength.runtimeBinding('owner', 'replica-initial', 'decision-replica-initial', 'target-replica-initial', 'Engineer', 2, 'semantic-replica-initial', [{ role: 'user', parts: [{ kind: 'text', text: 'owner mirror' }] }])
  assert.equal(Strength.runtimeRegister(runtime, binding).ok, true)
  const outcome = await Strength.transformApply(H, runtime, { messages: [user('u1', 'replica-initial', [hostText('Continue.')])] }, true)
  assert.equal(outcome.kind, 'Ready')
  assert.deepEqual(outcome.batches, [])
  const decoded = Wire.decodeMessageView(outcome.output)
  assert.equal(decoded.messages.length, 1)
  assert.equal(decoded.messages[0].parts[0].text, 'owner mirror')
})
test('WHAT[speculative-investigation-009] STRENGTH_009_local_batches_append_after_the_mirror_in_the_same_transcript', async () => {
  const runtime = Strength.runtimeCreate()
  const binding = Strength.runtimeBinding('owner', 'replica-local', 'decision-replica-local', 'target-replica-local', 'Engineer', 2, 'semantic-replica-local', [{ role: 'user', parts: [{ kind: 'text', text: 'owner mirror' }] }])
  assert.equal(Strength.runtimeRegister(runtime, binding).ok, true)
  const outcome = await Strength.transformApply(H, runtime, { messages: [
    user('u1', 'replica-local', [hostText('Continue.')]),
    assistant('a1', 'replica-local', [hostResult('c1', 'read', { filePath: 'a' }, 'alpha')]),
  ] }, true)
  assert.equal(outcome.kind, 'Ready')
  assert.equal(outcome.batches.length, 1)
  const decoded = Wire.decodeMessageView(outcome.output)
  // WHAT[009] + host-boundary-006: a completed call/result pair is written back
  // as one native completed tool part inside the assistant row, so the wire view
  // holds the mirror plus one folded row per completed batch — never a separate
  // tool message, and never the owner's raw call id. The request is closed by a
  // user turn because providers reject a request ending on a model turn.
  assert.deepEqual(decoded.messages.map((item) => item.role), ['user', 'assistant', 'user'])
  assert.equal(decoded.messages[0].parts[0].text, 'owner mirror')
  const localParts = decoded.messages[1].parts
  assert.equal(localParts.length, 1)
  assert.equal(localParts[0].kind, 'ToolResult')
  assert.equal(localParts[0].result, 'alpha')
  assert.notEqual(localParts[0].callId, 'c1', 'the owner call id must be relocated into this decision')
  // The original arguments and the real result stay on the Host row itself.
  const localPart = outcome.output[1].parts[0]
  assert.equal(localPart.tool, 'read')
  assert.deepEqual(localPart.state.input, { filePath: 'a' })
  assert.equal(localPart.state.output, 'alpha')
})
test('WHAT[speculative-investigation-009] replica request never ends on an assistant turn and the closing user turn is stable across repeated transforms', async () => {
  const runtime = Strength.runtimeCreate()
  const binding = Strength.runtimeBinding('owner', 'replica-tail', 'decision-replica-tail', 'target-replica-tail', 'Engineer', 2, 'semantic-replica-tail', [{ role: 'user', parts: [{ kind: 'text', text: 'owner mirror' }] }])
  assert.equal(Strength.runtimeRegister(runtime, binding).ok, true)
  const input = () => ({ messages: [
    user('u1', 'replica-tail', [hostText('Continue.')]),
    assistant('a1', 'replica-tail', [hostResult('c1', 'read', { filePath: 'a' }, 'alpha')]),
  ] })
  const first = await Strength.transformApply(H, runtime, input(), true)
  const second = await Strength.transformApply(H, runtime, input(), false)
  for (const outcome of [first, second]) {
    assert.equal(outcome.kind, 'Ready')
    const roles = outcome.output.map((message) => message.info.role)
    assert.equal(roles.at(-1), 'user')
    assert.match(outcome.output.at(-1).parts[0].text, /read-only investigation|只读查证/)
  }
  assert.equal(first.output.at(-1).info.id, second.output.at(-1).info.id)
  assert.deepEqual(first.output, second.output, 'the entire projection is stable for the same input and language')
  // A mirror already ending on a user turn is left alone.
  const fresh = await Strength.transformApply(H, runtime, { messages: [user('u9', 'replica-tail', [hostText('Continue.')])] }, false)
  assert.deepEqual(fresh.output.map((message) => message.info.role), ['user'])
})
}

{
const assert = (await import('node:assert/strict')).default
const { withExecutablePlugin, acceptAuthorityRoot } = await import('../../verification-system/tests/support/plugin-fixture.mjs')
const Events = await import('../../../dist/OpenCode/Host/EventsSurface.js')
const Status = await import('../../../dist/Execution/Session/ChatExecution/StatusSurface.js')
const { refreshGlobalLanguage } = await import('../../../dist/Participant/Provider/LanguageSurface.js')
const { withPreference } = await import('../../provider-language/tests/support/language-fixtures.mjs')
const { readdirSync, readFileSync } = await import('node:fs')
const { join } = await import('node:path')

const facts = directory => readdirSync(join(directory, '.git', 'wanxiangshu', 'events'))
  .filter(name => name.endsWith('.ndjson'))
  .flatMap(name => readFileSync(join(directory, '.git', 'wanxiangshu', 'events', name), 'utf8').trim().split('\n'))
  .filter(Boolean)
  .map(line => JSON.parse(line))
const user = (sessionID, id, parts) => ({ info: { sessionID, id, role: 'user' }, parts })
const assistant = (sessionID, parentID, id, created, parts = []) => ({
  info: { sessionID, parentID, id, role: 'assistant', time: { created } }, parts,
})
const tool = callID => ({
  type: 'tool', tool: 'read', callID,
  state: { status: 'completed', input: { filePath: 'a', estimated_readonly_rounds: 2 }, output: 'alpha' },
})

test('WHAT[speculative-investigation-009] registered Replica hook closes the provider projection without admitting a synthetic physical input', async () => {
  const previousPredictor = globalThis.__wanxiangshu_test_predictor_state
  globalThis.__wanxiangshu_test_predictor_state = 'configured'
  try {
    await withPreference('en', async () => {
      refreshGlobalLanguage()
      await withExecutablePlugin(async (hooks, directory, _created, runtime) => {
        const owner = 'owner-closing-turn'
        const physical = 'owner-closing-physical'
        await acceptAuthorityRoot(runtime, owner, 'engineer', physical)
        const ownerUser = user(owner, physical, [{ type: 'text', text: 'inspect the file' }])
        await hooks['chat.message']({ sessionID: owner, messageID: physical, agent: 'engineer' }, { message: ownerUser, parts: ownerUser.parts })
        const source = assistant(owner, physical, 'owner-closing-source', 1, [tool('owner-call')])
        source.info.time.completed = 2
        const target = assistant(owner, physical, 'owner-closing-target', 3)
        for (const message of [ownerUser, source, target]) runtime.pushHostMessage(owner, message)

        let observeBootstrap
        const bootstrapSeen = new Promise(resolve => { observeBootstrap = resolve })
        const recordPrompt = runtime.prompts.push.bind(runtime.prompts)
        runtime.prompts.push = (...prompts) => {
          const count = recordPrompt(...prompts)
          for (const prompt of prompts) {
            if (prompt.body?.agent?.toLowerCase() === 'engineer' && prompt.path?.id !== owner) observeBootstrap(prompt)
          }
          return count
        }
        const pending = hooks['experimental.chat.messages.transform']({}, { messages: [ownerUser, source, target] })
        const pendingSettled = Promise.allSettled([pending])
        let replica, response
        try {
          const bootstrap = await Promise.race([bootstrapSeen, pending.then(() => { throw new Error('delegation returned without a Replica bootstrap') })])
          replica = bootstrap.path.id
          const landing = runtime.messages.find(message => message.role === 'user' && message.id.startsWith(`msg-${replica}-`))
          assert.ok(landing, 'the actual managed bootstrap has physical Host evidence')
          const admission = user(replica, landing.id, landing.parts)
          await hooks['chat.message']({ sessionID: replica, messageID: landing.id, agent: 'engineer' }, { message: admission, parts: admission.parts })
          response = assistant(replica, landing.id, 'replica-closing-response', 4)
          runtime.pushHostMessage(replica, response)
          const before = facts(directory)
          const promptsBefore = runtime.prompts.length
          const input = () => ({ messages: [structuredClone(admission)] })
          const first = input()
          await hooks['experimental.chat.messages.transform']({}, first)
          const tail = first.messages.at(-1)
          assert.equal(tail.info.role, 'user')
          assert.notEqual(tail.info.id, landing.id)
          assert.match(tail.parts[0].text, /read-only investigation/)
          const repeat = input()
          await hooks['experimental.chat.messages.transform']({}, repeat)
          assert.deepEqual(repeat, first)
          await withPreference('zh-CN', async () => {
            refreshGlobalLanguage()
            const changed = input()
            await hooks['experimental.chat.messages.transform']({}, changed)
            assert.deepEqual(changed.messages.slice(0, -1), first.messages.slice(0, -1))
            assert.equal(changed.messages.at(-1).info.id, tail.info.id)
            assert.match(changed.messages.at(-1).parts[0].text, /只读查证/)
            assert.notEqual(changed.messages.at(-1).parts[0].text, tail.parts[0].text)
          })
          refreshGlobalLanguage()
          assert.equal(runtime.prompts.length, promptsBefore, 'provider projection never dispatches a new physical prompt')
          assert.equal(Status.query(runtime.journal, replica, tail.info.id).accepted, false)
          assert.deepEqual(Status.query(runtime.journal, replica, landing.id), { accepted: true, providerStarted: true, terminal: false, disposition: null })
          const priorFacts = new Set(before.map(row => JSON.stringify(row)))
          const newFacts = facts(directory).filter(row => !priorFacts.has(JSON.stringify(row)))
          assert.equal(newFacts.some(row => JSON.stringify(row.payload).includes(tail.info.id)), false,
            'the provider-only user row is not durable acceptance or dispatch evidence')

          response.parts.push({
            type: 'tool', tool: 'js-predictor', callID: 'replica-call',
            state: { status: 'completed', input: { code: 'read("a")', estimated_readonly_rounds: 0 }, output: 'alpha' },
          })
          response.info.time.completed = 5
          const completed = response
          response = assistant(replica, landing.id, 'replica-closing-followup', 6)
          runtime.pushHostMessage(replica, response)
          await hooks['experimental.chat.messages.transform']({}, { messages: [structuredClone(admission), structuredClone(completed)] })
          assert.equal(runtime.abortedIds.filter(id => id === replica).length, 0,
            'repeated projections and language changes leave the second authorized request available')
          assert.equal(runtime.prompts.length, promptsBefore)
          response.parts.push({ type: 'text', text: 'finished under the original physical input' })
          response.info.time.completed = 7
          Events.notify(runtime.terminalPort, replica, 'Completed', response.info.id, 'finished')
          const results = await pendingSettled
          assert.equal(results[0].status, 'fulfilled', results[0].reason?.message)
          const prepared = facts(directory).filter(row => row.event_type === 'StrengthCandidatePrepared')
          assert.equal(prepared.length, 1, 'the original physical completion resolves exactly one owner decision')
          assert.equal(Status.query(runtime.journal, replica, tail.info.id).accepted, false)
        } finally {
          if (replica && response) {
            response.parts.push({ type: 'text', text: 'finished' })
            response.info.time.completed = 8
            Events.notify(runtime.terminalPort, replica, 'Completed', response.info.id, 'finished')
          }
          await pendingSettled
        }
      })
    })
  } finally {
    globalThis.__wanxiangshu_test_predictor_state = previousPredictor
    refreshGlobalLanguage()
  }
})
}
