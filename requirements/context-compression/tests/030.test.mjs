import assert from 'node:assert/strict'
import test from 'node:test'
import * as xwire from '../../../dist/Context/Prefix/XWireSurface.js'

test('WHAT[context-compression-030] every covered assume call and matching result survives LWR replacement unchanged', () => {
  const raw = [
    {
      info: { id: 'assume-call', role: 'assistant' },
      parts: [{ type: 'tool-call', tool: 'assume', callID: 'assume-1', args: { assumption: 'Use the monotone cutoff.' } }],
    },
    {
      info: { id: 'assume-result', role: 'tool' },
      parts: [{ type: 'tool-result', callID: 'assume-1', result: 'Committed.' }],
    },
    { info: { id: 'ordinary-covered', role: 'assistant' }, parts: [{ type: 'text', text: 'old prose' }] },
    { info: { id: 'live-user', role: 'user' }, parts: [{ type: 'text', text: 'continue' }] },
  ]

  const projected = xwire.replacePrefixByHostIds(
    raw,
    ['assume-call', 'assume-result', 'ordinary-covered'],
    null,
    'lwr-prefix',
    'compressed history',
  )

  assert.deepEqual(projected.map((message) => message.info.id), ['lwr-prefix', 'assume-call', 'assume-result', 'live-user'])
  assert.equal(projected[1], raw[0], 'assume call must remain the exact original Host object')
  assert.equal(projected[2], raw[1], 'assume result must remain the exact original Host object')
})

test('WHAT[context-compression-030] modern single-message assume tool parts survive while unrelated covered tools do not', () => {
  const raw = [
    {
      info: { id: 'assume-modern', role: 'assistant' },
      parts: [{
        type: 'tool',
        tool: 'assume',
        callID: 'assume-2',
        state: { status: 'completed', input: { assumption: 'Keep this exact call.' }, output: 'Committed.' },
      }],
    },
    {
      info: { id: 'read-modern', role: 'assistant' },
      parts: [{
        type: 'tool',
        tool: 'read',
        callID: 'read-1',
        state: { status: 'completed', input: { path: 'x' }, output: 'old' },
      }],
    },
    { info: { id: 'tail', role: 'user' }, parts: [{ type: 'text', text: 'tail' }] },
  ]

  const projected = xwire.replacePrefixByHostIds(
    raw,
    ['assume-modern', 'read-modern'],
    null,
    'lwr-prefix-2',
    'summary',
  )

  assert.deepEqual(projected.map((message) => message.info.id), ['lwr-prefix-2', 'assume-modern', 'tail'])
  assert.equal(projected[1], raw[0])
})

test('WHAT[context-compression-030] a covered physical message mixing an assume part with other parts survives whole', () => {
  const raw = [
    {
      info: { id: 'mixed-assume', role: 'assistant' },
      parts: [
        {
          type: 'tool',
          tool: 'assume',
          callID: 'assume-3',
          state: { status: 'completed', input: { assumption: 'Keep the whole message.' }, output: 'Committed.' },
        },
        { type: 'text', text: 'same physical message prose' },
      ],
    },
    {
      info: { id: 'ordinary-covered', role: 'assistant' },
      parts: [{ type: 'tool', tool: 'read', callID: 'read-9', state: { status: 'completed', input: { path: 'y' }, output: 'old' } }],
    },
    { info: { id: 'tail', role: 'user' }, parts: [{ type: 'text', text: 'tail' }] },
  ]

  const projected = xwire.replacePrefixByHostIds(
    raw,
    ['mixed-assume', 'ordinary-covered'],
    null,
    'lwr-prefix-3',
    'summary',
  )

  assert.deepEqual(projected.map((message) => message.info.id), ['lwr-prefix-3', 'mixed-assume', 'tail'])
  assert.equal(projected[1], raw[0], 'a message carrying an assume call must be kept whole, not split into parts')
})

