import assert from 'node:assert/strict'
import test from 'node:test'
import * as dispatch from '../../../dist/Interaction/Dispatch/DispatchSurface.js'
import * as recovery from '../../../dist/OpenCode/Host/SessionRecoveryHostSurface.js'
import { ordinaryEffects } from '../../../dist/OpenCode/Host/PluginTransformSurface.js'
import {withSuccessor, textMessage, messageId} from './support/cut.mjs'

test('WHAT[relay-context-projection-002] the actual ordinary transform stops before every downstream context owner after a retired cut', async () => {
  for (const tentative of [false, true]) {
    assert.deepEqual(await ordinaryEffects(tentative, true), [
      'retired-attempt',
    ], 'an exact retired request must stop before admission, replay, context owners, plan freeze and delegation')
  }
})

test('WHAT[relay-context-projection-002] the actual ordinary transform continues all context owners for a current iteration', async () => {
  assert.deepEqual(await ordinaryEffects(false, false), [
    'begin', 'session-time', 'deferred', 'relay',
    'replay', 'restore-arguments', 'capture', 'commit-trace',
    'refresh-companion', 'companion', 'prefix', 'freeze-plan',
    'continuation', 'pair', 'grounding', 'delegation',
    'chronicle', 'deferred', 'sanitize',
  ])
})

test('WHAT[relay-context-projection-002] real cut rejects an old request but accepts the owner-issued successor identity', async () => {
  await withSuccessor(async ({session, history, gate, apply}) => {
    const historySnapshot = structuredClone(history)
    assert.deepEqual(await apply(structuredClone(historySnapshot)), {disposition: 'retired-attempt-stopped', messages: [], interrupted: [session]})
    const successor = [...history, gate]
    assert.deepEqual(await apply(successor), {disposition: 'current-iteration', messages: successor, interrupted: []})
    const falseGate = [...structuredClone(historySnapshot), gate, textMessage('unadmitted-wake', 'user', 'runtime/manager-assess suicide new authority')]
    assert.deepEqual(await apply(falseGate), {disposition: 'retired-attempt-stopped', messages: [], interrupted: [session]})

    // An admitted retry continuation after the cut must be accepted as the current iteration
    // rather than falsely classified as a stale retired attempt and interrupted.
    const retryContinuation = textMessage('retry-continuation-1', 'user', 'provider retry prompt')
    const withAdmittedRetry = [...structuredClone(historySnapshot), gate, retryContinuation]
    assert.deepEqual(await apply(withAdmittedRetry, true), {
      disposition: 'current-iteration', messages: withAdmittedRetry, interrupted: []
    })
  })
})

const admitRetry = async ({hooks, runtime, session}) => {
  const physical = 'admitted-successor-retry'
  const sent = await dispatch.sendContinuation({
    SubscribeTerminal: () => ({Dispose() {}}),
    SendPrompt: async () => dispatch.admittedWithReceipt('successor-retry-receipt'),
  }, runtime.journal, session, 'provider retry prompt', 'ProviderRetryAttempt',
  dispatch.projectionObservation(runtime.journal, session).activeLogicalRun, 'Await')
  assert.equal(sent.ok, true, sent.error)
  const message = {
    id: physical, sessionID: session, role: 'user', agent: 'manager',
    model: {providerID: 'provider', modelID: 'manager-model'}, metadata: sent.observation.metadata,
  }
  const parts = [{type: 'text', text: 'provider retry prompt', metadata: sent.observation.metadata}]
  await hooks['chat.message']({sessionID: session, messageID: physical, agent: 'manager'}, {message, parts})
  assert.deepEqual(recovery.journalExecutionStatus(runtime.journal, session, physical), {
    phase: 'Accepted', disposition: null,
  })
  const user = {info: message, parts}
  runtime.pushHostMessage(session, user)
  return user
}

