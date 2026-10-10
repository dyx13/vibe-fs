import assert from 'node:assert/strict'
import test from 'node:test'
import * as relay from '../../../dist/Mission/Relay/Surface.js'

const open = (state) => relay.openIncumbency(state, 'road-1', 'inc-1', 'snapshot-1', 'authority-1')

const gap = [{ acceptance_criteria: 'the target state is not yet reached', work_plan: 'close the remaining gap' }]

test('WHAT[relay-assessment-006] perfect assessment fold rejects a second semantic assessment', () => {
  const opened = open(relay.empty())
  const assessed = relay.assess(
    opened.state,
    'road-1',
    'inc-1',
    'assessment-1',
    'snapshot-1',
    'authority-1',
    [],
  )
  assert.equal(assessed.ok, true)
  assert.deepEqual(
    relay.assess(
      assessed.state,
      'road-1',
      'inc-1',
      'assessment-2',
      'snapshot-1',
      'authority-1',
      [],
    ),
    { ok: false, error: 'AssessmentAlreadySubmitted' },
  )

  // Even with different/revise scores, duplicate review in same incumbency is rejected
  assert.deepEqual(
    relay.assess(
      assessed.state,
      'road-1',
      'inc-1',
      'assessment-3',
      'snapshot-1',
      'authority-1',
      gap,
    ),
    { ok: false, error: 'AssessmentAlreadySubmitted' },
  )
})

const {withReview, scores} = await import('./support/plugin.mjs')

test('WHAT[relay-assessment-006] actual accepted revise assessment removes permission for a new review call', async () => {
  await withReview(async ({execute}) => {
    assert.match(await execute(scores('REVISE')), /recorded = true/)
    assert.doesNotMatch(await execute(scores('PERFECT'), {call: 'second-review', run: 'second-run'}), /recorded = true/)
  })
})
