import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import * as relay from '../../../dist/Mission/Relay/Surface.js'

const gap = [{ acceptance_criteria: 'the target state is not yet reached', work_plan: 'close the remaining gap' }]

const ROOT = new URL('../../..', import.meta.url).pathname
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

const open = (state, road = 'road-1', incumbent = 'inc-1') =>
  relay.openIncumbency(state, road, incumbent, 'snapshot-1', 'authority-1')

const assessAndContinue = (state, incumbent, snapshot = 'snapshot-1') => {
  const assessed = relay.assess(
    state,
    'road-1',
    incumbent,
    `assessment-${incumbent}`,
    snapshot,
    'authority-1',
    gap,
  )
  assert.equal(assessed.ok, true)
  return relay.retireContinue(
    assessed.state,
    'road-1',
    incumbent,
    `ret-${incumbent}`,
    `run-${incumbent}`,
    `tool-${incumbent}`,
    snapshot,
  )
}

test('WHAT[relay-incumbency-013] each successful opening advances the projected ordinal once', () => {
  const first = open(relay.empty())
  assert.equal(relay.view(first.state, 'road-1').iterationOrdinal, 1)

  const retired = assessAndContinue(first.state, 'inc-1')
  assert.equal(retired.ok, true)

  const second = relay.openIncumbency(retired.state, 'road-1', 'inc-2', 'snapshot-2', 'authority-1')
  assert.equal(second.ok, true)
  assert.equal(relay.view(second.state, 'road-1').iterationOrdinal, 2)

  const retiredAgain = assessAndContinue(second.state, 'inc-2', 'snapshot-2')
  assert.equal(retiredAgain.ok, true)
  const third = relay.openIncumbency(retiredAgain.state, 'road-1', 'inc-3', 'snapshot-3', 'authority-1')
  assert.equal(third.ok, true)
  assert.equal(relay.view(third.state, 'road-1').iterationOrdinal, 3)
})

test('WHAT[relay-incumbency-013] the ordinal counts durable openings, not provider requests', () => {
  // Replaying the same opening is idempotent and must not inflate the ordinal:
  // a Manager that is woken twice on one iteration is still that same iteration.
  const first = open(relay.empty())
  const replay = relay.openIncumbency(first.state, 'road-1', 'inc-1', 'snapshot-1', 'authority-1')
  assert.equal(replay.ok, true)
  assert.equal(relay.view(replay.state, 'road-1').iterationOrdinal, 1)

  // A road with no view at all is the first iteration.
  assert.equal(relay.view(relay.empty(), 'road-missing'), null)
})

test('WHAT[relay-incumbency-013] both assessment resource templates expose the ordinal substitution', () => {
  for (const locale of ['en.md', 'zh-CN.md']) {
    const rel = `resources/provider/runtime/manager-assess/${locale}`
    assert.ok(existsSync(join(ROOT, rel)), `${rel} must exist`)
    const text = read(rel)
    assert.match(text, /\{\{ordinal\}\}/, `${rel} must carry the {{ordinal}} placeholder`)
  }

})

test('WHAT[relay-incumbency-013] actual provider requests receive the committed ordinal and equivalent bilingual guidance', {todo: 'GAP-192: template placeholders and Road fold counts do not prove delivery or translation meaning'})
