import assert from 'node:assert/strict'
import test from 'node:test'
import * as ToolSurface from '../../../dist/OpenCode/Tools/ToolSurface.js'
import * as Strength from '../../../dist/Strength/Surface.js'

test('WHAT[planning-013] StaticTools and estimate contract explicitly recognize the four plan tools', () => {
  // WHAT[planning-013]: the plan toolset is { js-plan, ask, review, deliver }.
  const planTools = ['js-plan', 'ask', 'review', 'deliver']

  // ToolSurface exports toolSpecNames as an array of all recognized tool names
  const names = ToolSurface.toolSpecNames()
  assert.ok(Array.isArray(names), 'ToolSurface.toolSpecNames() must return an array')

  for (const tool of planTools) {
    assert.ok(names.includes(tool), `StaticTools.knownToolNames must explicitly include "${tool}"`)
  }

  // Retired plan tools must no longer be registered
  for (const retired of ['resume', 'handoff']) {
    assert.ok(
      !names.includes(retired),
      `StaticTools.knownToolNames must no longer include retired plan tool "${retired}"`,
    )
  }

  // Strength.classifyTool must explicitly classify plan tools
  assert.ok(typeof Strength.classifyTool === 'function', 'Strength.classifyTool must be a function')

  // All 4 plan tools are classified as NoEstimate
  for (const tool of planTools) {
    const policy = Strength.classifyTool(tool)
    assert.equal(policy, 'NoEstimate', `${tool} must be explicitly classified as NoEstimate`)
  }
})

test('WHAT[planning-013] tool registration does not allow prefix or wildcard matching for plan tools', () => {
  assert.ok(typeof Strength.classifyTool === 'function', 'Strength.classifyTool must be a function')

  // Prefix or wildcard attempts must be rejected or classified as Unreviewed
  // They must NEVER match EstimateAfterCall or NoEstimate
  const invalidAttempts = ['js-plan-fake', 'plan*', 'ask_question', 'review_next', 'deliver_final']
  for (const attempt of invalidAttempts) {
    const res = Strength.classifyTool(attempt)
    assert.equal(res, 'Unreviewed', `"${attempt}" must not match plan tool via prefix; must be Unreviewed`)
  }
})
