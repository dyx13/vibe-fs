import assert from 'node:assert/strict'
import { startPluginIncarnation } from '../../../verification-system/tests/support/plugin-fixture.mjs'
import * as journal from '../../../../dist/Persistence/Journal/Surface.js'
import * as dispatch from '../../../../dist/Interaction/Dispatch/DispatchSurface.js'
import { factPayloads } from '../../../verification-system/tests/e2e/support/journal-observer.js'

const [directory, requestJson] = process.argv.slice(2)
const request = JSON.parse(requestJson)
assert.notEqual(process.pid, request.parentPid)
const { hooks, withRuntime } = await startPluginIncarnation(directory)
try {
  await withRuntime(async runtime => {
    const pending = session => journal.JournalSurface_pendingDeferredWork(runtime.journal, session).map(item => item.occurrence)
    const active = dispatch.projectionObservation(runtime.journal, request.session).activeLogicalRun
    const roots = factPayloads(directory, 'AuthorityRootAccepted')
    if (request.accept) {
      assert.deepEqual(pending(request.session), ['terminal-first', 'terminal-second', 'terminal-later'])
      assert.deepEqual(factPayloads(directory, 'PluginPromptPhysicalAccepted').filter(fact => fact.PromptKey[1] === request.key), [])
      const accept = () => hooks['chat.message']({ sessionID: request.session, messageID: request.message.id, agent: request.role }, {
        message: request.message, parts: request.parts,
      })
      await accept()
      await accept()
    }
    assert.deepEqual(dispatch.projectionObservation(runtime.journal, request.session).activeLogicalRun, active)
    assert.deepEqual(factPayloads(directory, 'AuthorityRootAccepted'), roots)
    assert.deepEqual(pending(request.session), ['terminal-later'])
    assert.deepEqual(pending(request.foreign), ['terminal-first'])
    for (const occurrence of ['terminal-first', 'terminal-second']) {
      assert.equal(journal.JournalSurface_deferredWorkWasConsumed(runtime.journal, request.session, occurrence), true)
      const replayed = await journal.JournalSurface_appendAgent(runtime.journal, { kind: 'Session', session: request.session }, null, {
        family: 'Attention', case: 'DeferredWorkRecorded', payload: {
          SessionId: request.session, OccurrenceId: occurrence, Text: 'Replayed after physical presentation',
        },
      })
      assert.equal(replayed.ok, true, replayed.error)
    }
    assert.deepEqual(pending(request.session), ['terminal-later'])
    assert.equal(factPayloads(directory, 'PluginPromptPhysicalAccepted').filter(fact => fact.PromptKey[1] === request.key).length, 1)
    assert.deepEqual(factPayloads(directory, 'DeferredWorkConsumed'), [])
    process.stdout.write(JSON.stringify({ pid: process.pid, pending: pending(request.session),
      consumed: ['terminal-first', 'terminal-second'], foreign: pending(request.foreign) }) + '\n')
  })
} finally {
  await hooks.dispose()
}
