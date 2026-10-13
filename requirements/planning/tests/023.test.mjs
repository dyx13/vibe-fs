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

test('WHAT[planning-023] the spawned execution session receives the plan artifact byte-for-byte and its id is recorded verbatim', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-spawn-test-'))

  try {
    const workId = 'work-23a'
    const content = '# Plan with tricky bytes\n\n- line with\ttab\n- 中文段落 🚀\n- trailing newline\n'

    const written = surface.PlanningSurface.rewritePlanAtomic(tmpRoot, workId, content)
    assert.equal(written.ok, true)

    let state = buildAuthorizedS3(workId)

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
      return 'exec-verbatim-42'
    }

    const res = await surface.PlanningSurface.executeDeliver(
      mockStore, tmpRoot, workId, 'inc-3', false, spawn, 30n,
    )

    assert.equal(res.ok, true)

    // The execution session is a manager receiving P in full, byte-for-byte
    assert.equal(spawnAgent, 'manager', 'the execution session must be a manager')
    assert.equal(spawnPrompt, content, 'the init prompt must be the exact plan artifact bytes (tabs, unicode, newlines)')

    // The execSessionId is recorded verbatim, not recomputed or wrapped
    assert.equal(res.execSessionId, 'exec-verbatim-42')
    assert.equal(state.Delivered.ExecSessionId, 'exec-verbatim-42')
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('WHAT[planning-023] a failed spawn writes zero events and keeps the tenure active', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-spawn-fail-'))

  try {
    const workId = 'work-23b'
    const written = surface.PlanningSurface.rewritePlanAtomic(tmpRoot, workId, '# Plan content')
    assert.equal(written.ok, true)

    let state = buildAuthorizedS3(workId)

    const appended = []
    const mockStore = {
      TryCurrent: (key) => (key === 'Plan' ? state : null),
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
    const failingSpawn = async () => {
      throw new Error('session spawn failed')
    }

    const res = await surface.PlanningSurface.executeDeliver(
      mockStore, tmpRoot, workId, 'inc-3', false, failingSpawn, 30n,
    )

    assert.equal(res.ok, false, 'a failed spawn must fail the delivery')
    assert.equal(appended.length, 0, 'no events may be appended when the spawn fails')
    assert.equal(state.Active != null ? state.Active.Id : undefined, 'inc-3', 'the tenure stays active')
    assert.equal(surface.PlanningSurface.isDelivered(state), false)
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }
})