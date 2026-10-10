import assert from 'node:assert/strict'
import test from 'node:test'
import * as enforcer from '../../../dist/Enforcer/Surface.js'

const comment = (text) => text.trim().split('\n').map((line) => line === '' ? '#' : `# ${line}`).join('\n')

for (const locale of ['en', 'zh-CN']) {
  test(`WHAT[behavior-diagnosis-004] ${locale} prompt preserves every full detection body in lexical order`, () => {
    const base = 'BASE: original instruction'
    const composed = enforcer.composeBloggerSystemPrompt(base, locale)
    assert.ok(composed.includes(comment(base)))
    let previous = composed.indexOf(comment(base))
    for (const rule of enforcer.loadFor(locale)) {
      const segment = `${comment(rule.name)}\n${comment(rule.enforcerText)}`
      const position = composed.indexOf(segment)
      assert.ok(position > previous, `missing or reordered ${rule.name}`)
      assert.equal(composed.indexOf(segment, position + 1), -1)
      previous = position
    }
    assert.equal(enforcer.composeBloggerSystemPrompt(base, locale), composed)
    assert.notEqual(enforcer.composeBloggerSystemPrompt('DIFFERENT BASE', locale), composed)
  })
}
