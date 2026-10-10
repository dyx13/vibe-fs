import assert from 'node:assert/strict'
import test from 'node:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { integrationTest } from '../../verification-system/tests/support/tier-gate.mjs'
import { withRulebookPackage } from './support/resource-package.mjs'

// Stable causes as `tryRules` reports them. Each bad input below is asserted
// against one full code, never against a fragment of exception prose.
const RULEBOOK_EMPTY = 'enforcer rulebook empty'
const NON_KEBAB_DIRECTORY = 'enforcer rule directory name must be lower-kebab-case'
const RESOURCE_MISSING = 'package resource missing'
const ENFORCER_TEXT_EMPTY = 'enforcer.md empty'
const MAIN_TEXT_EMPTY = 'main.md empty'

integrationTest('WHAT[behavior-diagnosis-002] real resource loader refuses empty missing blank and invalid packaged rules', async () => {
  await withRulebookPackage(async ({ rulebook, write, surface }) => {
    const refuse = (badInput, error) => {
      const result = surface.tryRules()
      assert.equal(result.ok, false, `bad input ${badInput}: expected a refusal, got ${JSON.stringify(result)}`)
      assert.equal(result.error, error, `bad input ${badInput}: expected cause ${error}`)
    }

    refuse('empty rulebook directory', RULEBOOK_EMPTY)

    write('sample-rule', 'enforcer.md', 'Detection body')
    refuse('rule directory without main.md', RESOURCE_MISSING)

    write('sample-rule', 'main.md', '  \n')
    refuse('blank main.md body', MAIN_TEXT_EMPTY)

    write('sample-rule', 'main.md', 'Main body')
    const loaded = surface.rules()
    assert.ok(Array.isArray(loaded))
    const sameRulebook = surface.tryRules()
    assert.equal(sameRulebook.ok, true)
    assert.deepEqual(sameRulebook.value, loaded)
    assert.equal(loaded[0].name, 'sample-rule')

    write('sample-rule', 'enforcer.md', '\n\t')
    refuse('blank enforcer.md body', ENFORCER_TEXT_EMPTY)

    write('sample-rule', 'enforcer.md', 'Detection body')
    write('Invalid_Name', 'enforcer.md', 'Body')
    refuse('non lower-kebab-case rule directory name', NON_KEBAB_DIRECTORY)

    rmSync(join(rulebook, 'Invalid_Name'), { recursive: true })
    assert.equal(surface.rules().length, 1)

    rmSync(rulebook, { recursive: true })
    refuse('missing resources/enforcer root', RESOURCE_MISSING)

    assert.throws(() => surface.rules())
  })
})
