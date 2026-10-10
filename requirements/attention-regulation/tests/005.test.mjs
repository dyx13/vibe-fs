import assert from 'node:assert/strict'
import test from 'node:test'
import * as attention from '../../../dist/Interaction/Attention/Surface.js'
import { recordingPort, context } from './support/attention-port.mjs'
import * as tools from '../../../dist/OpenCode/Tools/AttentionToolSurface.js'
import { withReview, findings } from '../../relay-assessment/tests/support/plugin.mjs'
import { factPayloads, journalEventLines } from '../../verification-system/tests/e2e/support/journal-observer.js'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as journal from '../../../dist/Persistence/Journal/Surface.js'
import * as dispatch from '../../../dist/Interaction/Dispatch/DispatchSurface.js'
import * as recovery from '../../../dist/Interaction/Dispatch/RecoverySurface.js'
import * as authority from '../../../dist/Interaction/Authority/RuntimeSurface.js'
import { withAppendRefusal } from '../../../dist/Verification/JournalPortObservationSurface.js'
import { withExecutablePlugin, acceptAuthorityRoot } from '../../verification-system/tests/support/plugin-fixture.mjs'

const pendingOf = (fixture, session) => attention.pending(session, fixture.state)

const withPresentation = async (body, { historical = false } = {}) => {
  await withExecutablePlugin(async (hooks, directory, _created, runtime) => {
    const session = 'presentation-contract'
    const profile = await acceptAuthorityRoot(runtime, session, 'engineer', 'presentation-root')
    for (const occurrence of ['first', 'second']) {
      const result = await journal.JournalSurface_appendAgent(runtime.journal, { kind: 'Session', session }, null, {
        family: 'Attention', case: 'DeferredWorkRecorded', payload: {
          SessionId: session, OccurrenceId: occurrence, Text: occurrence,
        },
      })
      assert.equal(result.ok, true, result.error)
    }
    const claim = {
      promptKey: 'c'.repeat(64), session, origin: 'DeferredWorkPresentation',
      logicalRun: profile.logicalRun, authorityRoot: profile.authorityRoot,
      identitySeed: profile.identitySeed, payloadDigest: 'presentation-payload', occurrenceIds: ['first', 'second'],
    }
    const result = await (historical ? dispatch.appendHistoricalPromptClaim : dispatch.appendDeferredPresentationClaim)(runtime.journal, claim)
    assert.equal(result.ok, true, result.error)
    await body({ hooks, directory, runtime, session, profile, claim })
  })
}

test('WHAT[attention-regulation-005] exact presentation binding is idempotent without another claim sequence', async () => {
  await withPresentation(async ({ runtime, session, claim }) => {
    const before = dispatch.projectionObservation(runtime.journal, session)
    const result = await dispatch.appendDeferredPresentationClaim(runtime.journal, claim)
    assert.equal(result.ok, true, result.error)
    assert.deepEqual(dispatch.projectionObservation(runtime.journal, session), before)
  })
})

for (const [name, change, historical] of [
  ['empty batch', { occurrenceIds: [] }, false],
  ['blank occurrence', { occurrenceIds: ['first', ' '] }, false],
  ['duplicate occurrence', { occurrenceIds: ['first', 'first'] }, false],
  ['different batch under the same key', { occurrenceIds: ['second'] }, false],
  ['different active run', { logicalRun: 'another-run', promptKey: 'd'.repeat(64) }, false],
  ['different authority root', { authorityRoot: 'another-root', promptKey: 'd'.repeat(64) }, false],
  ['different identity seed', { differentIdentity: true, promptKey: 'd'.repeat(64) }, false],
  ['historical claim replacing the bound batch', {}, true],
]) {
  test(`WHAT[attention-regulation-005] presentation rejects ${name} without changing durable work or the original claim`, async () => {
    await withPresentation(async ({ directory, runtime, session, claim }) => {
      const before = dispatch.projectionObservation(runtime.journal, session)
      const facts = factPayloads(directory, 'DeferredWorkPresentationClaimed')
      const candidate = { ...claim, ...change }
      if (change.differentIdentity) candidate.identitySeed =
        (await acceptAuthorityRoot(runtime, session + '-other', 'devops', 'other-root')).identitySeed
      const result = await (historical ? dispatch.appendHistoricalPromptClaim : dispatch.appendDeferredPresentationClaim)(runtime.journal, candidate)
      assert.equal(result.ok, false)
      assert.match(result.error, /semantic|rejected|invalid/i)
      assert.deepEqual(dispatch.projectionObservation(runtime.journal, session), before)
      assert.equal(factPayloads(directory, 'DeferredWorkPresentationClaimed').length, facts.length + (historical ? 0 : 1))
      assert.equal(journalEventLines(directory).map(line => JSON.parse(line)).filter(event => event.event_type === 'ProjectionCutTail').length, 1)
      assert.deepEqual(journal.JournalSurface_pendingDeferredWork(runtime.journal, session).map(item => item.occurrence), ['first', 'second'])
      assert.deepEqual(factPayloads(directory, 'DeferredWorkConsumed'), [])
      const cold = JSON.parse(execFileSync(process.execPath, [
        fileURLToPath(new URL('./support/presentation-rejected-child.mjs', import.meta.url)),
        directory, session, JSON.stringify(before), String(process.pid),
      ], { encoding: 'utf8', timeout: 5000 }).trim())
      assert.notEqual(cold.pid, process.pid)
      assert.deepEqual(cold.pending, ['first', 'second'])
    })
  })
}

