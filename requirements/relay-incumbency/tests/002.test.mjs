import assert from 'node:assert/strict'
import test from 'node:test'
import * as relay from '../../../dist/Mission/Relay/Surface.js'

const open = (state, road = 'road-1', incumbent = 'inc-1') =>
  relay.openIncumbency(state, road, incumbent, 'snapshot-1', 'authority-1')

const gap = [{ acceptance_criteria: 'the target state is not yet reached', work_plan: 'close the remaining gap' }]

test('WHAT[relay-incumbency-002] every iteration opens on the same AuditPending algebra', () => {
  const first = open(relay.empty())
  assert.deepEqual(relay.view(first.state, 'road-1'), {
    activeIncumbency: 'inc-1',
    iterationOrdinal: 1,
    phase: 'AuditPending',
    retired: [],
    retirementConfirmed: false,
  })

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
  const retired = relay.retireContinue(
    assessed.state,
    'road-1',
    'inc-1',
    'ret-1',
    'run-1',
    'tool-1',
    'snapshot-1',
  )
  assert.equal(retired.ok, true)

  const next = relay.openIncumbency(retired.state, 'road-1', 'inc-2', 'snapshot-2', 'authority-1')
  assert.equal(next.ok, true)
  assert.deepEqual(relay.view(next.state, 'road-1'), {
    activeIncumbency: 'inc-2',
    iterationOrdinal: 2,
    phase: 'AuditPending',
    retired: ['inc-1'],
    retirementConfirmed: false,
  })
})

test('WHAT[relay-incumbency-002] repeat-round has same meaning, assessment replay is idempotent, conflicting-snapshot assessment fails', () => {
  const first = open(relay.empty())
  const assessed = relay.assess(
    first.state,
    'road-1',
    'inc-1',
    'assessment-1',
    'snapshot-1',
    'authority-1',
    [],
  )
  assert.equal(assessed.ok, true)

  // Assessment replay with exact same binding/findings is idempotent (Ok)
  const replay = relay.assess(
    assessed.state,
    'road-1',
    'inc-1',
    'assessment-1',
    'snapshot-1',
    'authority-1',
    [],
  )
  assert.equal(replay.ok, true)

  // Conflicting snapshot assessment fails
  const conflict = relay.assess(
    assessed.state,
    'road-1',
    'inc-1',
    'assessment-conflict',
    'snapshot-stale',
    'authority-1',
    [],
  )
  assert.equal(conflict.ok, false)

  // Old authority advancement fails
  const staleAuth = relay.advanceAuthority(
    first.state, 'road-1', 'inc-1', 'authority-old', 'authority-new', 'phys-auth', 'snapshot-1'
  )
  assert.equal(staleAuth.ok, false)
})
