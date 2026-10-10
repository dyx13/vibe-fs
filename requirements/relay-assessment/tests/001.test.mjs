import assert from 'node:assert/strict'
import test from 'node:test'
import * as assessment from '../../../dist/Mission/Relay/Assessment/Surface.js'

test('WHAT[relay-assessment-001] review schema requires a findings array of acceptance criteria and work plans with optional note', () => {
  const schema = JSON.parse(assessment.schemaJson)
  assert.equal(schema.type, 'object')
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(schema.required, ['findings'])
  assert.deepEqual(Object.keys(schema.properties).sort(), ['findings', 'note'])
  assert.equal(schema.properties.findings.type, 'array')
  assert.equal(schema.properties.findings.items.type, 'object')
  assert.equal(schema.properties.findings.items.additionalProperties, false)
  assert.deepEqual(schema.properties.findings.items.required.slice().sort(), ['acceptance_criteria', 'work_plan'])
  assert.deepEqual(Object.keys(schema.properties.findings.items.properties).sort(), ['acceptance_criteria', 'work_plan'])
  assert.deepEqual(schema.properties.findings.items.properties.acceptance_criteria, { type: 'string' })
  assert.deepEqual(schema.properties.findings.items.properties.work_plan, { type: 'string' })
  assert.deepEqual(schema.properties.note, { type: 'string' })
})

test('WHAT[relay-assessment-001] malformed findings are rejected without coercion', () => {
  for (const value of [10, 9.5, 'gap', null, undefined, false, {}, 'not-an-array']) {
    assert.equal(assessment.parse({ findings: value }).ok, false, String(value))
  }
  for (const payload of [
    {},
    { findings: [{ acceptance_criteria: 'target', work_plan: 'plan' }], verdict: 'PERFECT' },
    { findings: [{ acceptance_criteria: 'target' }] },
    { findings: [{ work_plan: 'plan' }] },
    { findings: [{ acceptance_criteria: 10, work_plan: 'plan' }] },
    { findings: [{ acceptance_criteria: 'target', work_plan: 10 }] },
    { findings: [{ acceptance_criteria: '', work_plan: 'plan' }] },
    { findings: [{ acceptance_criteria: 'target', work_plan: '   ' }] },
    { findings: 'not-an-array' },
    { findings: [], note: 123 },
    { findings: [], note: null },
  ]) {
    assert.equal(assessment.parse(payload).ok, false, JSON.stringify(payload))
  }
  for (const payload of [null, 10, 'PERFECT', [], false]) assert.equal(assessment.parse(payload).ok, false)
})

test('WHAT[relay-assessment-001] empty findings pass and non-empty findings preserve each gap', () => {
  const passed = assessment.parse({ findings: [] })
  assert.deepEqual(passed, { ok: true, findings: [], passed: true })

  const withGaps = assessment.parse({
    findings: [
      { acceptance_criteria: 'target A', work_plan: 'plan A' },
      { acceptance_criteria: 'target B', work_plan: 'plan B' },
    ],
  })
  assert.deepEqual(withGaps, {
    ok: true,
    findings: [
      { acceptance_criteria: 'target A', work_plan: 'plan A' },
      { acceptance_criteria: 'target B', work_plan: 'plan B' },
    ],
    passed: false,
  })

  // note is accepted for writing, never returned in the parsed result
  const withNote = assessment.parse({ findings: [], note: 'thorough inspection completed; no gaps observed.' })
  assert.deepEqual(withNote, { ok: true, findings: [], passed: true })
  assert.equal('note' in withNote, false)
})