test('WHAT[attention-regulation-005] physical acceptance append refusal keeps the batch until the exact original message is accepted', async () => {
  await withPresentation(async ({ hooks, directory, runtime, session, claim }) => {
    const message = { id: 'presentation-physical', sessionID: session, role: 'user', agent: 'engineer',
      metadata: { wanxiangshu_prompt_key: claim.promptKey, wanxiangshu_origin: claim.origin } }
    const before = dispatch.projectionObservation(runtime.journal, session)
    const refused = await withAppendRefusal(runtime.journal, 'physical-acceptance', () => recovery.reconcile(runtime.journal, [message]))
    assert.equal(refused.refused, 1)
    assert.equal(refused.value[0].outcome, 'Unreadable')
    assert.match(refused.value[0].reason, /append not attempted.*writer is closing/)
    assert.deepEqual(dispatch.projectionObservation(runtime.journal, session), before)
    assert.deepEqual(journal.JournalSurface_pendingDeferredWork(runtime.journal, session).map(item => item.occurrence), ['first', 'second'])
    assert.deepEqual(factPayloads(directory, 'PluginPromptPhysicalAccepted'), [])
    const parts = [{ type: 'text', text: '- first\n- second', metadata: message.metadata }]
    runtime.pushHostMessage(session, { info: message, parts })
    await hooks['chat.message']({ sessionID: session, messageID: message.id, agent: 'engineer' }, { message, parts })
    assert.deepEqual(journal.JournalSurface_pendingDeferredWork(runtime.journal, session), [])
    assert.deepEqual(dispatch.projectionObservation(runtime.journal, session).activeLogicalRun, before.activeLogicalRun)
    assert.equal(factPayloads(directory, 'PluginPromptPhysicalAccepted').length, 1)
    assert.deepEqual(factPayloads(directory, 'DeferredWorkConsumed'), [])
  })
})

test('WHAT[attention-regulation-005] a refused presentation claim does not call Host or consume work', async () => {
  await withPresentation(async ({ directory, runtime, session, profile }) => {
    let sends = 0
    const port = { SubscribeTerminal: () => ({ Dispose() {} }), SendPrompt: async () => {
      sends += 1
      return dispatch.admittedWithReceipt('accepted-presentation')
    } }
    const refused = await withAppendRefusal(runtime.journal, 'presentation-claim', () =>
      dispatch.sendDeferredPresentation(port, runtime.journal, session, '- first\n- second', ['second', 'first'], profile, 'Await'))
    assert.equal(refused.refused, 1)
    assert.equal(refused.value.ok, false)
    assert.match(refused.value.error, /append not attempted.*writer is closing/)
    assert.equal(sends, 0)
    assert.equal(factPayloads(directory, 'DeferredWorkPresentationClaimed').length, 1)
    assert.deepEqual(journal.JournalSurface_pendingDeferredWork(runtime.journal, session).map(item => item.occurrence), ['first', 'second'])
    assert.deepEqual(factPayloads(directory, 'DeferredWorkConsumed'), [])
  })
})

