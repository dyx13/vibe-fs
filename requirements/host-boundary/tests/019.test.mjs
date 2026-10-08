import assert from 'node:assert/strict'
import test from 'node:test'
import { ordinaryEffects } from '../../../dist/OpenCode/Host/PluginTransformSurface.js'

test('WHAT[host-boundary-019] a tentative prefix suppresses historical auxiliaries within the actual transform', async () => {
  const current = await ordinaryEffects(false, false)
  const tentative = await ordinaryEffects(true, false)
  const historical = ['pair', 'grounding', 'delegation']
  assert.deepEqual(current.filter((effect) => historical.includes(effect)), historical)
  assert.deepEqual(tentative, current.filter((effect) => !historical.includes(effect)))
  assert.ok(tentative.includes('capture'), 'prefix gating must not bypass current trace capture')
  assert.ok(tentative.includes('freeze-plan'), 'the current attempt still needs its frozen plan')
  assert.equal(tentative.at(-1), 'sanitize')
})

test('WHAT[host-boundary-019] ordinary transform runs companion and prefix compression without suppression', async () => {
  const current = await ordinaryEffects(false, false)
  assert.ok(current.includes('companion'), 'ordinary material must execute companion to trigger blogger')
  assert.ok(current.includes('prefix'), 'ordinary material must execute XWire to apply prefix compression')
  const companionIndex = current.indexOf('companion')
  const prefixIndex = current.indexOf('prefix')
  assert.ok(companionIndex < prefixIndex, 'companion runs before prefix compression')
})
test.todo('WHAT[host-boundary-019] every required Host capability needs a real supported-Host canary; injected transform ports prove only composition')
