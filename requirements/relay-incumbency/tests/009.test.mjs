import assert from 'node:assert/strict'
import test from 'node:test'
import * as relay from '../../../dist/Mission/Relay/Surface.js'

const open = (state) => relay.openIncumbency(state, 'road-1', 'inc-1', 'snapshot-1', 'authority-1')

const gap = [{ acceptance_criteria: 'the target state is not yet reached', work_plan: 'close the remaining gap' }]

test('WHAT[relay-incumbency-009] active authority update advances revision and snapshot exactly once', () => {
  const first = open(relay.empty())
  const workOwned = relay.assess(
    first.state,
    'road-1',
    'inc-1',
    'assessment-1',
    'snapshot-1',
    'authority-1',
    gap,
  )
  assert.equal(workOwned.ok, true)

  const revised = relay.advanceAuthority(
    workOwned.state,
    'road-1',
    'inc-1',
    'authority-1',
    'authority-2',
    'physical-authority-2',
    'snapshot-2',
  )
  assert.equal(revised.ok, true)
  assert.deepEqual(relay.authority(revised.state, 'road-1'), {
    roadRevision: 'authority-2',
    revisionHistory: ['authority-1', 'authority-2'],
    activeRevision: 'authority-2',
    activeSnapshot: 'snapshot-2',
    messageIds: ['authority-1', 'physical-authority-2'],
  })

  const replayed = relay.advanceAuthority(
    revised.state,
    'road-1',
    'inc-1',
    'authority-1',
    'authority-2',
    'physical-authority-2',
    'snapshot-2',
  )
  assert.equal(replayed.ok, true)
  assert.deepEqual(relay.authority(replayed.state, 'road-1'), relay.authority(revised.state, 'road-1'))

  const stale = relay.advanceAuthority(
    revised.state,
    'road-1',
    'inc-1',
    'authority-1',
    'authority-3',
    'physical-authority-3',
    'snapshot-3',
  )
  assert.equal(stale.ok, false)
  for (const [incumbent, previous, next, message, snapshot] of [
    ['inc-other', 'authority-2', 'authority-3', 'physical-authority-3', 'snapshot-3'],
    ['inc-1', 'authority-1', 'authority-2', 'conflicting-message', 'snapshot-2'],
    ['inc-1', 'authority-1', 'authority-2', 'physical-authority-2', 'conflicting-snapshot'],
  ]) {
    assert.equal(relay.advanceAuthority(revised.state, 'road-1', incumbent, previous, next, message, snapshot).ok, false)
  }
  assert.equal(relay.authority(revised.state, 'road-1').roadRevision, 'authority-2')
})
