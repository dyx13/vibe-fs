import assert from 'node:assert/strict'
import test from 'node:test'
import * as relay from '../../../dist/Mission/Relay/Surface.js'

const noGaps = []

const open = (state, snapshot = 'snapshot-1') =>
  relay.openIncumbency(state, 'road-1', 'inc-1', snapshot, 'authority-1')

test('WHAT[relay-assessment-010] explicit invalidation blocks old certificate retirement and allows a new assessment iteration', () => {
  const opened = open(relay.empty(), 'snapshot-1')
  const assessed = relay.assess(
    opened.state,
    'road-1',
    'inc-1',
    'assessment-1',
    'snapshot-1',
    'authority-1',
    noGaps,
  )
  assert.equal(assessed.ok, true)
  assert.equal(relay.certificate(assessed.state, 'road-1').valid, true)

  const invalidated = relay.invalidateCertificate(assessed.state, 'road-1', 'WorkspaceChanged')
  assert.equal(invalidated.ok, true)
  assert.equal(relay.certificate(invalidated.state, 'road-1').valid, false)

  // Attempting to retire with old certificate on new snapshot or after invalidation must be rejected
  const acceptedOld = relay.retireAccepted(
    invalidated.state,
    'road-1',
    'inc-1',
    'ret-old',
    'run-1',
    'tool-1',
    'certificate:assessment-1',
    'snapshot-2',
  )
  assert.equal(acceptedOld.ok, false)

  // Retirement must continue to next iteration for fresh independent assessment on snapshot-2
  const retired = relay.retireContinue(
    invalidated.state,
    'road-1',
    'inc-1',
    'ret-cont',
    'run-1',
    'tool-1',
    'snapshot-2',
  )
  assert.equal(retired.ok, true)

  const nextOpened = relay.openIncumbency(retired.state, 'road-1', 'inc-2', 'snapshot-2', 'authority-1')
  assert.equal(nextOpened.ok, true)
  assert.equal(relay.view(nextOpened.state, 'road-1').phase, 'AuditPending')
})

test('WHAT[relay-assessment-010] actual DevOps workspace mutation invalidates previous verification and assessment evidence', {todo: 'GAP-193: manual invalidation does not start DevOps or observe a real workspace change'})