test('WHAT[relay-context-projection-002] the registered transform accepts an admitted successor retry and rejects an unadmitted physical key', async () => {
  await withSuccessor(async context => {
    const {hooks, runtime, session, history, gate} = context
    const retry = await admitRetry(context)
    const physical = messageId(retry)
    runtime.pushHostMessage(session, {
      info: {id: 'retry-provider-run', parentID: physical, sessionID: session, role: 'assistant',
        agent: 'manager', providerID: 'provider', modelID: 'manager-model', time: {created: 5}},
      parts: [],
    })
    const beforeAborts = [...runtime.abortedIds]
    const output = {messages: [...structuredClone(history), structuredClone(gate), structuredClone(retry)]}
    await hooks['experimental.chat.messages.transform']({sessionID: session}, output)
    assert.ok(output.messages.some(message => messageId(message) === physical), 'the real retry remains provider-visible')
    assert.ok(output.messages.some(message => messageId(message) === 'retirement-run'), 'retirement history remains visible')
    assert.deepEqual(runtime.abortedIds, beforeAborts, 'a successor retry must not be interrupted as retired')
    assert.deepEqual(recovery.journalExecutionStatus(runtime.journal, session, physical), {
      phase: 'ProviderStarted', disposition: null,
    })

    const falseRetry = structuredClone(retry)
    falseRetry.info.id = 'wrong-successor-physical'
    const otherSession = `${session}-other`
    await hooks['chat.message']({sessionID: otherSession, messageID: falseRetry.info.id, agent: 'engineer'}, {
      message: {id: falseRetry.info.id, sessionID: otherSession, role: 'user', agent: 'engineer', model: {}},
      parts: [{type: 'text', text: 'a separate authority root'}],
    })
    assert.deepEqual(recovery.journalExecutionStatus(runtime.journal, otherSession, falseRetry.info.id), {
      phase: 'Accepted', disposition: null,
    })
    const activeBefore = structuredClone(dispatch.projectionObservation(runtime.journal, session))
    const sendsBefore = runtime.prompts.length
    const unadmitted = {messages: [...structuredClone(history), structuredClone(gate), falseRetry]}
    await hooks['experimental.chat.messages.transform']({sessionID: session}, unadmitted)
    assert.deepEqual(unadmitted.messages, [], 'copied metadata and an acceptance in another session cannot admit this exact key')
    assert.deepEqual(runtime.abortedIds, beforeAborts, 'a stale request must not repeat the completed cut interrupt against its active successor')
    assert.equal(runtime.prompts.length, sendsBefore, 'rejecting the unadmitted key must not send another continuation')
    assert.deepEqual(dispatch.projectionObservation(runtime.journal, session), activeBefore,
      'the active successor working identity and completion claims must remain unchanged')
    assert.deepEqual(recovery.journalExecutionStatus(runtime.journal, session, physical), {
      phase: 'ProviderStarted', disposition: null,
    })
  })
})

test('WHAT[relay-context-projection-002] a terminal successor cannot reenter the registered provider boundary through its retained acceptance record', async () => {
  await withSuccessor(async context => {
    const {hooks, runtime, session, history, gate} = context
    const retry = await admitRetry(context)
    const physical = messageId(retry)
    await hooks['chat.params']({sessionID: session, message: retry.info, agent: 'manager',
      model: {providerID: 'provider', id: 'manager-model', capabilities: {}}}, {})
    await hooks.event({event: {type: 'message.updated', properties: {info: {
      id: 'cancelled-successor-run', parentID: physical, sessionID: session, role: 'assistant',
      agent: 'manager', providerID: 'provider', modelID: 'manager-model', time: {created: 5, completed: 6},
      error: {name: 'MessageAbortedError', data: {message: 'operator interrupted'}},
    }}}})
    assert.deepEqual(recovery.journalExecutionStatus(runtime.journal, session, physical), {
      phase: 'Terminal', disposition: 'Cancelled',
    })
    const output = {messages: [...structuredClone(history), structuredClone(gate), structuredClone(retry)]}
    const before = structuredClone(output)
    const prompts = runtime.prompts.length
    await assert.rejects(async () => hooks['experimental.chat.messages.transform']({sessionID: session}, output),
      /no committed model-routing lease/)
    assert.deepEqual(output, before, 'the terminal request fails before any provider projection')
    assert.equal(runtime.prompts.length, prompts, 'a late terminal request does not dispatch a new successor')
  })
})
