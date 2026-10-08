import test from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import * as routing from '../../../dist/OpenCode/Host/ModelRoutingSurface.js'
import * as recovery from '../../../dist/OpenCode/Host/SessionRecoveryHostSurface.js'
import * as dispatch from '../../../dist/Interaction/Dispatch/DispatchSurface.js'
import { withExecutablePlugin } from '../../verification-system/tests/support/plugin-fixture.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

test('WHAT[host-boundary-033] Host title observes an admitted user without consuming or rewriting its managed execution', async () => {
  const journal = await import('../../../dist/Persistence/Journal/Surface.js')
  await withExecutablePlugin(async (hooks, _directory, _created, runtime) => {
    const sessionID = 'ses-title-shared-admitted-user'
    const message = {
      id: 'msg-title-shared-admitted-user', sessionID, role: 'user', agent: 'engineer',
      model: { providerID: 'host', modelID: 'placeholder' },
    }
    const previousRoutingSeen = globalThis.__wanxiangshu_test_routing_seen
    globalThis.__wanxiangshu_test_routing_seen = []
    try {
      await hooks['chat.message']({ sessionID, messageID: message.id, agent: 'engineer' }, {
        message, parts: [{ type: 'text', text: 'Name this controlled conversation.' }],
      })
      assert.deepEqual(recovery.journalExecutionStatus(runtime.journal, sessionID, message.id), {
        phase: 'Accepted', disposition: null,
      })
      const input = {
        sessionID, message, agent: 'title',
        model: {
          providerID: 'host-title', id: 'small-title-model', capabilities: { temperature: true },
          options: { temperature: 0.5 }, variants: { none: { temperature: 0.5 } },
        },
      }
      const output = { temperature: 0.5, options: { temperature: 0.5, existing: 'sentinel' } }
      const before = {
        input: structuredClone(input), output: structuredClone(output),
        messageModel: message.model, providerModel: input.model,
        capacity: routing.sharedCapacitySnapshot(),
        journal: journal.JournalSurface_snapshot(runtime.journal),
        routes: structuredClone(globalThis.__wanxiangshu_test_routing_seen),
      }
      assert.equal(before.routes.length, 1, 'the real chat.message must acquire its managed execution')
      await hooks['chat.params'](input, output)
      await hooks['chat.params'](input, output)
      assert.deepEqual(structuredClone(input), before.input, 'Host title keeps its own small model and the original admitted User')
      assert.equal(input.message, message)
      assert.equal(message.model, before.messageModel)
      assert.equal(input.model, before.providerModel)
      assert.deepEqual(output, before.output, 'Host title keeps its approved parameters')
      assert.deepEqual(routing.sharedCapacitySnapshot(), before.capacity)
      assert.deepEqual(journal.JournalSurface_snapshot(runtime.journal), before.journal)
      assert.deepEqual(globalThis.__wanxiangshu_test_routing_seen, before.routes)
      assert.deepEqual(runtime.abortedIds, [])
      assert.deepEqual(runtime.prompts, [])
    } finally {
      if (previousRoutingSeen === undefined) delete globalThis.__wanxiangshu_test_routing_seen
      else globalThis.__wanxiangshu_test_routing_seen = previousRoutingSeen
    }
  })
})