for (const [name, outcome] of [['unknown', () => dispatch.acceptanceUnknown('unreadable outcome')], ['receipt without physical acceptance', () => dispatch.admittedWithReceipt('accepted-presentation')]]) {
  test(`WHAT[attention-regulation-005] ${name} preserves the exact batch without consumption`, async () => {
    await withPresentation(async ({ directory, runtime, session, profile }) => {
      let sends = 0
      const port = { SubscribeTerminal: () => ({ Dispose() {} }), SendPrompt: async () => { sends += 1; return outcome() } }
      const sent = await dispatch.sendDeferredPresentation(port, runtime.journal, session, '- first\n- second', ['second', 'first'], profile, 'Await')
      assert.equal(sends, 1)
      assert.equal(dispatch.pendingClaimCount(runtime.journal, session), 2)
      assert.deepEqual(journal.JournalSurface_pendingDeferredWork(runtime.journal, session).map(item => item.occurrence), ['first', 'second'])
      assert.deepEqual(factPayloads(directory, 'DeferredWorkConsumed'), [])
      assert.deepEqual(factPayloads(directory, 'PluginPromptPhysicalAccepted'), [])
      const claims = factPayloads(directory, 'DeferredWorkPresentationClaimed')
        .filter(fact => fact.PromptKey[1] === sent.observation.metadata.wanxiangshu_prompt_key)
      assert.equal(claims.length, 1)
      assert.deepEqual(claims[0].OccurrenceIds, ['second', 'first'])
    })
  })
}

test('WHAT[attention-regulation-005] an explicitly refused send preserves work and its retry derives a new key', async () => {
  await withPresentation(async ({ directory, runtime, session, profile }) => {
    const captured = []
    let refuse = true
    const port = { SubscribeTerminal: () => ({ Dispose() {} }), SendPrompt: async (_session, _text, options) => {
      captured.push(options)
      return refuse ? dispatch.retryable('not sent') : dispatch.admittedWithReceipt('accepted-retry')
    } }
    const first = await dispatch.sendDeferredPresentation(port, runtime.journal, session, '- second\n- first', ['second', 'first'], profile, 'Await')
    assert.equal(first.ok, false)
    assert.equal(dispatch.pendingClaimCount(runtime.journal, session), 1, 'only the independently seeded claim remains')
    refuse = false
    const second = await dispatch.sendDeferredPresentation(port, runtime.journal, session, '- second\n- first', ['second', 'first'], profile, 'Await')
    assert.equal(second.ok, true, second.error)
    assert.notEqual(captured[0].Metadata.wanxiangshu_prompt_key, captured[1].Metadata.wanxiangshu_prompt_key)
    assert.deepEqual(journal.JournalSurface_pendingDeferredWork(runtime.journal, session).map(item => item.occurrence), ['first', 'second'])
    assert.equal(factPayloads(directory, 'PluginPromptAbandoned').length, 1)
    assert.deepEqual(factPayloads(directory, 'DeferredWorkConsumed'), [])
  })
})

test('WHAT[attention-regulation-005] occurrence boundaries participate in key identity with original bytes', () => {
  const origin = occurrenceIds => ({ ...authority.originForContinuation('DeferredWorkPresentation'), occurrenceIds })
  const key = ids => authority.derivePromptKey(value => value, 'session', 'run', 'root', origin(ids), 'same-payload', 1)
  const scope = ids => authority.claimScopeDigest('session', 'run', origin(ids), 'same-payload')
  assert.notEqual(key(['a', 'bc']), key(['ab', 'c']))
  assert.notEqual(scope(['a', 'bc']), scope(['ab', 'c']))
  assert.notEqual(key(['a', 'bc']), key(['bc', 'a']))
  assert.notEqual(key([' a', 'bc']), key(['a', 'bc']))
  assert.match(key([' a', 'bc']), /2: a2:bc/)
})

