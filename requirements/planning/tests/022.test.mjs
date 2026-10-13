import assert from 'node:assert/strict'
import test from 'node:test'
import * as surface from '../../../dist/Mission/Planning/Surface.js'
import { rolePredicate } from '../../../dist/OpenCode/Tools/ToolRegistrySurface.js'

const facts = { PlanEvents: surface.PlanEvents, PlanStage: surface.PlanStage }
const fold = { PlanFold: surface.PlanFold }

test('WHAT[planning-022] the review target is the next milestone derived from the current stage', () => {
  assert.ok(
    typeof surface.PlanningSurface.reviewTargetFor === 'function',
    'PlanningSurface must export reviewTargetFor (the plan backend derives its review target from the stage)',
  )

  // S1 reviews toward S2 (understanding & paths ready)
  assert.equal(surface.PlanningSurface.reviewTargetFor('S1'), 'S2')
  // S2 reviews toward S3 (procedure & pseudocode ready)
  assert.equal(surface.PlanningSurface.reviewTargetFor('S2'), 'S3')
  // S3 reviews toward becoming the final tenure (delivery authorization)
  assert.equal(surface.PlanningSurface.reviewTargetFor('S3'), 'authorized')
})

test('WHAT[planning-022] empty findings promote the tenure; non-empty findings keep it with the gaps returned', async () => {
  assert.ok(
    typeof surface.PlanningSurface.executeReview === 'function',
    'PlanningSurface must export executeReview (the shared review shell dispatches to the plan backend)',
  )

  let state = fold.PlanFold.initialWorkState
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.workOpened('work-22a', '/root'), state).state
  state = fold.PlanFold.applyWorkEventJs(
    facts.PlanEvents.incumbencyOpened('work-22a', 'inc-1', facts.PlanStage.S1, 0n),
    state,
  ).state

  const mockStore = {
    TryCurrent: (key) => (key === 'Plan' ? state : null),
    TryHead: () => null,
    Append: async (envs) => {
      for (const env of envs) {
        const decoded = surface.PlanningSurface.tryDecodeEnvelopeJson(JSON.stringify(env))
        if (decoded.ok) {
          state = fold.PlanFold.applyWorkEventJs(decoded.event, state).state
        }
      }
      return { tag: 0 }
    },
  }

  // Non-empty findings: the tenure stays and the gaps come back to the model
  const findings = [
    {
      acceptance_criteria: 'The tradeoff table covers storage engines',
      work_plan: 'Add a storage engine comparison to the plan',
    },
  ]
  const stayed = await surface.PlanningSurface.executeReview(mockStore, 'work-22a', 'inc-1', findings, null)
  assert.equal(stayed.ok, true)
  assert.equal(stayed.outcome, 'Stayed', 'non-empty findings must keep the tenure in place')
  assert.ok(Array.isArray(stayed.gaps) && stayed.gaps.length === 1, 'the gaps must be returned to the model')
  assert.equal(surface.PlanningSurface.activeStage(state), 'S1', 'a stayed review must not advance the stage')
  assert.ok(state.Reviewed != null, 'a PlanReviewed fact must be recorded')

  // The same incumbency cannot review a second time
  const second = await surface.PlanningSurface.executeReview(mockStore, 'work-22a', 'inc-1', [], null)
  assert.equal(second.ok, false, 'each incumbency has exactly one review')
  assert.match(second.error, /already|once|submitted/i)
})

test('WHAT[planning-022] a fresh tenure with empty findings is promoted', async () => {
  let state = fold.PlanFold.initialWorkState
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.workOpened('work-22b', '/root'), state).state
  state = fold.PlanFold.applyWorkEventJs(
    facts.PlanEvents.incumbencyOpened('work-22b', 'inc-1', facts.PlanStage.S1, 0n),
    state,
  ).state

  const mockStore = {
    TryCurrent: (key) => (key === 'Plan' ? state : null),
    TryHead: () => null,
    Append: async (envs) => {
      for (const env of envs) {
        const decoded = surface.PlanningSurface.tryDecodeEnvelopeJson(JSON.stringify(env))
        if (decoded.ok) {
          state = fold.PlanFold.applyWorkEventJs(decoded.event, state).state
        }
      }
      return { tag: 0 }
    },
  }

  const promoted = await surface.PlanningSurface.executeReview(mockStore, 'work-22b', 'inc-1', [], null)
  assert.equal(promoted.ok, true)
  assert.equal(promoted.outcome, 'Promoted', 'empty findings must promote the tenure')
  assert.equal(surface.PlanningSurface.activeStage(state), 'S2', 'the S1 tenure advances to S2')
})

test('WHAT[planning-022] ReviewShell admission admits both Manager (ReviewAssessment) and Plan (Review) roles', () => {
  assert.equal(rolePredicate('review', 'plan'), true, 'Plan role must be admitted to review via ToolPermission.Review')
  assert.equal(rolePredicate('review', 'manager'), true, 'Manager role must be admitted to review via ToolPermission.ReviewAssessment')
  for (const role of ['engineer', 'devops', 'orchestrator', 'blogger']) {
    assert.equal(rolePredicate('review', role), false, `${role} must be denied admission to review`)
  }
})
