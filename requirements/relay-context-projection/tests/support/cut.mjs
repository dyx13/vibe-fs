import assert from 'node:assert/strict'
import * as projection from '../../../../dist/Mission/Relay/ProjectionSurface.js'
import {withReview, scores} from '../../../relay-assessment/tests/support/plugin.mjs'

export const textMessage = (id, role, text) => ({info: {id, role}, parts: [{type: 'text', text}]})
export const toolMessage = (id = 'retirement-run', call = 'suicide-call') => ({
  info: {id, role: 'assistant'},
  parts: [{type: 'tool', tool: 'suicide', callID: call, state: {status: 'completed', input: {}, output: 'finished = true'}}],
})
export const messageId = message => message.id ?? message.info?.id

export const withSuccessor = async body => withReview(async context => {
  const {execute, hooks, runtime, session} = context
  assert.match(await execute(scores('REVISE')), /recorded = true/)
  const retirement = toolMessage()
  retirement.info.sessionID = session
  retirement.info.parentID = 'user-root'
  retirement.info.time = {created: 3}
  runtime.pushHostMessage(session, retirement)
  assert.match(await hooks.tool.suicide.execute({}, {
    sessionID: session, callID: 'suicide-confirm', messageID: 'retirement-confirm', agent: 'manager',
  }), /confirmation_required = true/)
  assert.match(await hooks.tool.suicide.execute({}, {
    sessionID: session, callID: 'suicide-call', messageID: 'retirement-run', agent: 'manager',
  }), /finished = true/)
  assert.deepEqual(runtime.abortedIds, [])
  const history = structuredClone(runtime.messages)
  history[0].info.model = {providerID: 'provider', modelID: 'manager-model'}
  const stale = {messages: structuredClone(history)}
  await hooks['experimental.chat.messages.transform']({sessionID: session}, stale)
  assert.deepEqual(stale.messages, [])
  assert.deepEqual(runtime.abortedIds, [session])
  assert.equal(runtime.prompts.length, 1)
  const gate = structuredClone(runtime.messages.at(-1))
  assert.ok(gate.metadata?.wanxiangshu_prompt_key, 'successor must be the real owner-dispatched prompt')
  assert.ok(messageId(gate))
  runtime.pushHostMessage(session, {
    info: {
      id: 'successor-provider-run', role: 'assistant', sessionID: session,
      parentID: messageId(gate), time: {created: 4},
    },
    parts: [],
  })
  const apply = (messages, acceptedHuman = false) => projection.apply(runtime.journal, session, acceptedHuman, messages)
  await body({...context, history, gate, apply})
})