test('WHAT[host-boundary-033] title exemption does not admit managed model, participant or unknown-agent drift', async () => {
  const journal = await import('../../../dist/Persistence/Journal/Surface.js')
  await withExecutablePlugin(async (hooks, _directory, _created, runtime) => {
    const sessionID = 'ses-title-drift-controls'
    const message = {
      id: 'msg-title-drift-controls', sessionID, role: 'user', agent: 'engineer', model: {},
    }
    await hooks['chat.message']({ sessionID, messageID: message.id, agent: 'engineer' }, {
      message, parts: [{ type: 'text', text: 'Keep this managed execution exact.' }],
    })
    for (const [agent, id, error] of [
      ['engineer', 'drifted-model', /provider model\/reasoning drift/],
      ['devops', message.model.modelID, /provider agent drift/],
      ['unexpected-host-agent', message.model.modelID, /provider agent drift/],
      ['Title', message.model.modelID, /provider agent drift/],
      ['title-other', message.model.modelID, /provider agent drift/],
    ]) {
      const input = { sessionID, message, agent, model: {
        providerID: message.model.providerID, id, capabilities: { temperature: true },
      } }
      const output = { temperature: 0.123, options: { existing: 'sentinel' } }
      const before = {
        input: structuredClone(input), output: structuredClone(output),
        messageModel: message.model, providerModel: input.model,
        capacity: routing.sharedCapacitySnapshot(), journal: journal.JournalSurface_snapshot(runtime.journal),
      }
      assert.throws(() => hooks['chat.params'](input, output), error)
      assert.deepEqual(structuredClone(input), before.input)
      assert.equal(input.message, message)
      assert.equal(message.model, before.messageModel)
      assert.equal(input.model, before.providerModel)
      assert.deepEqual(output, before.output)
      assert.deepEqual(routing.sharedCapacitySnapshot(), before.capacity)
      assert.deepEqual(journal.JournalSurface_snapshot(runtime.journal), before.journal)
    }
  })
})

for (const origin of ['HumanMessage', 'BusyAgentNudge']) {
test(`WHAT[host-boundary-033] ${origin} preserves the old lease until the visible input enters its next provider step`, async () => {
  await withExecutablePlugin(async (hooks, _directory, _created, runtime) => {
    const sessionID = `ses-superseded-observation-${origin}`
    const admit = async (messageID, metadata = undefined) => {
      const carrier = metadata === undefined ? {} : { metadata }
      const message = { id: messageID, sessionID, role: 'user', agent: 'engineer', model: {}, ...carrier }
      const parts = [{ type: 'text', text: 'controlled input', ...carrier }]
      await hooks['chat.message']({ sessionID, messageID, agent: 'engineer' }, { message, parts })
      return message
    }
    await admit('msg-root')
    const profile = dispatch.projectionObservation(runtime.journal, sessionID).activeLogicalRun
    const guard = await dispatch.sendContinuation({
      SubscribeTerminal: () => ({ Dispose() {} }),
      SendPrompt: async () => dispatch.admittedWithReceipt('guard-receipt'),
    }, runtime.journal, sessionID, 'controlled input', 'ManagerGuard', profile, 'Await')
    assert.equal(guard.ok, true, guard.error)
    const oldMessage = await admit('msg-old', guard.observation.metadata)
    const appendInput = async messageID => {
      let metadata
      if (origin === 'BusyAgentNudge') {
        const guidance = await dispatch.sendContinuation({
          SubscribeTerminal: () => ({ Dispose() {} }),
          SendPrompt: async () => dispatch.admittedWithReceipt(`guidance-receipt-${messageID}`),
        }, runtime.journal, sessionID, 'controlled input', origin, profile, 'Await')
        assert.equal(guidance.ok, true, guidance.error)
        metadata = guidance.observation.metadata
      }
      return admit(messageID, metadata)
    }
    const earlierMessage = await appendInput('msg-earlier')
    const newMessage = await appendInput('msg-new')
    assert.deepEqual(recovery.journalExecutionStatus(runtime.journal, sessionID, oldMessage.id), {
      phase: 'Accepted', disposition: null,
    })
    assert.deepEqual(recovery.journalExecutionStatus(runtime.journal, sessionID, newMessage.id), {
      phase: 'Accepted', disposition: null,
    })
    assert.deepEqual(runtime.abortedIds, [], 'new human input must not interrupt the current Guard output')
    const beforeVisibility = routing.sharedCapacitySnapshot()
    await hooks['chat.params']({
      sessionID, message: oldMessage, agent: 'engineer',
      model: { providerID: 'provider', id: 'engineer-model', capabilities: {} },
    }, {})
    assert.deepEqual(routing.sharedCapacitySnapshot(), beforeVisibility,
      'an old request already preparing before Host storage still owns its exact lease')
    runtime.pushHostMessage(sessionID, {
      info: {
        id: 'assistant-new', sessionID, parentID: newMessage.id, role: 'assistant',
        agent: 'engineer', providerID: 'provider', modelID: 'engineer-model', time: { created: 2 },
      },
      parts: [],
    })
    await hooks['experimental.chat.messages.transform']({}, {
      messages: [earlierMessage, newMessage].map(info => ({
        info, parts: [{ type: 'text', text: 'controlled input' }],
      })),
    })
    assert.deepEqual(recovery.journalExecutionStatus(runtime.journal, sessionID, oldMessage.id), {
      phase: 'Terminal', disposition: 'Cancelled',
    })
    assert.deepEqual(recovery.journalExecutionStatus(runtime.journal, sessionID, newMessage.id), {
      phase: 'ProviderStarted', disposition: null,
    })
    assert.deepEqual(recovery.journalExecutionStatus(runtime.journal, sessionID, earlierMessage.id), {
      phase: 'Terminal', disposition: 'Cancelled',
    }, 'earlier material in the same request cannot remain a recoverable unstarted execution')
    const before = routing.sharedCapacitySnapshot()
    assert.equal(before.tokens.filter(token => token.owner.sessionId === sessionID).length, 1)
    assert.equal(before.tokens.find(token => token.owner.sessionId === sessionID).owner.physicalUserMessageId, newMessage.id)
    const output = { temperature: 0.123 }
    assert.throws(() => hooks['chat.params']({
      sessionID, message: oldMessage, agent: 'engineer',
      model: { providerID: 'provider', id: 'engineer-model', capabilities: {} },
    }, output))
    assert.deepEqual(output, { temperature: 0.123 })
    assert.deepEqual(routing.sharedCapacitySnapshot(), before)
    await hooks.event({ event: { type: 'session.error', properties: {
      sessionID, error: { name: 'MessageAbortedError', data: { message: 'old Guard interrupted' } },
    } } })
    await hooks.event({ event: { type: 'message.updated', properties: { info: {
      id: 'assistant-old', sessionID, parentID: oldMessage.id, role: 'assistant',
      agent: 'engineer', modelID: 'engineer-model', providerID: 'provider',
      time: { created: 1, completed: 2 },
      error: { name: 'MessageAbortedError', data: { message: 'old Guard interrupted' } },
    } } } })
    assert.deepEqual(routing.sharedCapacitySnapshot(), before)
    await hooks['chat.params']({
      sessionID, message: newMessage, agent: 'engineer',
      model: { providerID: 'provider', id: 'engineer-model', capabilities: {} },
    }, {})
    assert.equal(runtime.prompts.filter(prompt => prompt.path?.id === sessionID).length, 0,
      'late observation must not dispatch a provider retry to the superseded execution')
    assert.ok(runtime.prompts.every(prompt => prompt.body?.agent === 'blogger'))
  })
})
}

