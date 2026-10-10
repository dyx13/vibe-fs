import assert from 'node:assert/strict'
import test from 'node:test'
import * as relay from '../../../dist/Mission/Relay/Surface.js'

const gap = [{ acceptance_criteria: 'the target state is not yet reached', work_plan: 'close the remaining gap' }]

test('WHAT[relay-incumbency-011] explicit DevOps binding survives retirement and a new incumbent in the Road fold', () => {
  const first = relay.openIncumbency(relay.empty(), 'road-1', 'inc-1', 'snapshot-1', 'authority-1')
  const bound = relay.bindRoadDevOps(first.state, 'road-1', 'devops-session-1', 'provider/model')
  assert.equal(bound.ok, true)
  const assessed = relay.assess(bound.state, 'road-1', 'inc-1', 'assessment-1', 'snapshot-1', 'authority-1', gap)
  assert.equal(assessed.ok, true)
  const retired = relay.retireContinue(assessed.state, 'road-1', 'inc-1', 'ret-1', 'run-1', 'tool-1', 'snapshot-1')
  assert.equal(retired.ok, true)
  assert.equal(relay.roadDevOps(retired.state, 'road-1').incumbentId, null)
  const next = relay.openIncumbency(retired.state, 'road-1', 'inc-2', 'snapshot-2', 'authority-1')
  assert.equal(next.ok, true)
  assert.deepEqual(relay.roadDevOps(next.state, 'road-1'), {
    devopsId: 'devops-session-1', incumbentId: 'inc-2', modelTarget: 'provider/model',
  })
})

test('WHAT[relay-incumbency-011] actual in-flight assignments, processes and completion attribution survive Manager handover', {todo: 'GAP-192: no assignment or process is started by the Road fold fixture'})
