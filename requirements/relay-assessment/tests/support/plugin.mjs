import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { withExecutablePlugin, acceptAuthorityRoot } from '../../../verification-system/tests/support/plugin-fixture.mjs'
import * as journal from '../../../../dist/Persistence/Journal/ObligationJournalSurface.js'

// A non-empty findings array is the only failing shape; an empty array passes.
export const findings = grade => grade === 'REVISE'
  ? { findings: [{ acceptance_criteria: 'the target state is not yet reached', work_plan: 'close the remaining gap' }] }
  : { findings: [] }
export const scores = findings
export const withReview = async body => withExecutablePlugin(async (hooks, directory, created, runtime) => {
  const session = `review-manager-${randomUUID()}`
  await acceptAuthorityRoot(runtime, session, 'manager', 'user-root')
  await hooks['chat.message']({sessionID: session, agent: 'manager'}, {
    message: {id: 'user-root', role: 'user', agent: 'manager', model: {providerID: 'provider', modelID: 'manager-model'}},
    parts: [{type: 'text', text: 'Deliver the requested behavior and verification.'}],
  })
  assert.equal((await journal.openIncumbency(runtime.journal, session, 'review-incumbent')).ok, true)
  runtime.pushHostMessage(session, {info: {id: 'user-root', role: 'user', sessionID: session, time: {created: 1}}, parts: [{type: 'text', text: 'Deliver the requested behavior and verification.'}]})
  let createdAt = 1
  const execute = async (input, {call = 'review-call', run = 'review-run', before = 'I independently inspected the current workspace.', after = 'after review'} = {}) => {
    runtime.pushHostMessage(session, {
      info: {id: run, role: 'assistant', sessionID: session, parentID: 'user-root', time: {created: ++createdAt}},
      parts: [
        {type: 'reasoning', text: 'private reasoning is not public evidence'},
        {type: 'text', text: before},
        {type: 'tool', tool: 'review', callID: call, state: {status: 'pending', input}},
        {type: 'text', text: after},
      ],
    })
    return hooks.tool.review.execute(input, {sessionID: session, callID: call, messageID: run, agent: 'manager'})
  }
  await body({hooks, directory, runtime, session, execute, created})
})
