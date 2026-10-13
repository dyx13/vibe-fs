import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import * as surface from '../../../dist/Mission/Planning/Surface.js'

const facts = {
  PlanEvents: surface.PlanEvents,
  PlanStage: surface.PlanStage,
}
const fold = { PlanFold: surface.PlanFold }

// Build the full ladder up to an authorized S3 tenure:
// review promotes in place, relay swaps the tenure at the same stage.
const buildAuthorizedS3 = (workId) => {
  let state = fold.PlanFold.initialWorkState
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.workOpened(workId, '/repo/root'), state).state
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.incumbencyOpened(workId, 'inc-1', facts.PlanStage.S1, 0n), state).state
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.reviewed('inc-1', 'S1', 'Promoted'), state).state
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.incumbencyRetired('inc-1', 'Relayed', 10n), state).state
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.incumbencyOpened(workId, 'inc-2', facts.PlanStage.S2, 10n), state).state
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.reviewed('inc-2', 'S2', 'Promoted'), state).state
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.incumbencyRetired('inc-2', 'Relayed', 20n), state).state
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.incumbencyOpened(workId, 'inc-3', facts.PlanStage.S3, 20n), state).state
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.reviewed('inc-3', 'S3', 'Promoted'), state).state
  return state
}

test('WHAT[planning-008] authorized deliver records PlanDelivered with execSessionId after spawning a manager session', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-deliver-test-'))

  try {
    const workId = 'work-d1'
    const content = '# Final Delivered Plan\n1. Step A\n2. Step B'

    // Write a valid plan artifact first
    const written = surface.PlanningSurface.rewritePlanAtomic(tmpRoot, workId, content)
    assert.equal(written.ok, true)

    let state = buildAuthorizedS3(workId)
    assert.equal(state.Active.Authorized, true, 'the ladder must produce an authorized S3 tenure')

    let spawnAgent = null
    let spawnPrompt = null
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
    const spawn = async (agent, prompt) => {
      spawnAgent = agent
      spawnPrompt = prompt
      return 'exec-session-d1'
    }

    const res = await surface.PlanningSurface.executeDeliver(
      mockStore,
      tmpRoot,
      workId,
      'inc-3',
      false,
      spawn,
      30n, // explicit scalar bigint retirement evidence
    )

    // The delivery receipt carries the execution session
    assert.equal(res.ok, true)
    assert.equal(res.relayed, false, 'authorized deliver must not relay')
    assert.equal(res.delivered, true)
    assert.equal(res.digest, written.digest)
    assert.ok(typeof res.path === 'string' && res.path.endsWith('plan.md'))
    assert.equal(res.execSessionId, 'exec-session-d1', 'deliver must return the spawned execution session id')

    // The spawned session is a parentless manager receiving P in full
    assert.equal(spawnAgent, 'manager')
    assert.equal(spawnPrompt, content, 'the execution session init prompt must be the full plan artifact')

    // State reflects delivered with the exec session recorded
    assert.equal(state.Active, undefined)
    assert.equal(surface.retiredCount(state), 3)
    assert.ok(state.Delivered != null)
    assert.equal(state.Delivered.Digest, written.digest)
    assert.equal(state.Delivered.ExecSessionId, 'exec-session-d1')
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('WHAT[planning-008] authorized deliver is rejected when the plan artifact is empty or the spawn fails', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-deliver-fail-'))

  try {
    // Authorized S3 tenure, but the plan artifact is missing on disk
    let stateMissing = buildAuthorizedS3('work-missing')

    const mockStoreMissing = {
      TryCurrent: () => stateMissing,
      TryHead: () => null,
      Append: async () => ({ tag: 0 }),
    }

    const resMissing = await surface.PlanningSurface.executeDeliver(
      mockStoreMissing, tmpRoot, 'work-missing', 'inc-3', false,
      async () => 'exec-never',
      30n,
    )
    assert.equal(resMissing.ok, false)
    assert.match(resMissing.error, /empty or missing|not found/i)

    // Spawn failure fails the whole delivery and keeps the tenure active
    const workId = 'work-d2'
    const written = surface.PlanningSurface.rewritePlanAtomic(tmpRoot, workId, '# Plan content')
    assert.equal(written.ok, true)

    let state2 = buildAuthorizedS3(workId)
    const mockStoreSpawnFail = {
      TryCurrent: () => state2,
      TryHead: () => null,
      Append: async (envs) => {
        for (const env of envs) {
          const decoded = surface.PlanningSurface.tryDecodeEnvelopeJson(JSON.stringify(env))
          if (decoded.ok) {
            state2 = fold.PlanFold.applyWorkEventJs(decoded.event, state2).state
          }
        }
        return { tag: 0 }
      },
    }
    const failingSpawn = async () => {
      throw new Error('session spawn failed')
    }

    const resSpawnFail = await surface.PlanningSurface.executeDeliver(
      mockStoreSpawnFail, tmpRoot, workId, 'inc-3', false,
      failingSpawn,
      30n,
    )
    assert.equal(resSpawnFail.ok, false, 'spawn failure must fail the delivery')
    assert.equal(state2.Active != null ? state2.Active.Id : undefined, 'inc-3', 'tenure must stay active after a failed delivery')
    assert.equal(surface.PlanningSurface.isDelivered(state2), false, 'no PlanDelivered may be recorded after a failed spawn')
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('WHAT[planning-008] authorized deliver without retirement evidence fails closed with no spawn', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-deliver-evidence-'))

  try {
    const workId = 'work-d3'
    const written = surface.PlanningSurface.rewritePlanAtomic(tmpRoot, workId, '# Plan content')
    assert.equal(written.ok, true)

    let state = buildAuthorizedS3(workId)
    const appended = []
    const mockStore = {
      TryCurrent: () => state,
      TryHead: () => null,
      Append: async (envs) => {
        appended.push(...envs)
        return { tag: 0 }
      },
    }
    let spawnCalls = 0
    const spawn = async () => {
      spawnCalls += 1
      return 'exec-never'
    }

    const res = await surface.PlanningSurface.executeDeliver(
      mockStore, tmpRoot, workId, 'inc-3', false, spawn, undefined,
    )
    assert.equal(res.ok, false, 'authorized deliver must also require retirement evidence')
    assert.match(res.error, /retirement cursor evidence is required/i)
    assert.equal(spawnCalls, 0, 'no manager spawn may occur without retirement evidence')
    assert.equal(appended.length, 0, 'no Plan events may be written without retirement evidence')
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }
})