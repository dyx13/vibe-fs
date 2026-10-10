import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import * as enforcer from '../../../dist/Enforcer/Surface.js'
import { integrationTest } from '../../verification-system/tests/support/tier-gate.mjs'
import { withRulebookPackage } from './support/resource-package.mjs'

integrationTest('WHAT[behavior-diagnosis-005] both locale views preserve authored leaf bodies and share identities', () => {
  const english = enforcer.loadFor('en')
  const chinese = enforcer.loadFor('zh-CN')
  assert.deepEqual(chinese.map((rule) => rule.name), english.map((rule) => rule.name))
  for (const [locale, rules] of [['', english], ['.zh-CN', chinese]]) {
    for (const rule of rules) {
      for (const [leaf, field] of [['enforcer', 'enforcerText'], ['main', 'mainText']]) {
        const expected = readFileSync(new URL(`../../../resources/enforcer/${rule.name}/${leaf}${locale}.md`, import.meta.url), 'utf8').trim()
        assert.ok(expected.length > 0)
        assert.equal(rule[field], expected)
      }
    }
  }
})

integrationTest('WHAT[behavior-diagnosis-005] missing or blank Chinese leaves never fall back to valid English', async () => {
  await withRulebookPackage(async ({ rulebook, write, surface }) => {
    write('sample-rule', 'enforcer.md', 'English detection')
    write('sample-rule', 'main.md', 'English guidance')
    assert.equal(surface.rules().length, 1)
    assert.throws(() => surface.loadFor('zh-CN'), /enforcer.zh-CN.md/)
    write('sample-rule', 'enforcer.zh-CN.md', '检测正文')
    assert.throws(() => surface.loadFor('zh-CN'), /main.zh-CN.md/)
    write('sample-rule', 'main.zh-CN.md', ' \n')
    assert.throws(() => surface.loadFor('zh-CN'), /main.zh-CN.md empty/)
    write('sample-rule', 'main.zh-CN.md', '处置正文')
    assert.equal(surface.loadFor('zh-CN')[0].mainText, '处置正文')
    rmSync(join(rulebook, 'sample-rule/enforcer.zh-CN.md'))
    assert.throws(() => surface.loadFor('zh-CN'), /enforcer.zh-CN.md/)
  })
})