test('WHAT[host-boundary-033] a later human input replaces queued demand with no live lease without interrupting the Host', async () => {
  await withExecutablePlugin(async (hooks, _directory, _created, runtime) => {
    const sessionID = 'ses-queued-supersession'
    const admit = async (messageID, metadata, targetSession = sessionID) => {
      const carrier = metadata === undefined ? {} : { metadata }
      const message = { id: messageID, sessionID: targetSession, role: 'user', agent: 'engineer', model: {}, ...carrier }
      await hooks['chat.message']({ sessionID: targetSession, messageID, agent: 'engineer' }, {
        message, parts: [{ type: 'text', text: 'controlled input', ...carrier }],
      })
      return message
    }
    globalThis.__wanxiangshu_test_routing_decision = () => null
    const human = admit('msg-human').then(
      () => ({ accepted: true }),
      error => ({ accepted: false, error }),
    )
    try {
      await new Promise(setImmediate)
      assert.deepEqual(recovery.journalExecutionStatus(runtime.journal, sessionID, 'msg-human'), {
        phase: 'Accepted', disposition: null,
      })
      assert.equal(routing.sharedCapacitySnapshot().waiters.filter(value => value.kind === 'Admission').length, 1)
      const latest = admit('msg-latest')
      await new Promise(setImmediate)
      assert.deepEqual(recovery.journalExecutionStatus(runtime.journal, sessionID, 'msg-latest'), {
        phase: 'Accepted', disposition: null,
      })
      globalThis.__wanxiangshu_test_routing_decision = () => ({ model: 'provider/engineer-model', reasoning: 'none' })
      await admit('msg-trigger', undefined, 'ses-independent-queue-trigger')
      const current = await latest
      const old = await human
      assert.equal(old.accepted, false)
      assert.deepEqual(recovery.journalExecutionStatus(runtime.journal, sessionID, 'msg-human'), {
        phase: 'Terminal', disposition: 'Cancelled',
      })
      assert.deepEqual(recovery.journalExecutionStatus(runtime.journal, sessionID, current.id), {
        phase: 'Accepted', disposition: null,
      })
      await hooks['chat.params']({ sessionID, message: current, agent: 'engineer', model: {
        providerID: 'provider', id: 'engineer-model', capabilities: {},
      } }, {})
      assert.equal(runtime.prompts.length, 0)
      assert.deepEqual(runtime.abortedIds, [])
    } finally {
      delete globalThis.__wanxiangshu_test_routing_decision
    }
  })
})

