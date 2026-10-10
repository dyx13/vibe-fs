import assert from 'node:assert/strict'
import { acquireSharedForWorkspace } from '../../../../dist/OpenCode/Host/WorkspaceSharedJournal.js'
import * as journal from '../../../../dist/Persistence/Journal/Surface.js'

const [directory, owner, generation] = process.argv.slice(2)
const opened = await acquireSharedForWorkspace(directory, process.pid, '2026-10-10T10:59:00Z')
assert.equal(opened.ok, true, opened.error)
try {
  const view = journal.JournalSurface_concernView(opened.journal, 'root', owner)
  assert.equal(view.mailbox.generation, generation)
  assert.equal(view.mailbox.owner, owner)
  assert.equal(view.mailbox.active, false)
  assert.deepEqual(view.pendingOccurrenceIds, [])
  assert.deepEqual(view.pendingMessages, [])
  process.stdout.write(JSON.stringify({ pid: process.pid, view }) + '\n')
} finally {
  journal.JournalSurface_dispose(opened.journal)
}