test('WHAT[attention-regulation-005] claim, receipt and exact physical projection round trips preserve the occurrence batch', async () => {
  await withPresentation(async ({ session, profile }) => {
    const claim = { ...authority.claimContinuation('round-trip', session, 'DeferredWorkPresentation', profile, 'payload'), occurrenceIds: [' first', 'second'] }
    let projection = authority.registerAuthority(profile, authority.empty)
    projection = authority.registerClaim(claim, projection)
    assert.deepEqual(projection.pendingClaims[0].occurrenceIds, claim.occurrenceIds)
    projection = authority.submitClaim('round-trip', 'accepted-receipt', projection)
    assert.deepEqual(projection.pendingClaims[0].occurrenceIds, claim.occurrenceIds)
    projection = authority.acceptClaim('round-trip', 'round-trip-physical', projection)
    assert.deepEqual(projection.physicalLandings[0].occurrenceIds, claim.occurrenceIds)
    assert.deepEqual(projection.acceptedDispatches[0].occurrenceIds, claim.occurrenceIds)
    assert.deepEqual(projection.acceptedContinuations[0].occurrenceIds, claim.occurrenceIds)
    projection = authority.submitClaim('absent', 'noop-receipt', projection)
    assert.deepEqual(projection.physicalLandings[0].occurrenceIds, claim.occurrenceIds)
  })
})

for (const accepted of [false, true]) {
  test(`WHAT[attention-regulation-005] a historical ${accepted ? 'accepted' : 'pending'} presentation with no batch keeps work and suppresses another real natural presentation`, async () => {
    await withPresentation(async ({ hooks, directory, runtime, session, claim }) => {
      const root = { id: 'presentation-root', sessionID: session, role: 'user', agent: 'engineer', model: {} }
      const parts = [{ type: 'text', text: 'Finish the original work.' }]
      runtime.pushHostMessage(session, { info: root, parts })
      await hooks['chat.message']({ sessionID: session, messageID: root.id, agent: 'engineer' }, { message: root, parts })
      const assistant = { info: { id: 'legacy-terminal', sessionID: session, parentID: root.id,
        role: 'assistant', agent: 'engineer', providerID: 'provider', modelID: 'engineer-model', time: { created: 2 },
      }, parts: [] }
      runtime.pushHostMessage(session, assistant)
      await hooks['experimental.chat.messages.transform']({ sessionID: session }, { messages: [{ info: root, parts }] })
      if (accepted) {
        const outcomes = await recovery.reconcile(runtime.journal, [{ id: 'legacy-physical', role: 'user',
          metadata: { wanxiangshu_prompt_key: claim.promptKey } }])
        assert.equal(outcomes[0].outcome, 'Proven')
      }
      assistant.parts.push({ id: 'legacy-answer', type: 'text', text: 'The original work is complete.' })
      assistant.info.time.completed = 3
      assistant.info.finish = 'stop'
      await hooks.event({ event: { type: 'message.updated', properties: { info: assistant.info } } })
      await hooks.event({ event: { type: 'session.idle', properties: { sessionID: session } } })
      await new Promise(resolve => setTimeout(resolve, 100))
      assert.deepEqual(runtime.prompts.filter(prompt => prompt.sessionID === session), [])
      assert.deepEqual(factPayloads(directory, 'DeferredWorkPresentationClaimed'), [])
      assert.deepEqual(factPayloads(directory, 'DeferredWorkConsumed'), [])
      assert.deepEqual(journal.JournalSurface_pendingDeferredWork(runtime.journal, session).map(item => item.occurrence), ['first', 'second'])
    }, { historical: true })
  })
}

for (const historical of [false, true]) {
  test(`WHAT[attention-regulation-005] ${historical ? 'historical' : 'new'} claims cannot overwrite the batch after its physical landing`, async () => {
    await withPresentation(async ({ directory, runtime, session, claim }) => {
      const outcomes = await recovery.reconcile(runtime.journal, [{ id: 'exact-physical', role: 'user',
        metadata: { wanxiangshu_prompt_key: claim.promptKey } }])
      assert.equal(outcomes[0].outcome, 'Proven')
      const before = dispatch.projectionObservation(runtime.journal, session)
      const result = await (historical ? dispatch.appendHistoricalPromptClaim : dispatch.appendDeferredPresentationClaim)(runtime.journal, { ...claim, occurrenceIds: ['second'] })
      assert.equal(result.ok, false)
      assert.deepEqual(dispatch.projectionObservation(runtime.journal, session), before)
      assert.deepEqual(journal.JournalSurface_pendingDeferredWork(runtime.journal, session), [])
      assert.equal(factPayloads(directory, 'PluginPromptPhysicalAccepted').length, 1)
      assert.equal(factPayloads(directory, 'DeferredWorkPresentationClaimed').length, historical ? 1 : 2)
      assert.equal(journalEventLines(directory).map(line => JSON.parse(line)).filter(event => event.event_type === 'ProjectionCutTail').length, 1)
    })
  })
}

