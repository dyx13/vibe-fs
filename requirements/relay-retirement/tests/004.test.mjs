import assert from 'node:assert/strict'
import test from 'node:test'
import {withReview, scores} from '../../relay-assessment/tests/support/plugin.mjs'

test('WHAT[relay-retirement-004] actual cleanup-blocked retirement keeps new work admission frozen', async () => {
  await withReview(async ({execute, hooks, runtime, session, created}) => {
    assert.match(await execute(scores('REVISE')), /recorded = true/)
    const context = callID => ({sessionID: session, callID, messageID: 'work-run', agent: 'manager'})
    assert.match(await hooks.tool.fork.execute({calling: 'engineer', name: 'Ada', charge: 'Implement current work.'}, context('first-child')), /Ada/)
    assert.match(await hooks.tool.suicide.execute({}, context('confirm')), /confirmation_required = true/)
    assert.match(await hooks.tool.suicide.execute({}, context('retire')), /finished = false/)
    const count = runtime.prompts.length
    const children = created.length
    const denied = await hooks.tool.fork.execute({calling: 'engineer', name: 'Grace', charge: 'Start another work unit.'}, context('late-child'))
    assert.doesNotMatch(denied, /name = "Grace"/)
    assert.equal(runtime.prompts.length, count)
    assert.equal(created.length, children)
    assert.deepEqual(runtime.abortedIds, [])
  })
})

test('WHAT[relay-retirement-004] exact-incumbency freeze precedes recursive observation and never leaks into next incarnation of the same session', {todo: 'GAP-197: a sequential child blocker does not prove an admission race or same-session successor fence'})
