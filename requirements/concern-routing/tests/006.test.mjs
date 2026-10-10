import assert from 'node:assert/strict'
import test from 'node:test'
import * as concern from '../../../dist/Interaction/Concern/Surface.js'

test('WHAT[concern-routing-006] retirement prevents old messages crossing into a same-concern replacement generation', () => {
  let state = concern.subscribe('owner-a', 'gen-1', 'build', 'build health', concern.empty()).state
  state = concern.publish('sender', 'msg-old', 'build', 'old message', state).state
  const oldBatch = concern.prepare('owner-a', state)
  state = concern.retire('owner-a', 'build', 'gen-1', state).state
  assert.equal(concern.publish('sender', 'after-retirement', 'build', 'too late', state).ok, false)
  assert.equal(concern.subscribe('owner-b', 'gen-2', 'build', 'changed meaning', state).ok, false)
  const rebound = concern.subscribe('owner-b', 'gen-2', 'build', 'build health', state)
  assert.equal(rebound.ok, true)
  assert.equal(rebound.appended, true)
  state = rebound.state
  assert.deepEqual(concern.prepare('owner-b', state).messages, [])
  assert.deepEqual(concern.prepare('owner-b', state).announcements, [{ id: 'build', concern: 'build health' }])
  assert.equal(concern.place('owner-a', oldBatch.announcedGenerations, oldBatch.deliveredMessages, state).ok, false)
  state = concern.applySubscribedClaim('owner-a', 'gen-1', 'build', 'build health', state).state
  const fresh = concern.publish('sender', 'msg-new', 'build', 'new generation', state)
  assert.equal(fresh.ok, true)
  assert.deepEqual(concern.prepare('owner-a', fresh.state).messages, [])
  assert.deepEqual(concern.prepare('owner-b', fresh.state).messages, [{ id: 'build', message: 'new generation' }])
})

test.todo('WHAT[concern-routing-006] opening an owner incumbency preserves its already subscribed mailbox (integration rework pending)')
test.todo('WHAT[concern-routing-006] the committed LifeCompleted Surface retires only its owner mailbox before returning (integration rework pending)')