for (const [role, delivery] of [['engineer', 'live'], ['devops', 'live'], ['orchestrator', 'live'], ['engineer', 'cold']]) {
test(`WHAT[attention-regulation-005] natural ${role} completion preserves and consumes its exact deferred batch through ${delivery} physical ingress`, {
  timeout: 5000,
}, async () => {
  await withExecutablePlugin(async (hooks, directory, _created, runtime) => {
    const session = `deferred-${role}-terminal`
    const root = { id: 'deferred-root', sessionID: session, role: 'user', agent: role, model: {} }
    const parts = [{ type: 'text', text: 'Finish the current investigation.' }]
    await acceptAuthorityRoot(runtime, session, role, root.id)
    runtime.pushHostMessage(session, { info: root, parts })
    await hooks['chat.message']({ sessionID: session, messageID: root.id, agent: role }, { message: root, parts })
    const assistant = { info: {
      id: 'deferred-terminal', sessionID: session, parentID: root.id,
      role: 'assistant', agent: role, providerID: 'provider', modelID: `${role}-model`, time: { created: 2 },
    }, parts: [] }
    runtime.pushHostMessage(session, assistant)
    await hooks['experimental.chat.messages.transform']({ sessionID: session }, { messages: [{ info: root, parts }] })
    for (const [call, text] of [['terminal-first', 'Inspect the next source change'], ['terminal-second', 'Document the next boundary']]) {
      await hooks.tool.defer.execute({ new_work: text }, { sessionID: session, callID: call, messageID: assistant.info.id, agent: role })
    }
    assert.deepEqual(journal.JournalSurface_pendingDeferredWork(runtime.journal, session).map(item => item.occurrence).sort(), ['terminal-first', 'terminal-second'])
    assert.deepEqual(factPayloads(directory, 'DeferredWorkConsumed'), [])
    const captured = []
    let notifyPresentation
    const presentation = new Promise(resolve => { notifyPresentation = resolve })
    let release
    const paused = new Promise(resolve => { release = resolve })
    const original = runtime.client.session.promptAsync
    runtime.client.session.promptAsync = async function (args) {
      if (args.path?.id === session) {
        captured.push(args)
        notifyPresentation()
        await paused
        return {}
      }
      return Reflect.apply(original, this, [args])
    }
    try {
      assistant.parts.push({ id: 'deferred-answer', type: 'text', text: 'The current investigation is complete.' })
      assistant.info.time.completed = 3
      assistant.info.finish = 'stop'
      await hooks.event({ event: { type: 'message.updated', properties: { info: assistant.info } } })
      await hooks.event({ event: { type: 'session.idle', properties: { sessionID: session } } })
      let timeout
      try {
        await Promise.race([presentation, new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error(`natural presentation was not reached: ${JSON.stringify(runtime.prompts)}`)), 1500)
        })])
      } finally {
        clearTimeout(timeout)
      }
      assert.equal(captured.length, 1, `the real natural terminal prepares one presentation: ${JSON.stringify(runtime.prompts)}`)
      assert.equal(captured[0].body.metadata.wanxiangshu_origin, 'DeferredWorkPresentation')
      assert.match(captured[0].body.metadata.wanxiangshu_prompt_key, /^[0-9a-f]{64}$/)
      assert.equal(captured[0].body.parts[0].text, '- Inspect the next source change\n- Document the next boundary')
      await hooks.event({ event: { type: 'message.updated', properties: { info: assistant.info } } })
      await hooks.event({ event: { type: 'session.idle', properties: { sessionID: session } } })
      await new Promise(resolve => setTimeout(resolve, 100))
      assert.equal(captured.length, 1, 'a repeated real terminal does not resend the pending batch')
      assert.deepEqual(factPayloads(directory, 'PluginPromptPhysicalAccepted')
        .filter(fact => fact.PromptKey[1] === captured[0].body.metadata.wanxiangshu_prompt_key), [])
      assert.deepEqual(factPayloads(directory, 'DeferredWorkConsumed'), [])
      assert.deepEqual(journal.JournalSurface_pendingDeferredWork(runtime.journal, session).map(item => item.occurrence).sort(), ['terminal-first', 'terminal-second'])
      const key = captured[0].body.metadata.wanxiangshu_prompt_key
      const claims = factPayloads(directory, 'DeferredWorkPresentationClaimed').filter(fact => fact.PromptKey[1] === key)
      assert.equal(claims.length, 1)
      assert.deepEqual(claims[0].OccurrenceIds, ['terminal-first', 'terminal-second'])
      assert.equal(claims[0].SessionId[1], session)
      assert.deepEqual(factPayloads(directory, 'PluginPromptClaimed').filter(fact => fact.PromptKey[1] === key), [])
      await hooks.tool.defer.execute({ new_work: 'Inspect the next source change' }, {
        sessionID: session, callID: 'terminal-later', messageID: assistant.info.id, agent: role,
      })
      const foreign = 'deferred-foreign'
      const foreignRecorded = await journal.JournalSurface_appendAgent(runtime.journal, { kind: 'Session', session: foreign }, null, {
        family: 'Attention', case: 'DeferredWorkRecorded', payload: {
          SessionId: foreign, OccurrenceId: 'terminal-first', Text: 'Independent work with the same occurrence ID',
        },
      })
      assert.equal(foreignRecorded.ok, true, foreignRecorded.error)
      const message = {
        id: 'deferred-physical', sessionID: session, role: 'user', agent: role,
        metadata: captured[0].body.metadata,
      }
      const active = dispatch.projectionObservation(runtime.journal, session).activeLogicalRun
      const roots = factPayloads(directory, 'AuthorityRootAccepted')
      if (delivery === 'live') {
        runtime.pushHostMessage(session, { info: message, parts: captured[0].body.parts })
        const accept = () => hooks['chat.message']({ sessionID: session, messageID: message.id, agent: role }, {
          message, parts: captured[0].body.parts,
        })
        await accept()
        await accept()
        assert.deepEqual(dispatch.projectionObservation(runtime.journal, session).activeLogicalRun, active)
        assert.deepEqual(factPayloads(directory, 'AuthorityRootAccepted'), roots)
        assert.deepEqual(journal.JournalSurface_pendingDeferredWork(runtime.journal, session), [
          { occurrence: 'terminal-later', text: 'Inspect the next source change' },
        ])
        assert.equal(journal.JournalSurface_deferredWorkWasConsumed(runtime.journal, session, 'terminal-first'), true)
        assert.equal(journal.JournalSurface_deferredWorkWasConsumed(runtime.journal, session, 'terminal-second'), true)
        assert.equal(journal.JournalSurface_deferredWorkWasConsumed(runtime.journal, session, 'terminal-later'), false)
        assert.deepEqual(factPayloads(directory, 'DeferredWorkConsumed'), [])
        assert.equal(factPayloads(directory, 'PluginPromptPhysicalAccepted').filter(fact => fact.PromptKey[1] === key).length, 1)
      }
      const child = fileURLToPath(new URL('./support/presentation-cold-child.mjs', import.meta.url))
      const cold = JSON.parse(execFileSync(process.execPath, [child, directory, JSON.stringify({
        session, foreign, role, key, message, parts: captured[0].body.parts,
        accept: delivery === 'cold', parentPid: process.pid,
      })], { encoding: 'utf8', timeout: 5000 }).trim())
      assert.notEqual(cold.pid, process.pid)
      assert.deepEqual(cold, { pid: cold.pid, pending: ['terminal-later'], consumed: ['terminal-first', 'terminal-second'], foreign: ['terminal-first'] })
      assert.equal(captured.length, 1, 'physical ingress does not send another presentation')
    } finally {
      release()
      runtime.client.session.promptAsync = original
    }
  })
})
}

