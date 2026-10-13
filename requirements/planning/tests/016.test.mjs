import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import * as workspace from '../../../dist/OpenCode/Host/WorkspaceEventStoreSurface.js'
import * as surface from '../../../dist/Mission/Planning/Surface.js'

test('WHAT[planning-016] plan events canonical JSON encoding strictly orders keys by Unicode code point', () => {
  // 1. WorkOpened payload keys: ["root", "workId"]
  const ev1 = surface.workOpened('work-1', '/repo/root')
  const json1 = surface.encodeEventJson(ev1)
  const parsed1 = JSON.parse(json1)
  assert.deepEqual(Object.keys(parsed1), ['root', 'workId'])

  // 2. DevOpsBound payload keys: ["devopsId", "target", "workId"]
  const ev2 = surface.devOpsBound('work-1', 'devops-1', ['gpt-4o'])
  const json2 = surface.encodeEventJson(ev2)
  const parsed2 = JSON.parse(json2)
  assert.deepEqual(Object.keys(parsed2), ['devopsId', 'target', 'workId'])

  // 3. IncumbencyOpened payload keys: ["incumbencyId", "openingCursor", "stage", "workId"]
  const ev3 = surface.incumbencyOpened('work-1', 'inc-1', 'S1', 42n)
  const json3 = surface.encodeEventJson(ev3)
  const parsed3 = JSON.parse(json3)
  assert.deepEqual(Object.keys(parsed3), ['incumbencyId', 'openingCursor', 'stage', 'workId'])

  // 4. IncumbencyRetired payload keys: ["incumbencyId", "outcome", "retirementCursor"]
  const ev4 = surface.incumbencyRetired('inc-1', 'Relayed', 100n)
  const json4 = surface.encodeEventJson(ev4)
  const parsed4 = JSON.parse(json4)
  assert.deepEqual(Object.keys(parsed4), ['incumbencyId', 'outcome', 'retirementCursor'])

  // 5. Reviewed payload keys: ["incumbencyId", "outcome", "stage"]
  const ev5 = surface.reviewed('inc-1', 'S1', 'Promoted')
  const json5 = surface.encodeEventJson(ev5)
  const parsed5 = JSON.parse(json5)
  assert.deepEqual(Object.keys(parsed5), ['incumbencyId', 'outcome', 'stage'])

  // 6. Delivered payload keys: ["digest", "execSessionId", "incumbencyId", "path", "workId"]
  const ev6 = surface.delivered('inc-2', 'work-1', 'sha256-abc', 'plan.md', 'exec-session-9')
  const json6 = surface.encodeEventJson(ev6)
  const parsed6 = JSON.parse(json6)
  assert.deepEqual(Object.keys(parsed6), ['digest', 'execSessionId', 'incumbencyId', 'path', 'workId'])

  // 7. Reopened payload keys: ["incumbencyId"]
  const ev7 = surface.reopened('inc-2')
  const json7 = surface.encodeEventJson(ev7)
  const parsed7 = JSON.parse(json7)
  assert.deepEqual(Object.keys(parsed7), ['incumbencyId'])
})

test('WHAT[planning-016] canonical envelope round-trip preserves event semantics and int64 cursor precision', () => {
  const largeCursor = 9007199254740995n // Greater than Number.MAX_SAFE_INTEGER

  const evOpened = surface.incumbencyOpened('work-1', 'inc-1', 'S1', largeCursor)
  const envelopeJson = surface.toCanonicalEnvelopeJson('work-1', evOpened, ['parent-1'])
  assert.ok(envelopeJson.endsWith('\n'), 'canonical JSON line must end with LF')

  const decoded = surface.tryDecodeEnvelopeJson(envelopeJson)
  assert.equal(decoded.ok, true)
  assert.equal(decoded.workId, 'work-1')
  assert.equal(decoded.incumbencyId, 'inc-1')
  assert.equal(decoded.stage, 'S1')
  assert.equal(decoded.cursor, largeCursor)
})

test('WHAT[planning-016] Plan integration rule integrates envelopes and exports PlanWorkView', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wxs-planning-016-'))
  const commonDir = join(root, '.git')
  mkdirSync(commonDir, { recursive: true })

  try {
    const store = workspace.acquire(commonDir)

    // Construct a sequence for a full planning cycle under the new contract:
    // review promotes in place, relay swaps the tenure at the same stage.
    const ev1 = surface.workOpened('work-demo', '/workspace')
    const ev2 = surface.devOpsBound('work-demo', 'devops-fixed', null)
    const ev3 = surface.incumbencyOpened('work-demo', 'inc-1', 'S1', 0n)
    const ev4 = surface.reviewed('inc-1', 'S1', 'Promoted')
    const ev5 = surface.incumbencyRetired('inc-1', 'Relayed', 10n)
    const ev6 = surface.incumbencyOpened('work-demo', 'inc-2', 'S2', 11n)
    const ev7 = surface.reviewed('inc-2', 'S2', 'Promoted')
    const ev8 = surface.incumbencyRetired('inc-2', 'Relayed', 20n)
    const ev9 = surface.incumbencyOpened('work-demo', 'inc-3', 'S3', 21n)
    const ev10 = surface.reviewed('inc-3', 'S3', 'Promoted')
    const ev11 = surface.incumbencyRetired('inc-3', 'Delivered', 30n)
    const ev12 = surface.delivered('inc-3', 'work-demo', 'sha256-receipt', '/workspace/plan/work-demo/plan.md', 'exec-demo-1')

    const allEvents = [ev1, ev2, ev3, ev4, ev5, ev6, ev7, ev8, ev9, ev10, ev11, ev12]
    for (const ev of allEvents) {
      const res = await surface.append(store, 'work-demo', ev)
      assert.equal(res.ok, true, `append failed: ${res.error}`)
    }

    // Inspect projection view through PlanningSurface
    const viewObj = surface.getPlanWorkView(store, 'work-demo')
    assert.equal(viewObj.found, true)
    assert.equal(viewObj.view.WorkId, 'work-demo')
    assert.equal(viewObj.view.RetiredCount, 3)
    assert.equal(viewObj.view.Delivered, true)
    assert.equal(viewObj.view.DeliveryDigest, 'sha256-receipt')
    assert.equal(viewObj.view.BoundDevOpsId, 'devops-fixed')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('WHAT[planning-016] append pre-validation enforces fold laws and rejects rule violations before hitting store', async () => {
  // Mock store implementing IEventStore
  let appendCalled = false
  const mockStore = {
    TryCurrent: () => null,
    TryHead: () => null,
    Append: async () => {
      appendCalled = true
      return { tag: 0 }
    },
  }

  // Attempt to open the initial incumbency directly at S2 (violating the S1 start)
  const invalidEvent = surface.incumbencyOpened('work-mock', 'inc-1', 'S2', 0n)
  const res = await surface.append(mockStore, 'work-mock', invalidEvent)

  assert.equal(res.ok, false)
  assert.match(res.error, /Fold validation failed before append/)
  assert.equal(appendCalled, false, 'Store.Append must never be called when fold validation fails')
})
