import assert from 'node:assert/strict'
import test from 'node:test'
import * as surface from '../../../dist/Mission/Planning/Surface.js'

const facts = { PlanEvents: surface.PlanEvents, PlanStage: surface.PlanStage }
const fold = { PlanFold: surface.PlanFold }

// executeDeliver now requires explicit scalar bigint retirement evidence (no
// option-array wrappers). The relay opens its successor at the exact
// consumed-through retirement sequence, NOT +1.
test('WHAT[planning-007] deliver without authorization relays: retires Relayed and opens the next tenure at the same stage', async () => {
  let state = fold.PlanFold.initialWorkState

  // Setup an opened work and an S2 incumbency that has not been authorized.
  // The fold requires the first tenure to open at S1 (planning-020), so the
  // S2 tenure is reached the legal way: an in-place review promotion.
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.workOpened('work-h1', '/repo/root'), state).state
  state = fold.PlanFold.applyWorkEventJs(
    facts.PlanEvents.incumbencyOpened('work-h1', 'inc-1', facts.PlanStage.S1, 0n),
    state,
  ).state
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.reviewed('inc-1', 'S1', 'Promoted'), state).state

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

  // The spawn capability must never be invoked on the relay path
  let spawnCalls = 0
  const spawn = async () => {
    spawnCalls += 1
    throw new Error('spawn must not be called on the relay path')
  }

  // Unauthorized deliver in S2 -> relay (handoff is no longer an independent tool)
  const res1 = await surface.PlanningSurface.executeDeliver(
    mockStore,
    '/repo/root',
    'work-h1',
    'inc-1',
    false,
    spawn,
    10n, // explicit scalar bigint retirement evidence
  )

  assert.equal(res1.ok, true, `relay deliver failed: ${res1.error}`)
  assert.equal(res1.relayed, true, 'unauthorized deliver must take the relay path')
  assert.equal(res1.retiredIncumbencyId, 'inc-1')
  assert.equal(res1.retirementOutcome, 'Relayed')
  assert.ok(typeof res1.nextIncumbencyId === 'string' && res1.nextIncumbencyId.length > 0)
  assert.equal(spawnCalls, 0, 'relay must not spawn an execution session')

  // The next tenure keeps the stage of the retired tenure
  assert.equal(state.Active.Stage.name, 'S2', 'relay must keep the stage')
  assert.equal(surface.retiredCount(state), 1)
  assert.equal(surface.PlanningSurface.isDelivered(state), false, 'relay must not set Delivered')

  // A second relay keeps advancing tenures without ever advancing the stage
  const res2 = await surface.PlanningSurface.executeDeliver(
    mockStore,
    '/repo/root',
    'work-h1',
    state.Active.Id,
    false,
    spawn,
    20n,
  )
  assert.equal(res2.ok, true, `second relay failed: ${res2.error}`)
  assert.equal(res2.relayed, true)
  assert.equal(state.Active.Stage.name, 'S2')
  assert.equal(surface.retiredCount(state), 2)
})

test('WHAT[planning-007] relay is blocked by live resources or a wrong incumbency id', async () => {
  let state = fold.PlanFold.initialWorkState
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.workOpened('work-h2', '/repo/root'), state).state
  state = fold.PlanFold.applyWorkEventJs(
    facts.PlanEvents.incumbencyOpened('work-h2', 'inc-1', facts.PlanStage.S1, 0n),
    state,
  ).state

  const mockStore = {
    TryCurrent: (key) => (key === 'Plan' ? state : null),
    TryHead: () => null,
    Append: async () => ({ tag: 0 }),
  }

  const spawn = async () => {
    throw new Error('spawn must not be called')
  }

  // Blocker presence rejects the relay
  const resBlocked = await surface.PlanningSurface.executeDeliver(mockStore, '/repo/root', 'work-h2', 'inc-1', true, spawn, 10n)
  assert.equal(resBlocked.ok, false)
  assert.match(resBlocked.error, /blocked by live resources/i)

  // Wrong incumbency ID rejects the relay
  const resWrongId = await surface.PlanningSurface.executeDeliver(mockStore, '/repo/root', 'work-h2', 'wrong-inc', false, spawn, 10n)
  assert.equal(resWrongId.ok, false)
  assert.match(resWrongId.error, /does not match invocation target|unknown incumbency/i)
})

