import assert from 'node:assert/strict'
import test from 'node:test'
import * as attention from '../../../dist/Interaction/Attention/Surface.js'

test('WHAT[attention-regulation-006] deferred projection stores natural-language work and consumes only named occurrences', () => {
  let state = attention.empty()
  state = attention.record('session-a', 'first', 'deadline tomorrow; priority high is ordinary text', state)
  state = attention.record('session-a', 'second', 'look later', state)
  state = attention.record('session-b', 'first', 'independent work', state)
  const after = attention.consume('session-a', ['first'], state)
  assert.deepEqual(attention.pending('session-a', after), [{ occurrence: 'second', text: 'look later' }])
  assert.deepEqual(attention.pending('session-b', after), [{ occurrence: 'first', text: 'independent work' }])
  assert.equal(attention.pending('session-a', state).length, 2)
  // Consuming an unknown occurrence is idempotent and never touches other entries.
  const idempotent = attention.consume('session-a', ['missing'], after)
  assert.deepEqual(attention.pending('session-a', idempotent), attention.pending('session-a', after))
})

test.todo('WHAT[attention-regulation-006] GAP-118 actual dependency and capability isolation exclude a hidden scheduler or cognitive workflow engine')
