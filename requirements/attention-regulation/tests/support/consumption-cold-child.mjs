import assert from 'node:assert/strict'
import { acquireSharedForWorkspace } from '../../../../dist/OpenCode/Host/WorkspaceSharedJournal.js'
import * as journal from '../../../../dist/Persistence/Journal/Surface.js'

const [directory, sessionText, foreignText, ...occurrences] = process.argv.slice(2)
const opened = await acquireSharedForWorkspace(directory, process.pid, '2026-10-10T08:00:00Z')
assert.equal(opened.ok, true, opened.error)
try {
  const pending = owner => journal.JournalSurface_pendingDeferredWork(opened.journal, owner)
  const append = (caseName, payload) => journal.JournalSurface_appendAgent(
    opened.journal, { kind: 'Session', session: sessionText }, null,
    { family: 'Attention', case: caseName, payload: { SessionId: sessionText, ...payload } },
  )
  assert.deepEqual(pending(sessionText), [])
  assert.deepEqual(pending(foreignText).map(item => item.occurrence), [occurrences[0]])
  for (const occurrence of occurrences) {
    assert.equal(journal.JournalSurface_deferredWorkWasConsumed(opened.journal, sessionText, occurrence), true)
    const appended = await append('DeferredWorkRecorded', {
      OccurrenceId: occurrence, Text: 'Replayed after a real process restart',
    })
    assert.equal(appended.ok, true, appended.error)
  }
  const duplicate = await append('DeferredWorkConsumed', { OccurrenceIds: occurrences.toReversed() })
  assert.equal(duplicate.ok, true, duplicate.error)
  assert.deepEqual(pending(sessionText), [])
  assert.deepEqual(pending(foreignText).map(item => item.occurrence), [occurrences[0]])
  process.stdout.write(JSON.stringify({ pid: process.pid, pending: 0, foreignPending: 1, occurrences }) + '\n')
} finally {
  journal.JournalSurface_dispose(opened.journal)
}