test('WHAT[context-compression-030] assume preservation follows the call id across the coverage boundary in both directions', () => {
  const callOutside = [
    {
      info: { id: 'assume-call-open', role: 'assistant' },
      parts: [{ type: 'tool-call', tool: 'assume', callID: 'assume-cross-1', args: { assumption: 'The call message predates this cutoff.' } }],
    },
    {
      info: { id: 'assume-result-covered', role: 'tool' },
      parts: [{ type: 'tool-result', callID: 'assume-cross-1', result: 'Committed.' }],
    },
    { info: { id: 'ordinary-covered', role: 'assistant' }, parts: [{ type: 'text', text: 'old prose' }] },
    { info: { id: 'live-user', role: 'user' }, parts: [{ type: 'text', text: 'continue' }] },
  ]

  const coveredResult = xwire.replacePrefixByHostIds(
    callOutside,
    ['assume-result-covered', 'ordinary-covered'],
    null,
    'lwr-prefix-4',
    'compressed history',
  )

  assert.deepEqual(
    coveredResult.map((message) => message.info.id),
    ['lwr-prefix-4', 'assume-call-open', 'assume-result-covered', 'live-user'],
  )
  assert.equal(coveredResult[1], callOutside[0], 'an uncovered assume call must stay the exact original Host object')
  assert.equal(coveredResult[2], callOutside[1], 'a covered assume result must stay when its call message lies outside the covered set')

  const resultOutside = [
    {
      info: { id: 'assume-call-covered', role: 'assistant' },
      parts: [{ type: 'tool-call', tool: 'assume', callID: 'assume-cross-2', args: { assumption: 'The call message is inside this cutoff.' } }],
    },
    {
      info: { id: 'assume-result-open', role: 'tool' },
      parts: [{ type: 'tool-result', callID: 'assume-cross-2', result: 'Committed.' }],
    },
    { info: { id: 'ordinary-covered', role: 'assistant' }, parts: [{ type: 'text', text: 'old prose' }] },
    { info: { id: 'live-user', role: 'user' }, parts: [{ type: 'text', text: 'continue' }] },
  ]

  const coveredCall = xwire.replacePrefixByHostIds(
    resultOutside,
    ['assume-call-covered', 'ordinary-covered'],
    null,
    'lwr-prefix-5',
    'compressed history',
  )

  assert.deepEqual(
    coveredCall.map((message) => message.info.id),
    ['lwr-prefix-5', 'assume-call-covered', 'assume-result-open', 'live-user'],
  )
  assert.equal(coveredCall[1], resultOutside[0], 'a covered assume call must stay when its result message lies outside the covered set')
  assert.equal(coveredCall[2], resultOutside[1])
})

test('WHAT[context-compression-030] an assume call identified through the name field survives exactly like the tool field', () => {
  const raw = [
    {
      info: { id: 'assume-named-call', role: 'assistant' },
      parts: [{ kind: 'tool-call', name: 'assume', callId: 'assume-named-1', args: { assumption: 'The name field carries the tool identity.' } }],
    },
    {
      info: { id: 'assume-named-result', role: 'tool' },
      parts: [{ kind: 'tool-result', callId: 'assume-named-1', result: 'Committed.' }],
    },
    { info: { id: 'ordinary-covered', role: 'assistant' }, parts: [{ type: 'text', text: 'old prose' }] },
    { info: { id: 'live-user', role: 'user' }, parts: [{ type: 'text', text: 'continue' }] },
  ]

  const projected = xwire.replacePrefixByHostIds(
    raw,
    ['assume-named-call', 'assume-named-result', 'ordinary-covered'],
    null,
    'lwr-prefix-6',
    'compressed history',
  )

  assert.deepEqual(
    projected.map((message) => message.info.id),
    ['lwr-prefix-6', 'assume-named-call', 'assume-named-result', 'live-user'],
  )
  assert.equal(projected[1], raw[0], 'the name-field call must be recognized as the same assume tool')
  assert.equal(projected[2], raw[1], 'the matching result must be preserved through its callId')
})
