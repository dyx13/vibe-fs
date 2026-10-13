import assert from 'node:assert/strict'
import test from 'node:test'
import * as completedTurn from '../../../dist/Interaction/Repair/CompletedTurnSurface.js'

test('WHAT[planning-009] plan empty-stop needs no interaction repair: natural stop waits for the user prompt', () => {
  assert.ok(
    typeof completedTurn.needsInteractionRepair === 'function',
    'CompletedTurnSurface.needsInteractionRepair must be exported',
  )

  // A plan turn that finished with 'stop' and no usable formal text is an
  // empty stop. Plan is the only role allowed to stop empty and wait for the
  // next user prompt: no continuation, no repair.
  assert.equal(
    completedTurn.needsInteractionRepair('plan', true, 'stop', []),
    false,
    'plan empty-stop must not trigger continuation or repair',
  )
})

test('WHAT[planning-009] other roles keep their empty-stop repair behavior unchanged', () => {
  // The natural-stop exemption applies to plan only; an engineer empty stop
  // still requires interaction repair, byte-for-byte as before.
  assert.equal(
    completedTurn.needsInteractionRepair('engineer', true, 'stop', []),
    true,
    'engineer empty-stop must keep requiring interaction repair',
  )
  assert.equal(
    completedTurn.needsInteractionRepair('manager', true, 'stop', []),
    true,
    'manager empty-stop must keep requiring interaction repair',
  )
})

test('WHAT[planning-009] provider failures and length stops are not natural stops for plan', () => {
  // The plan exemption covers empty stops only. Provider errors and length
  // truncation follow the existing recovery paths for every role alike.
  for (const finish of ['error', 'length']) {
    const planNeeds = completedTurn.needsInteractionRepair('plan', true, finish, [])
    const engineerNeeds = completedTurn.needsInteractionRepair('engineer', true, finish, [])
    assert.equal(
      planNeeds,
      engineerNeeds,
      `finish=${finish}: plan must share the existing recovery classification with other roles`,
    )
  }
})
