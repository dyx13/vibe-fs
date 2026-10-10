import assert from 'node:assert/strict'
import test from 'node:test'
import * as relay from '../../../dist/Mission/Relay/Surface.js'

const open = (state) => relay.openIncumbency(state, 'road-1', 'inc-1', 'snapshot-1', 'authority-1')

test('WHAT[relay-assessment-005] no-revise assessment projects assessment snapshot and authority into a certificate', () => {
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
  assert.equal(relay.view(assessed.state, 'road-1').phase, 'PerfectAwaitingRetirement')
  assert.deepEqual(relay.certificate(assessed.state, 'road-1'), {
    assessmentId: 'assessment-1',
    snapshotId: 'snapshot-1',
    authorityRevision: 'authority-1',
    valid: true,
  })
})

test('WHAT[relay-assessment-005] actual certificate binds every evidence field and immediately blocks workspace mutation', {todo: 'GAP-193: four exposed certificate fields do not prove full binding or actual mutation denial'})
