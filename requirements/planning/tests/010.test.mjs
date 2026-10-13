import assert from 'node:assert/strict'
import test from 'node:test'
import * as surface from '../../../dist/Mission/Planning/Surface.js'

const facts = {
  PlanEvents: surface.PlanEvents,
  PlanStage: surface.PlanStage,
  PlanRetirementOutcome: surface.PlanRetirementOutcome,
}
const fold = { PlanFold: surface.PlanFold }

test('WHAT[planning-010] ask delegates the intent to the bound DevOps and returns its work record', async () => {
  let state = fold.PlanFold.initialWorkState
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.workOpened('work-ask-1', '/root'), state).state
  state = fold.PlanFold.applyWorkEventJs(
    facts.PlanEvents.incumbencyOpened('work-ask-1', 'inc-1', facts.PlanStage.S1, 0n),
    state,
  ).state

  const appended = []
  const mockStore = {
    TryCurrent: () => state,
    TryHead: () => null,
    Append: async (envs) => {
      appended.push(...envs)
      for (const env of envs) {
        const decoded = surface.PlanningSurface.tryDecodeEnvelopeJson(JSON.stringify(env))
        if (decoded.ok) {
          state = fold.PlanFold.applyWorkEventJs(decoded.event, state).state
        }
      }
      return { tag: 0 }
    },
  }

  let delegatedIntent = null
  const delegate = async (intent) => {
    delegatedIntent = intent
    return '# DevOps work record\nInvestigated build artifact paths; they match expectations.'
  }

  const res = await surface.PlanningSurface.executeAsk(mockStore, 'work-ask-1', 'Check whether build artifact paths match expectation', delegate)

  assert.equal(res.ok, true, `ask failed: ${res.error}`)
  assert.notEqual(res.kind, 'waiting_for_user', 'ask must not return a waiting-for-user suspension')
  assert.equal(delegatedIntent, 'Check whether build artifact paths match expectation')
  assert.equal(
    typeof res.workRecord === 'string' && res.workRecord.includes('DevOps work record'),
    true,
    'ask must return the DevOps work record verbatim (no model summarization)',
  )

  // An unbound work gets its DevOps binding persisted on first ask
  assert.ok(state.BoundDevOps != null, 'ask must bind the fixed DevOps when the work is unbound')

  // Empty intent is rejected
  const resEmpty = await surface.PlanningSurface.executeAsk(mockStore, 'work-ask-1', '   ', delegate)
  assert.equal(resEmpty.ok, false)
  assert.match(resEmpty.error, /cannot be empty/i)
})

test('WHAT[planning-010] a second ask is rejected while one delegation is pending', async () => {
  let state = fold.PlanFold.initialWorkState
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.workOpened('work-ask-2', '/root'), state).state
  state = fold.PlanFold.applyWorkEventJs(
    facts.PlanEvents.incumbencyOpened('work-ask-2', 'inc-1', facts.PlanStage.S1, 0n),
    state,
  ).state

  const mockStore = { TryCurrent: () => state }

  // The first delegation never resolves; it stays pending.
  const pendingDelegate = () => new Promise(() => {})

  surface.PlanningSurface.executeAsk(mockStore, 'work-ask-2', 'First investigation', pendingDelegate)
  const second = await surface.PlanningSurface.executeAsk(mockStore, 'work-ask-2', 'Second investigation', pendingDelegate)

  assert.equal(second.ok, false, 'a second ask must be rejected while a delegation is pending')
  assert.match(second.error, /pending|already/i)
})

test('WHAT[planning-010] ask is rejected after delivery until the work is reopened', async () => {
  let state = fold.PlanFold.initialWorkState
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.workOpened('work-ask-3', '/root'), state).state
  state = fold.PlanFold.applyWorkEventJs(
    facts.PlanEvents.incumbencyOpened('work-ask-3', 'inc-1', facts.PlanStage.S1, 0n),
    state,
  ).state
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.reviewed('inc-1', 'S1', 'Promoted'), state).state
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.incumbencyRetired('inc-1', 'Relayed', 10n), state).state
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.incumbencyOpened('work-ask-3', 'inc-2', facts.PlanStage.S2, 11n), state).state
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.reviewed('inc-2', 'S2', 'Promoted'), state).state
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.incumbencyRetired('inc-2', 'Relayed', 20n), state).state
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.incumbencyOpened('work-ask-3', 'inc-3', facts.PlanStage.S3, 21n), state).state
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.reviewed('inc-3', 'S3', 'Promoted'), state).state
  state = fold.PlanFold.applyWorkEventJs(
    facts.PlanEvents.incumbencyRetired('inc-3', facts.PlanRetirementOutcome.Delivered, 30n),
    state,
  ).state
  state = fold.PlanFold.applyWorkEventJs(
    facts.PlanEvents.delivered('inc-3', 'work-ask-3', 'sha256-hash', 'plan.md', 'exec-1'),
    state,
  ).state

  const mockStore = { TryCurrent: () => state }
  const delegate = async () => 'unused'

  const res = await surface.PlanningSurface.executeAsk(mockStore, 'work-ask-3', 'Any investigation?', delegate)
  assert.equal(res.ok, false)
  assert.match(res.error, /already been delivered/i)
})
