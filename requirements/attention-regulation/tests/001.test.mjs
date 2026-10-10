import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { recordingPort, context, tools } from './support/attention-port.mjs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('WHAT[attention-regulation-001] the retired enough tool is gone and its sufficiency semantics live in assume', () => {
  const fixture = recordingPort()
  // The retired tool is no longer registered: addressing it is a hard failure,
  // not a silent no-op. This proves the surface no longer advertises it.
  assert.throws(() => tools.execute(fixture.tools, 'enough', { decision: 'use the existing result' }, context()))
  assert.equal(fixture.reads, 0)
  assert.deepEqual(fixture.appends, [])

  const assumeZh = read('../../../resources/provider/tool/assume/description/zh-CN.md')
  const assumeEn = read('../../../resources/provider/tool/assume/description/en.md')
  assert.match(assumeZh, /信息已足够/)
  assert.match(assumeEn, /information is sufficient/)
})

test.todo('WHAT[attention-regulation-001] GAP-118 review prompt meaning and actual participant behavior at materially new facts; no word scan proves cognitive stopping')
