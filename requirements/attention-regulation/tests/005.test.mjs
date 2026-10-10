import assert from 'node:assert/strict'
import test from 'node:test'
import * as attention from '../../../dist/Interaction/Attention/Surface.js'
import { recordingPort, context } from './support/attention-port.mjs'
import * as tools from '../../../dist/OpenCode/Tools/AttentionToolSurface.js'
import { withReview, findings } from '../../relay-assessment/tests/support/plugin.mjs'
import { factPayloads } from '../../verification-system/tests/e2e/support/journal-observer.js'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as journal from '../../../dist/Persistence/Journal/Surface.js'
import { withAppendRefusal } from '../../../dist/Verification/JournalPortObservationSurface.js'

const pendingOf = (fixture, session) => attention.pending(session, fixture.state)

test('WHAT[attention-regulation-005] the consumption projection suppresses replayed Manager work', async () => {
  const fixture = recordingPort()
  await tools.execute(fixture.tools, 'defer', { new_work: 'first' }, context('session-manager', 'call-m1'))
  await tools.execute(fixture.tools, 'defer', { new_work: 'second' }, context('session-manager', 'call-m2'))
  assert.deepEqual(pendingOf(fixture, 'session-manager'), [
    { occurrence: 'call-m1', text: 'first' },
    { occurrence: 'call-m2', text: 'second' },
  ])
  fixture.state = attention.consume('session-manager', ['call-m1', 'call-m2'], fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-manager'), [])
  // Replaying the same records (a journal rebuild) cannot resurrect them.
  fixture.state = attention.record('session-manager', 'call-m1', 'first', fixture.state)
  fixture.state = attention.record('session-manager', 'call-m2', 'second', fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-manager'), [])
  // Consuming the same ids again is idempotent.
  fixture.state = attention.consume('session-manager', ['call-m1', 'call-m2'], fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-manager'), [])
})

test('WHAT[attention-regulation-005] the consumption projection suppresses replayed Engineer work', async () => {
  const fixture = recordingPort()
  await tools.execute(fixture.tools, 'defer', { new_work: 'follow up' }, context('session-engineer', 'call-e1'))
  const work = pendingOf(fixture, 'session-engineer').map((item) => item.occurrence)
  fixture.state = attention.consume('session-engineer', work, fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-engineer'), [])
  // The projection remains empty on a repeated observation.
  assert.deepEqual(pendingOf(fixture, 'session-engineer'), [])
  // Replaying the record after the receipt stays suppressed.
  fixture.state = attention.record('session-engineer', 'call-e1', 'follow up', fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-engineer'), [])
})

test('WHAT[attention-regulation-005] the consumption projection suppresses replayed Orchestrator work', async () => {
  const fixture = recordingPort()
  await tools.execute(fixture.tools, 'defer', { new_work: 'hand over' }, context('session-orchestrator', 'call-o1'))
  assert.equal(pendingOf(fixture, 'session-orchestrator').length, 1)
  fixture.state = attention.consume('session-orchestrator', ['call-o1'], fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-orchestrator'), [])
  fixture.state = attention.record('session-orchestrator', 'call-o1', 'hand over', fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-orchestrator'), [])
})

test('WHAT[attention-regulation-005] a receipt recorded before its work stays order-independent across replay', () => {
  let state = attention.empty()
  state = attention.consume('session-a', ['late'], state)
  state = attention.record('session-a', 'late', 'arrived after the receipt', state)
  assert.deepEqual(attention.pending('session-a', state), [])
})

test('WHAT[attention-regulation-005] closing a life consumes its remaining work without leaking into a reused session', async () => {
  const fixture = recordingPort()
  await tools.execute(fixture.tools, 'defer', { new_work: 'old life' }, context('session-reuse', 'call-r1'))
  fixture.state = attention.closeLife('session-reuse', fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-reuse'), [])
  // Replaying the old record cannot resurrect it into the reused session.
  fixture.state = attention.record('session-reuse', 'call-r1', 'old life', fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-reuse'), [])
  // A fresh life under the same session records new work normally.
  fixture.state = attention.record('session-reuse', 'call-r2', 'new life work', fixture.state)
  assert.deepEqual(pendingOf(fixture, 'session-reuse'), [{ occurrence: 'call-r2', text: 'new life work' }])
})

for (const grade of ['PERFECT', 'REVISE']) {
  test(`WHAT[attention-regulation-005] registered Manager suicide persists the exact consumption receipt after ${grade} retirement`, async () => {
    await withReview(async fixture => {
      const toolContext = call => ({
        sessionID: fixture.session, callID: call, messageID: call, agent: 'manager',
      })
      for (const [call, text] of [['deferred-first', 'Inspect the next change'], ['deferred-second', 'Document the remaining boundary']]) {
        await fixture.hooks.tool.defer.execute({ new_work: text }, toolContext(call))
      }
      const foreignText = fixture.session + '-foreign'
      const foreignAppend = await journal.JournalSurface_appendAgent(
        fixture.runtime.journal, { kind: 'Session', session: foreignText }, null,
        { family: 'Attention', case: 'DeferredWorkRecorded', payload: {
          SessionId: foreignText, OccurrenceId: 'deferred-first', Text: 'Other participant work',
        } },
      )
      assert.equal(foreignAppend.ok, true, foreignAppend.error)
      assert.match(await fixture.execute(findings(grade)), /recorded = true/)
      const recorded = factPayloads(fixture.directory, 'DeferredWorkRecorded')
        .filter(item => item.SessionId[1] === fixture.session)
      assert.equal(recorded.length, 2)
      assert.deepEqual(recorded.map(item => item.SessionId), [['SessionId', fixture.session], ['SessionId', fixture.session]])
      const first = await fixture.hooks.tool.suicide.execute({}, toolContext('confirmation'))
      assert.match(first, /finished = false/)
      assert.match(first, /confirmation_required = true/)
      assert.match(first, /Inspect the next change/)
      assert.match(first, /Document the remaining boundary/)
      assert.equal(journal.JournalSurface_pendingDeferredWork(fixture.runtime.journal, fixture.session).length, 2)
      assert.deepEqual(factPayloads(fixture.directory, 'DeferredWorkConsumed'), [])
      assert.match(await fixture.hooks.tool.suicide.execute({}, toolContext('retirement')), /finished = true/)
      const consumed = factPayloads(fixture.directory, 'DeferredWorkConsumed')
      assert.equal(consumed.length, 1, 'successful retirement leaves one independent durable receipt')
      assert.deepEqual(consumed[0].SessionId, ['SessionId', fixture.session])
      assert.deepEqual(consumed[0].OccurrenceIds.toSorted(), recorded.map(item => item.OccurrenceId).toSorted())
      assert.deepEqual(journal.JournalSurface_pendingDeferredWork(fixture.runtime.journal, fixture.session), [])
      assert.equal(journal.JournalSurface_pendingDeferredWork(fixture.runtime.journal, foreignText).length, 1)
      const cold = JSON.parse(execFileSync(process.execPath, [
        fileURLToPath(new URL('./support/consumption-cold-child.mjs', import.meta.url)),
        fixture.directory, fixture.session, foreignText, ...consumed[0].OccurrenceIds,
      ], { encoding: 'utf8' }))
      assert.notEqual(cold.pid, process.pid)
      assert.deepEqual(cold, { pid: cold.pid, pending: 0, foreignPending: 1, occurrences: consumed[0].OccurrenceIds })
    })
  })
}

for (const grade of ['PERFECT', 'REVISE']) {
  test(`WHAT[attention-regulation-005] registered Manager suicide reports an unavailable consumption append after ${grade} retirement`, async () => {
    await withReview(async fixture => {
      const toolContext = call => ({ sessionID: fixture.session, callID: call, messageID: call, agent: 'manager' })
      await fixture.hooks.tool.defer.execute({ new_work: 'Keep the missing receipt visible' }, toolContext('deferred-failure'))
      assert.match(await fixture.execute(findings(grade)), /recorded = true/)
      assert.match(await fixture.hooks.tool.suicide.execute({}, toolContext('confirmation')), /confirmation_required = true/)
      const refused = await withAppendRefusal(fixture.runtime.journal, 'consumption', async () => {
        await assert.rejects(
          () => fixture.hooks.tool.suicide.execute({}, toolContext('retirement')),
          /deferred work consumption durability unavailable/,
        )
        return null
      })
      assert.deepEqual(refused, { refused: 1, value: null })
      assert.deepEqual(factPayloads(fixture.directory, 'DeferredWorkConsumed'), [])
      assert.equal(factPayloads(fixture.directory, 'RetirementCommitted').length, 1,
        'a failed later receipt cannot erase the already durable retirement')
    })
  })
}

test('WHAT[attention-regulation-005] a refused retirement append preserves work without appending a consumption receipt', async () => {
  await withReview(async fixture => {
    const toolContext = call => ({ sessionID: fixture.session, callID: call, messageID: call, agent: 'manager' })
    await fixture.hooks.tool.defer.execute({ new_work: 'Still pending when retirement is refused' }, toolContext('deferred-refused-retirement'))
    assert.match(await fixture.execute(findings('PERFECT')), /recorded = true/)
    assert.match(await fixture.hooks.tool.suicide.execute({}, toolContext('confirmation')), /confirmation_required = true/)
    const refused = await withAppendRefusal(fixture.runtime.journal, 'retirement', async () => {
      await assert.rejects(() => fixture.hooks.tool.suicide.execute({}, toolContext('retirement')))
      return null
    })
    assert.deepEqual(refused, { refused: 1, value: null })
    assert.deepEqual(factPayloads(fixture.directory, 'RetirementCommitted'), [])
    assert.deepEqual(factPayloads(fixture.directory, 'DeferredWorkConsumed'), [])
    const replay = await fixture.hooks.tool.suicide.execute({}, toolContext('confirmation'))
    assert.match(replay, /confirmation_required = true/)
    assert.match(replay, /Still pending when retirement is refused/)
  })
})
