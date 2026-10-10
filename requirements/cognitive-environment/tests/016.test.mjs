import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const zh = read('../../../resources/provider/host/pair-programming-guideline/zh-CN.md')
const en = read('../../../resources/provider/host/pair-programming-guideline/en.md')
const assume = read('../../../resources/provider/tool/assume/description/zh-CN.md')

test('WHAT[cognitive-environment-016] Pair Hint leaves micro-primitive behaviour to the tool resources, except the standing defer encouragement', () => {
  assert.doesNotMatch(zh, /jq|canvas|画板 schema|update, todos|assume|todowrite|retainCheckpoints/)
  assert.doesNotMatch(en, /jq|canvas|update, todos|assume|todowrite|retainCheckpoints/)
  assert.match(zh, /defer/)
  assert.match(en, /defer/)
  assert.match(assume, /不是求证/)
  assert.match(assume, /执行并验证/)
})
