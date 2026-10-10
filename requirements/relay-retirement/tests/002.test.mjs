import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import test from 'node:test'
import {withReview, scores} from '../../relay-assessment/tests/support/plugin.mjs'

const suicide = ({hooks, session}, call) => hooks.tool.suicide.execute({}, {sessionID: session, callID: call, messageID: 'retirement-run', agent: 'manager'})

test('WHAT[relay-retirement-002] actual suicide confirms once then permits assessed REVISE with a dirty workspace', async () => {
  await withReview(async fixture => {
    const before = await suicide(fixture, 'before-assessment')
    assert.match(before, /finished = false/)
    assert.match(before, /assessment_required = true/)
    assert.match(await fixture.execute(scores('REVISE')), /recorded = true/)
    writeFileSync(join(fixture.directory, 'still-unfinished.txt'), 'Unfinished dirty work remains.\n')
    const confirmation = await suicide(fixture, 'confirm-assessment')
    assert.match(confirmation, /finished = false/)
    assert.match(confirmation, /confirmation_required = true/)
    assert.match(await suicide(fixture, 'after-assessment'), /finished = true/)
    assert.deepEqual(fixture.runtime.abortedIds, [])
  })
})

test('WHAT[relay-retirement-002] unmerged changes failed tests and open obligations do not independently block actual retirement', {todo: 'GAP-197: actual assessed dirty-workspace path is covered; remaining conditions require actual owned fixtures'})
