import assert from 'node:assert/strict'
import test from 'node:test'
import {withReview, scores} from '../../relay-assessment/tests/support/plugin.mjs'

test('WHAT[relay-retirement-003] an actual accepted unfinished Engineer child blocks retirement', async () => {
  await withReview(async ({execute, hooks, runtime, session}) => {
    assert.match(await execute(scores('REVISE')), /recorded = true/)
    const forked = await hooks.tool.fork.execute({calling: 'engineer', name: 'Ada', charge: 'Implement the requested behavior.'}, {sessionID: session, callID: 'fork-child', messageID: 'work-run', agent: 'manager'})
    assert.match(forked, /Ada/)
    assert.equal(runtime.prompts.length, 1)
    assert.match(await hooks.tool.suicide.execute({}, {sessionID: session, callID: 'confirm-retire', messageID: 'work-run', agent: 'manager'}), /confirmation_required = true/)
    const result = await hooks.tool.suicide.execute({}, {sessionID: session, callID: 'retire-with-child', messageID: 'work-run', agent: 'manager'})
    assert.match(result, /finished = false/)
    assert.match(result, /blocker_count = [1-9]/)
    assert.deepEqual(runtime.abortedIds, [])
  })
})

test('WHAT[relay-retirement-003] recursive descendants PTYs leases active tools and unobserved cancellation all block by current incumbent ownership', {todo: 'GAP-197: one actual Engineer child does not establish every ownership kind or recursive cancellation boundary'})
