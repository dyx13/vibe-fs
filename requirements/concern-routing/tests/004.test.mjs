import assert from 'node:assert/strict'
import test from 'node:test'
import * as concern from '../../../dist/Interaction/Concern/Surface.js'

test('WHAT[concern-routing-004] pure prepare is non-consuming and successful placement updates coverage', () => {
  let state = concern.subscribe('owner-a', 'gen-1', 'build', 'build health', concern.empty()).state
  state = concern.publish('sender', 'msg-1', 'build', 'failure found', state).state

  const preparedA = concern.prepare('owner-a', state)
  const preparedB = concern.prepare('owner-a', state)
  assert.deepEqual(preparedA, preparedB, 'preparation from identical facts is stable and non-consuming')
  assert.deepEqual(preparedA.messages, [{ id: 'build', message: 'failure found' }])

  state = concern.place('owner-a', preparedA.announcedGenerations, preparedA.deliveredMessages, state).state
  assert.deepEqual(concern.prepare('owner-a', state).messages, [])
})

test('WHAT[concern-routing-004] invalid delivery rejects the entire placement including otherwise-valid announcement coverage', () => {
  let state = concern.subscribe('owner', 'generation', 'address', 'health', concern.empty()).state
  state = concern.publish('sender', 'message', 'address', 'evidence', state).state
  const pending = concern.prepare('owner', state)
  for (const [recipient, announcements, messages] of [
    ['owner', pending.announcedGenerations, ['message', 'missing']],
    ['other', pending.announcedGenerations, pending.deliveredMessages],
    ['owner', ['unknown-generation'], pending.deliveredMessages],
  ]) {
    const rejected = concern.place(recipient, announcements, messages, state)
    assert.equal(rejected.ok, false)
    assert.deepEqual(concern.prepare('owner', rejected.state), pending)
  }
})

test.todo('WHAT[concern-routing-004] actual plugin freezes an old Pair Hint and delivers new messages only in a later occurrence (integration rework pending)')
