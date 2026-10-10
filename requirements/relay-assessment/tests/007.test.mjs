import assert from 'node:assert/strict'
import test from 'node:test'
import * as relay from '../../../dist/Mission/Relay/Surface.js'

const open = (state, snapshot = 'snapshot-1') =>
  relay.openIncumbency(state, 'road-1', 'inc-1', snapshot, 'authority-1')

test('WHAT[relay-assessment-007] assessment fold accepts the supplied submission snapshot and exact replay', () => {
  const opened = open(relay.empty(), 'snapshot-2')
  const assessed = relay.assess(
    opened.state,
    'road-1',
    'inc-1',
    'assessment-new',
    'snapshot-latest',
    'authority-1',
    [],
  )
  assert.equal(assessed.ok, true)
  const valid = relay.assess(
    assessed.state,
    'road-1',
    'inc-1',
    'assessment-new',
    'snapshot-latest',
    'authority-1',
    [],
  )
  assert.equal(valid.ok, true)
})

const {withReview, scores: reviewScores} = await import('./support/plugin.mjs')

test('WHAT[relay-assessment-007] actual review tool accepts a valid call after malformed input', async () => {
  await withReview(async ({execute}) => {
    const malformed = await execute({ findings: [{ acceptance_criteria: 'target state' }] }, {call: 'malformed', run: 'malformed-run'})
    assert.match(malformed, /recorded = false/)
    const accepted = await execute(reviewScores('PERFECT'), {call: 'valid', run: 'valid-run'})
    assert.match(accepted, /recorded = true/)
  })
})
