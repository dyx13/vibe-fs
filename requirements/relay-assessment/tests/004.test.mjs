import assert from 'node:assert/strict'
import test from 'node:test'
import * as relay from '../../../dist/Mission/Relay/Surface.js'

const gap = [{ acceptance_criteria: 'the delivery still misses part of the target state', work_plan: 'close the remaining gap' }]

const open = (state, snapshot = 'snapshot-1') =>
  relay.openIncumbency(state, 'road-1', 'inc-1', snapshot, 'authority-1')

test('WHAT[relay-assessment-004] revise assessment fold enters WorkOwned without a certificate', () => {
  const opened = open(relay.empty())
  const assessed = relay.assess(opened.state, 'road-1', 'inc-1', 'assessment-1', 'snapshot-1', 'authority-1', gap)
  assert.equal(assessed.ok, true)
  assert.deepEqual(relay.view(assessed.state, 'road-1'), {
    activeIncumbency: 'inc-1',
    iterationOrdinal: 1,
    phase: 'WorkOwned',
    retired: [],
    retirementConfirmed: false,
  })
  assert.equal(relay.certificate(assessed.state, 'road-1'), null)
})
