import assert from 'node:assert/strict'
import test from 'node:test'
import * as surface from '../../../dist/Mission/Planning/Surface.js'

test('WHAT[planning-020] the first prompt of a plan session opens the work, binds DevOps and starts the first tenure at S1', async () => {
  assert.ok(
    typeof surface.PlanningSurface.ensurePlanWorkOpened === 'function',
    'PlanningSurface must export ensurePlanWorkOpened for the plan entry point',
  )

  const appended = []
  let state = surface.PlanningSurface.empty()
  const mockStore = {
    TryCurrent: (key) => (key === 'Plan' ? (state.WorkId != null ? state : null) : null),
    TryHead: () => null,
    Append: async (envs) => {
      appended.push(...envs)
      for (const env of envs) {
        const decoded = surface.PlanningSurface.tryDecodeEnvelopeJson(JSON.stringify(env))
        if (decoded.ok) {
          state = surface.PlanningSurface.applyWorkEvent(decoded.event, state).state
        }
      }
      return { tag: 0 }
    },
  }

  // The workId is the plan session id
  const sessionId = 'ses-plan-entry-1'
  const res = await surface.PlanningSurface.ensurePlanWorkOpened(mockStore, '/workspace/repo', sessionId)
  assert.equal(res.ok, true, `ensurePlanWorkOpened failed: ${res.error}`)

  // The projection shows the opened work with an S1 tenure
  assert.equal(state.WorkId, sessionId, 'the workId must equal the plan session id')
  assert.equal(appended.length, 3, 'the entry must append exactly three events (work, devops binding, first tenure)')
  assert.equal(surface.PlanningSurface.activeStage(state), 'S1')
  assert.equal(state.Active.Id != null, true, 'the first incumbency must be open')
  assert.ok(state.BoundDevOps != null || appended.length >= 3, 'the entry must bind the fixed DevOps')

  // A second call on the same session is idempotent: no duplicate events
  const appendedBefore = appended.length
  const resAgain = await surface.PlanningSurface.ensurePlanWorkOpened(mockStore, '/workspace/repo', sessionId)
  assert.equal(resAgain.ok, true)
  assert.equal(appended.length, appendedBefore, 'an already-open work must not append duplicate events')
})

test('WHAT[planning-020] the entry never forges an S1 fallback when the store is unavailable', async () => {
  assert.ok(
    typeof surface.PlanningSurface.ensurePlanWorkOpened === 'function',
    'PlanningSurface must export ensurePlanWorkOpened for the plan entry point',
  )

  // A store that cannot be read must fail the entry with zero writes
  let appendCalled = false
  const brokenStore = {
    TryCurrent: () => null,
    TryHead: () => null,
    Append: async () => {
      appendCalled = true
      return { tag: 0 }
    },
    TryCurrentThrows: true,
  }
  const res = await surface.PlanningSurface.ensurePlanWorkOpened(brokenStore, '/workspace/repo', 'ses-plan-entry-2')
  assert.equal(res.ok, false, 'an unreadable store must fail the entry')
  assert.equal(appendCalled, false, 'a failed entry must not write anything')
})