{
  const { default: assert } = await import('node:assert/strict')
  const { default: test } = await import('node:test')
  const params = await import('../../../dist/OpenCode/Host/ChatParamsSurface.js')

  const managedInput = ({ sessionID = 'ses_p2a_1', messageID = 'msg-a', agent = 'engineer' } = {}) => ({
    sessionID,
    messageID,
    agent,
    model: { providerID: 'openai', id: 'gpt-5', capabilities: {} },
    message: { id: messageID, model: {} },
  })

  // WHAT[host-boundary-033]: a message no durable Accepted execution answers is
  // not a managed provider run. The hook observes nothing and never rejects.
  test('WHAT[host-boundary-033] P2A_repeated_params_hooks_are_observations_without_durable_evidence', () => {
    const first = params.apply(managedInput(), {})
    const second = params.apply(managedInput(), {})
    assert.equal(first.ok, true, first.error)
    assert.equal(second.ok, true, second.error)
  })

  // WHAT[host-boundary-033]: interleaved A/B messages each resolve against their
  // own exact physical id; neither observation leaks into the other.
  test('WHAT[host-boundary-033] P2A_interleaved_messages_do_not_cross_validate', () => {
    const a = params.apply(managedInput({ messageID: 'msg-a' }), {})
    const b = params.apply(managedInput({ messageID: 'msg-b' }), {})
    assert.equal(a.ok, true, a.error)
    assert.equal(b.ok, true, b.error)
  })

  // WHAT[host-boundary-033]: a Host-owned auxiliary child has no durable
  // Accepted execution, so the observation barrier owns nothing there.
  test('WHAT[host-boundary-033] P2A_unmanaged_auxiliary_child_is_exempt_not_managed', () => {
    const observed = params.apply(managedInput({ sessionID: 'ses_p2a_aux', messageID: 'msg-aux' }), {})
    assert.equal(observed.ok, true, observed.error)
  })

}

{
  const { spawnSync } = await import('node:child_process')
  const { integrationTest } = await import('../../verification-system/tests/support/tier-gate.mjs')
  const runInstalledCanary = (capacityOne) => {
    const arguments_ = [join(root, 'requirements/host-boundary/tests/support/run-user-input-canary.mjs')]
    if (capacityOne) arguments_.push('--capacity-one')
    const launched = spawnSync(process.execPath, arguments_, {
      cwd: root, encoding: 'utf8', timeout: 120000,
    })
    assert.equal(launched.status, 0, `${launched.error ?? ''}\n${launched.stdout}\n${launched.stderr}`)
    const result = JSON.parse(launched.stdout.trim())
    assert.equal(result.opencode, '1.18.29')
    assert.equal(result.capacityOne, capacityOne)
    assert.equal(result.physicalCleanup, true)
    assert.deepEqual(result.results.map(value => value.phase), ['STREAMING', 'TOOL'])
    for (const execution of result.results) {
      assert.equal(execution.answerParent, execution.human)
      assert.equal(execution.interrupted, false)
      assert.equal(execution.oldFinish, execution.phase === 'STREAMING' ? 'stop' : 'tool-calls')
    }
  }
  integrationTest('WHAT[host-boundary-033] installed Host preserves streaming and non-join tools until the next human request', () => runInstalledCanary(false))
  integrationTest('WHAT[host-boundary-033] one-slot Host preserves streaming and non-join tools until the next human request', () => runInstalledCanary(true))
}
