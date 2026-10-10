import assert from 'node:assert/strict'
import test from 'node:test'
import * as relay from '../../../dist/Mission/Relay/Surface.js'

const gap = [{ acceptance_criteria: 'the delivery still misses part of the target state', work_plan: 'close the remaining gap' }]

const open = (state, snapshot = 'snapshot-1') =>
  relay.openIncumbency(state, 'road-1', 'inc-1', snapshot, 'authority-1')

test('WHAT[relay-assessment-003] assessment fold rejects mismatched authority or incumbent', () => {
  const opened = open(relay.empty())
  assert.deepEqual(
    relay.assess(opened.state, 'road-1', 'inc-1', 'assessment-1', 'snapshot-1', 'authority-X', gap),
    { ok: false, error: 'AuthorityRevisionStale' },
  )
  assert.deepEqual(
    relay.assess(opened.state, 'road-1', 'inc-X', 'assessment-1', 'snapshot-1', 'authority-1', gap),
    { ok: false, error: 'IncumbencyNotActive' },
  )
})

test('WHAT[relay-assessment-003] actual assessment evidence digest includes only public text before the exact call', {todo: 'GAP-193: relay Surface supplies constant binding digests; actual narrative extraction and every identity axis require independent observations'})
