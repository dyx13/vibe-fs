import assert from 'node:assert/strict'
import test from 'node:test'
import * as attention from '../../../dist/Interaction/Attention/Surface.js'
import { recordingPort, context } from './support/attention-port.mjs'
import * as tools from '../../../dist/OpenCode/Tools/AttentionToolSurface.js'

test('WHAT[attention-regulation-004] actual port path deduplicates occurrence and does not resurrect consumed work', async () => {
  const fixture = recordingPort()
  for (let replay = 0; replay < 2; replay += 1) {
    await tools.execute(fixture.tools, 'defer', { new_work: 'one' }, context())
  }
  await tools.execute(fixture.tools, 'defer', { new_work: 'two' }, context('session-b'))
  assert.equal(fixture.appends.length, 2)
  assert.deepEqual(attention.pending('session-a', fixture.state), [{ occurrence: 'call-1', text: 'one' }])
  assert.deepEqual(attention.pending('session-b', fixture.state), [{ occurrence: 'call-1', text: 'two' }])
  fixture.state = attention.consume('session-a', ['call-1'], fixture.state)
  await tools.execute(fixture.tools, 'defer', { new_work: 'one' }, context())
  assert.equal(fixture.appends.length, 2)
  assert.deepEqual(attention.pending('session-a', fixture.state), [])
})

test('WHAT[attention-regulation-004] consumed occurrences stay consumed and do not resurface on replay', async () => {
  const fixture = recordingPort()
  await tools.execute(fixture.tools, 'defer', { new_work: 'OLD LIFE WORK' }, context())
  assert.deepEqual(attention.pending('session-a', fixture.state), [{ occurrence: 'call-1', text: 'OLD LIFE WORK' }])
  fixture.state = attention.consume('session-a', ['call-1'], fixture.state)
  assert.deepEqual(attention.pending('session-a', fixture.state), [])
  await tools.execute(fixture.tools, 'defer', { new_work: 'OLD LIFE WORK' }, context())
  assert.deepEqual(attention.pending('session-a', fixture.state), [])
})
