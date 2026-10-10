import assert from 'node:assert/strict'
import test from 'node:test'
import * as relay from '../../../dist/Mission/Relay/Surface.js'

const open = (state, road = 'road-1', incumbent = 'inc-1', snapshot = 'snapshot-1') =>
  relay.openIncumbency(state, road, incumbent, snapshot, 'authority-1')

const gap = [{ acceptance_criteria: 'the target state is not yet reached', work_plan: 'close the remaining gap' }]

test('WHAT[relay-incumbency-005] Road fold refuses to reopen or revise a retired incumbent', () => {
  const first = open(relay.empty())
  const assessed = relay.assess(
    first.state,
    'road-1',
    'inc-1',
    'assessment-1',
    'snapshot-1',
    'authority-1',
    gap,
  )
  assert.equal(assessed.ok, true)
  const retired = relay.retireContinue(assessed.state, 'road-1', 'inc-1', 'ret-1', 'run-1', 'tool-1', 'snapshot-1')
  assert.equal(retired.ok, true)

  const resurrected = relay.openIncumbency(retired.state, 'road-1', 'inc-1', 'snapshot-2', 'authority-1')
  assert.equal(resurrected.ok, false)

  const revised = relay.advanceAuthority(
    retired.state,
    'road-1',
    'inc-1',
    'authority-1',
    'authority-2',
    'physical-authority-2',
    'snapshot-2',
  )
  assert.equal(revised.ok, false)
})

test('WHAT[relay-incumbency-005] stale provider runs remain absorbed across multiple real handovers and recovery', {todo: 'GAP-192: retired-id rejection alone does not deliver late tool or terminal observations'})
