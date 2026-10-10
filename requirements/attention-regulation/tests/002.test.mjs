import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { recordingPort, context, tools } from './support/attention-port.mjs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('WHAT[attention-regulation-002] the retired abandon tool is gone and its release semantics live in assume', () => {
  const fixture = recordingPort()
  // The retired tool is no longer registered: addressing it is a hard failure,
  // not a silent no-op. This proves the surface no longer advertises it.
  assert.throws(() => tools.execute(fixture.tools, 'abandon', { commitment: 'drop the speculative branch' }, context()))
  assert.equal(fixture.reads, 0)
  assert.deepEqual(fixture.appends, [])

  const assumeZh = read('../../../resources/provider/tool/assume/description/zh-CN.md')
  const assumeEn = read('../../../resources/provider/tool/assume/description/en.md')
  assert.match(assumeZh, /放下/)
  assert.match(assumeEn, /releasing a self-created plan/)
})