test('WHAT[attention-regulation-005] the consumption projection suppresses replayed Manager work', async () => {
  const fixture = recordingPort()
  await tools.execute(fixture.tools, 'defer', { new_work: 'first' }, context('session-manager', 'call-m1'))
  await tools.execute(fixture.tools, 'defer', { new_work: 'second' }, context('session-manager', 'call-m2'))
  assert.deepEqual(pendingOf(fixture, 'session-manager'), [
    { occurrence: 'call-m1', text: 'first' },
    { occurrence: 'call-m2', text: 'second' },
  ])
  fixture.state = attention.consume('session-manager', ['call-m1', 'call-m2'], fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-manager'), [])
  // Replaying the same records (a journal rebuild) cannot resurrect them.
  fixture.state = attention.record('session-manager', 'call-m1', 'first', fixture.state)
  fixture.state = attention.record('session-manager', 'call-m2', 'second', fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-manager'), [])
  // Consuming the same ids again is idempotent.
  fixture.state = attention.consume('session-manager', ['call-m1', 'call-m2'], fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-manager'), [])
})

test('WHAT[attention-regulation-005] the consumption projection suppresses replayed Engineer work', async () => {
  const fixture = recordingPort()
  await tools.execute(fixture.tools, 'defer', { new_work: 'follow up' }, context('session-engineer', 'call-e1'))
  const work = pendingOf(fixture, 'session-engineer').map((item) => item.occurrence)
  fixture.state = attention.consume('session-engineer', work, fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-engineer'), [])
  // The projection remains empty on a repeated observation.
  assert.deepEqual(pendingOf(fixture, 'session-engineer'), [])
  // Replaying the record after the receipt stays suppressed.
  fixture.state = attention.record('session-engineer', 'call-e1', 'follow up', fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-engineer'), [])
})

test('WHAT[attention-regulation-005] the consumption projection suppresses replayed Orchestrator work', async () => {
  const fixture = recordingPort()
  await tools.execute(fixture.tools, 'defer', { new_work: 'hand over' }, context('session-orchestrator', 'call-o1'))
  assert.equal(pendingOf(fixture, 'session-orchestrator').length, 1)
  fixture.state = attention.consume('session-orchestrator', ['call-o1'], fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-orchestrator'), [])
  fixture.state = attention.record('session-orchestrator', 'call-o1', 'hand over', fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-orchestrator'), [])
})

test('WHAT[attention-regulation-005] a receipt recorded before its work stays order-independent across replay', () => {
  let state = attention.empty()
  state = attention.consume('session-a', ['late'], state)
  state = attention.record('session-a', 'late', 'arrived after the receipt', state)
  assert.deepEqual(attention.pending('session-a', state), [])
})

test('WHAT[attention-regulation-005] closing a life consumes its remaining work without leaking into a reused session', async () => {
  const fixture = recordingPort()
  await tools.execute(fixture.tools, 'defer', { new_work: 'old life' }, context('session-reuse', 'call-r1'))
  fixture.state = attention.closeLife('session-reuse', fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-reuse'), [])
  // Replaying the old record cannot resurrect it into the reused session.
  fixture.state = attention.record('session-reuse', 'call-r1', 'old life', fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-reuse'), [])
  // A fresh life under the same session records new work normally.
  fixture.state = attention.record('session-reuse', 'call-r2', 'new life work', fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-reuse'), [{ occurrence: 'call-r2', text: 'new life work' }])
})

for (const grade of ['PERFECT', 'REVISE']) {
  test(`WHAT[attention-regulation-005] registered Manager suicide persists the exact consumption receipt after ${grade} retirement`, async () => {
    await withReview(async fixture => {
      const toolContext = call => ({
        sessionID: fixture.session, callID: call, messageID: call, agent: 'manager',
      })
      for (const [call, text] of [['deferred-first', 'Inspect the next change'], ['deferred-second', 'Document the remaining boundary']]) {
        await fixture.hooks.tool.defer.execute({ new_work: text }, toolContext(call))
      }
      const foreignText = fixture.session + '-foreign'
      const foreignAppend = await journal.JournalSurface_appendAgent(
        fixture.runtime.journal, { kind: 'Session', session: foreignText }, null,
        { family: 'Attention', case: 'DeferredWorkRecorded', payload: {
          SessionId: foreignText, OccurrenceId: 'deferred-first', Text: 'Other participant work',
        } },
      )
      assert.equal(foreignAppend.ok, true, foreignAppend.error)
      assert.match(await fixture.execute(findings(grade)), /recorded = true/)
      const recorded = factPayloads(fixture.directory, 'DeferredWorkRecorded')
        .filter(item => item.SessionId[1] === fixture.session)
      assert.equal(recorded.length, 2)
      assert.deepEqual(recorded.map(item => item.SessionId), [['SessionId', fixture.session], ['SessionId', fixture.session]])
      const first = await fixture.hooks.tool.suicide.execute({}, toolContext('confirmation'))
      assert.match(first, /finished = false/)
      assert.match(first, /confirmation_required = true/)
      assert.match(first, /Inspect the next change/)
      assert.match(first, /Document the remaining boundary/)
      assert.equal(journal.JournalSurface_pendingDeferredWork(fixture.runtime.journal, fixture.session).length, 2)
      assert.deepEqual(factPayloads(fixture.directory, 'DeferredWorkConsumed'), [])
      assert.match(await fixture.hooks.tool.suicide.execute({}, toolContext('retirement')), /finished = true/)
      const consumed = factPayloads(fixture.directory, 'DeferredWorkConsumed')
      assert.equal(consumed.length, 1, 'successful retirement leaves one independent durable receipt')
      assert.deepEqual(consumed[0].SessionId, ['SessionId', fixture.session])
      assert.deepEqual(consumed[0].OccurrenceIds.toSorted(), recorded.map(item => item.OccurrenceId).toSorted())
      assert.deepEqual(journal.JournalSurface_pendingDeferredWork(fixture.runtime.journal, fixture.session), [])
      assert.equal(journal.JournalSurface_pendingDeferredWork(fixture.runtime.journal, foreignText).length, 1)
      const cold = JSON.parse(execFileSync(process.execPath, [
        fileURLToPath(new URL('./support/consumption-cold-child.mjs', import.meta.url)),
        fixture.directory, fixture.session, foreignText, ...consumed[0].OccurrenceIds,
      ], { encoding: 'utf8' }))
      assert.notEqual(cold.pid, process.pid)
      assert.deepEqual(cold, { pid: cold.pid, pending: 0, foreignPending: 1, occurrences: consumed[0].OccurrenceIds })
    })
  })
}

for (const grade of ['PERFECT', 'REVISE']) {
  test(`WHAT[attention-regulation-005] registered Manager suicide reports an unavailable consumption append after ${grade} retirement`, async () => {
    await withReview(async fixture => {
      const toolContext = call => ({ sessionID: fixture.session, callID: call, messageID: call, agent: 'manager' })
      await fixture.hooks.tool.defer.execute({ new_work: 'Keep the missing receipt visible' }, toolContext('deferred-failure'))
      assert.match(await fixture.execute(findings(grade)), /recorded = true/)
      assert.match(await fixture.hooks.tool.suicide.execute({}, toolContext('confirmation')), /confirmation_required = true/)
      const refused = await withAppendRefusal(fixture.runtime.journal, 'consumption', async () => {
        await assert.rejects(
          () => fixture.hooks.tool.suicide.execute({}, toolContext('retirement')),
          /deferred work consumption durability unavailable/,
        )
        return null
      })
      assert.deepEqual(refused, { refused: 1, value: null })
      assert.deepEqual(factPayloads(fixture.directory, 'DeferredWorkConsumed'), [])
      assert.equal(factPayloads(fixture.directory, 'RetirementCommitted').length, 1,
        'a failed later receipt cannot erase the already durable retirement')
    })
  })
}

test('WHAT[attention-regulation-005] a refused retirement append preserves work without appending a consumption receipt', async () => {
  await withReview(async fixture => {
    const toolContext = call => ({ sessionID: fixture.session, callID: call, messageID: call, agent: 'manager' })
    await fixture.hooks.tool.defer.execute({ new_work: 'Still pending when retirement is refused' }, toolContext('deferred-refused-retirement'))
    assert.match(await fixture.execute(findings('PERFECT')), /recorded = true/)
    assert.match(await fixture.hooks.tool.suicide.execute({}, toolContext('confirmation')), /confirmation_required = true/)
    const refused = await withAppendRefusal(fixture.runtime.journal, 'retirement', async () => {
      await assert.rejects(() => fixture.hooks.tool.suicide.execute({}, toolContext('retirement')))
      return null
    })
    assert.deepEqual(refused, { refused: 1, value: null })
    assert.deepEqual(factPayloads(fixture.directory, 'RetirementCommitted'), [])
    assert.deepEqual(factPayloads(fixture.directory, 'DeferredWorkConsumed'), [])
    const replay = await fixture.hooks.tool.suicide.execute({}, toolContext('confirmation'))
    assert.match(replay, /confirmation_required = true/)
    assert.match(replay, /Still pending when retirement is refused/)
  })
})
