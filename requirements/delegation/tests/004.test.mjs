import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import * as forkTool from '../../../dist/Execution/Delegation/Fork/OpenCode/ToolSurface.js'

const schemaNode = (kind, extra = {}) => ({
  kind,
  ...extra,
  describe: () => schemaNode(`${kind}-described`, extra),
  optional: () => schemaNode(`${kind}-optional`, extra),
  int: () => schemaNode(`${kind}-int`, extra),
  nonnegative: () => schemaNode(`${kind}-nonnegative`, extra),
})

const toolModule = {
  tool: {
    schema: {
      string: () => schemaNode('string'),
      number: () => schemaNode('number'),
      enum: (values) => schemaNode('enum', { values }),
      array: (inner) => schemaNode('array', { inner }),
    },
  },
}

const ownerDescriptor = (sessionId) => [{ sessionId, agent: 'orchestrator' }]

test('WHAT[delegation-004] COMMISSION_TOOL_blank_calling_derives_to_lead_like_an_explicit_lead', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wxs-commission-derive-'))
  const owner = 'orchestrator-commission-derive'
  const runtime = await forkTool.createRuntime(directory, ownerDescriptor(owner))

  try {
    const blanked = await forkTool.executeCommission(
      runtime,
      toolModule,
      owner,
      '',
      'RoadDerive',
      'COMMISSION-DERIVED-CALLING',
    )
    const explicit = await forkTool.executeCommission(
      runtime,
      toolModule,
      owner,
      'lead',
      'RoadDeriveLead',
      'COMMISSION-EXPLICIT-CALLING',
    )
    // Both reach the engine path: either the road opens (charge taken) or the
    // harness git boundary refuses it (road not opened). Neither may be
    // rejected as an unknown calling.
    for (const result of [blanked, explicit]) {
      assert.match(result, /\u5df2\u63a5\u4e0b|has taken your charge|\u65e0\u6cd5\u5f00\u8f9f|could not be opened/i)
      assert.doesNotMatch(result, /\u672a\u77e5|Unknown or unavailable calling/i)
    }
    assert.equal(blanked, explicit, 'a blank calling must behave exactly like an explicit lead')
  } finally {
    forkTool.disposeRuntime(runtime)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('WHAT[delegation-004] COMMISSION_TOOL_rejects_an_explicit_calling_that_conflicts_with_the_derivation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wxs-commission-conflict-'))
  const owner = 'orchestrator-commission-conflict'
  const runtime = await forkTool.createRuntime(directory, ownerDescriptor(owner))

  try {
    const conflict = await forkTool.executeCommission(
      runtime,
      toolModule,
      owner,
      'engineer',
      'RoadConflict',
      'COMMISSION-CALLING-CONFLICT',
    )
    assert.match(conflict, /\u672a\u77e5|Unknown or unavailable calling/i)
  } finally {
    forkTool.disposeRuntime(runtime)
    rmSync(directory, { recursive: true, force: true })
  }
})

test.todo('WHAT[delegation-004] the actual tool registry assigns distinct names to commission fork and resume and no name has conflicting contracts (GAP-153)')
