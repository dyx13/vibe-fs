import assert from 'node:assert/strict'
import { startPluginIncarnation } from '../../../verification-system/tests/support/plugin-fixture.mjs'
import * as journal from '../../../../dist/Persistence/Journal/Surface.js'
import * as dispatch from '../../../../dist/Interaction/Dispatch/DispatchSurface.js'

const [directory, session, expectedJson, parentPid] = process.argv.slice(2)
assert.notEqual(process.pid, Number(parentPid))
const expected = JSON.parse(expectedJson)
const { hooks, withRuntime } = await startPluginIncarnation(directory)
try {
  await withRuntime(async runtime => {
    const current = dispatch.projectionObservation(runtime.journal, session)
    assert.deepEqual(current.activeLogicalRun, expected.activeLogicalRun)
    assert.deepEqual(current.pendingClaims, expected.pendingClaims)
    assert.deepEqual(current.claimSequences, expected.claimSequences)
    const pending = journal.JournalSurface_pendingDeferredWork(runtime.journal, session).map(item => item.occurrence)
    assert.deepEqual(pending, ['first', 'second'])
    process.stdout.write(JSON.stringify({ pid: process.pid, pending }) + '\n')
  })
} finally {
  await hooks.dispose()
}