test('WHAT[planning-007] missing retirement evidence causes no spawn and no Plan writes', async () => {
  let state = fold.PlanFold.initialWorkState
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.workOpened('work-h3', '/repo/root'), state).state
  state = fold.PlanFold.applyWorkEventJs(
    facts.PlanEvents.incumbencyOpened('work-h3', 'inc-1', facts.PlanStage.S1, 0n),
    state,
  ).state

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
  let spawnCalls = 0
  const spawn = async () => {
    spawnCalls += 1
    return 'exec-never'
  }

  // No retirement evidence (undefined) must fail closed: no relay, no spawn,
  // no appended Plan events.
  const res = await surface.PlanningSurface.executeDeliver(
    mockStore, '/repo/root', 'work-h3', 'inc-1', false, spawn, undefined,
  )
  assert.equal(res.ok, false, 'deliver without retirement evidence must fail closed')
  assert.match(res.error, /retirement cursor evidence is required/i)
  assert.equal(spawnCalls, 0, 'no spawn may happen without retirement evidence')
  assert.equal(appended.length, 0, 'no Plan events may be written without retirement evidence')
})

test('WHAT[planning-007] the first successor cursor opens at the exact consumed-through retirement sequence, not +1', async () => {
  let state = fold.PlanFold.initialWorkState
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.workOpened('work-h4', '/repo/root'), state).state
  state = fold.PlanFold.applyWorkEventJs(
    facts.PlanEvents.incumbencyOpened('work-h4', 'inc-1', facts.PlanStage.S1, 0n),
    state,
  ).state

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

  const res = await surface.PlanningSurface.executeDeliver(
    mockStore, '/repo/root', 'work-h4', 'inc-1', false, async () => { throw new Error('no spawn') }, 10n,
  )
  assert.equal(res.ok, true)
  assert.equal(res.relayed, true)

  // The successor opens at the exact consumed-through retirement sequence
  // (10n), NOT +1: a relay opens AT the retirement cursor.
  assert.deepEqual(surface.latestRetirementRange(state), [0n, 10n], 'relay records the retired tenure range as LatestRetirement')
  assert.equal(surface.activeOpeningCursor(state), 10n, 'the successor must open at the retirement cursor')
})

test('WHAT[planning-007] continuous relay across a single work advances tenures at the same stage without spawning', async () => {
  // The full relay ladder: S1 -> review(Promoted) -> S2 -> relay -> S2 ->
  // relay. Each relay keeps the stage and never spawns an execution session.
  let state = fold.PlanFold.initialWorkState
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.workOpened('work-relay-ladder', '/root'), state).state
  state = fold.PlanFold.applyWorkEventJs(
    facts.PlanEvents.incumbencyOpened('work-relay-ladder', 'inc-1', facts.PlanStage.S1, 0n),
    state,
  ).state
  state = fold.PlanFold.applyWorkEventJs(facts.PlanEvents.reviewed('inc-1', 'S1', 'Promoted'), state).state

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
  const spawn = async () => {
    throw new Error('spawn must never run during a relay ladder')
  }

  let cursor = 0n
  let incumbencyId = 'inc-1'
  const relays = []
  for (let i = 0; i < 3; i += 1) {
    cursor += 10n
    const res = await surface.PlanningSurface.executeDeliver(mockStore, '/root', 'work-relay-ladder', incumbencyId, false, spawn, cursor)
    assert.equal(res.ok, true, `relay ${i} failed: ${res.error}`)
    assert.equal(res.relayed, true)
    assert.equal(res.retiredIncumbencyId, incumbencyId)
    assert.equal(state.Active.Stage.name, 'S2', 'relay never advances the stage')
    assert.equal(surface.activeOpeningCursor(state), cursor, 'successor opens at the exact retirement cursor')
    relays.push({ retired: incumbencyId, next: res.nextIncumbencyId, at: cursor })
    incumbencyId = res.nextIncumbencyId
  }

  assert.equal(surface.retiredCount(state), 3)
  assert.equal(surface.PlanningSurface.isDelivered(state), false)
  assert.equal(new Set(relays.map((r) => r.next)).size, 3, 'each relay must open a distinct successor')
})