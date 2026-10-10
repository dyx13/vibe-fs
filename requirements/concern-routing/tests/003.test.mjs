import assert from 'node:assert/strict'
import test from 'node:test'
import * as concern from '../../../dist/Interaction/Concern/Surface.js'

test('WHAT[concern-routing-003] publish fails closed for unknown and stale generations instead of retargeting', () => {
  assert.equal(concern.publish('sender', 'msg-0', 'missing', 'x', concern.empty()).ok, false)

  let state = concern.subscribe('owner-a', 'gen-1', 'build', 'build health', concern.empty()).state
  state = concern.retire('owner-a', 'build', 'gen-1', state).state
  state = concern.subscribe('owner-b', 'gen-2', 'build', 'build health', state).state
  const stale = concern.applyPublishedClaim('sender', 'msg-1', 'build', 'gen-1', 'old generation', state)
  assert.equal(stale.ok, false)
})

test('WHAT[concern-routing-003] message projection distinguishes replay, conflicting material and distinct occurrences with identical text', () => {
  const subscribed = concern.subscribe('owner', 'generation', 'address', 'health', concern.empty()).state
  const first = concern.publish('sender', 'message-1', 'address', 'evidence', subscribed)
  assert.equal(first.ok, true)
  const replay = concern.applyPublishedClaim('sender', 'message-1', 'address', 'generation', 'evidence', first.state)
  assert.equal(replay.ok, true)
  assert.equal(concern.prepare('owner', replay.state).messages.length, 1)
  for (const [sender, id, generation, message] of [
    ['other', 'address', 'generation', 'evidence'],
    ['sender', 'different', 'generation', 'evidence'],
    ['sender', 'address', 'other-generation', 'evidence'],
    ['sender', 'address', 'generation', 'changed evidence'],
  ]) {
    const conflict = concern.applyPublishedClaim(sender, 'message-1', id, generation, message, first.state)
    assert.equal(conflict.ok, false)
    assert.deepEqual(concern.prepare('owner', conflict.state), concern.prepare('owner', first.state))
  }
  const second = concern.publish('sender', 'message-2', 'address', 'evidence', first.state)
  assert.equal(second.ok, true)
  assert.equal(concern.prepare('owner', second.state).messages.length, 2)
})

test.todo('WHAT[concern-routing-003] actual publish routes the reserved user address to a user-visible notification and copies to root (integration rework pending)')

test('WHAT[concern-routing-003] reserved user address has no live mailbox at projection level', () => {
  let state = concern.subscribe('root-owner', 'gen-root', 'root', 'user-facing session', concern.empty()).state
  const toUser = concern.publish('sender', 'msg-user', 'user', 'hello human', state)
  assert.equal(toUser.ok, false)
  assert.deepEqual(concern.prepare('root-owner', toUser.state), concern.prepare('root-owner', state))
})

test('WHAT[concern-routing-003] publish to root without a live mailbox is rejected with a diagnosis', () => {
  const before = concern.empty()
  const result = concern.publish('sender', 'msg-root', 'root', 'hello root', before)
  assert.equal(result.ok, false)
  assert.match(result.error, /no live mailbox/)
  assert.deepEqual(concern.prepare('sender', result.state), concern.prepare('sender', before))
})

test('WHAT[concern-routing-003] publish to a live root mailbox is accepted and routed only to the root owner', () => {
  let state = concern.subscribe('root-owner', 'gen-root', 'root', 'user-facing session', concern.empty()).state
  const result = concern.publish('sender', 'msg-copy', 'root', 'hello root', state)
  assert.equal(result.ok, true)
  assert.deepEqual(concern.prepare('root-owner', result.state).messages, [{ id: 'root', message: 'hello root' }])
  assert.deepEqual(concern.prepare('bystander', result.state).messages, [])
})
