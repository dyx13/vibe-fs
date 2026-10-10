import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { retainedWriterIdsAt, syncAt, writerSyncAdapterScenario } from '../../../dist/Persistence/EventStore/RetentionSurface.js'
import { createBareWorkspace, readRemoteStoreOid, remoteHasObject } from '../../verification-system/tests/support/dumb-remote.mjs'
import { integrationTest } from '../../verification-system/tests/support/tier-gate.mjs'
import { event } from './support/events.mjs'
import { appendFact, assertFacts, runHook } from './support/hooks.mjs'

const canonicalLine = (id, stream) => JSON.stringify({
  event_id: id, event_type: 'JobRequested', parents: [], payload: {}, payload_refs: [], stream_id: stream,
}) + '\n'
const writtenRoot = protocol => protocol.findLast(call => call.startsWith('WriteTree ')).slice('WriteTree '.length)

test('WHAT[durable-convergence-009] actual writer sync preserves gateway identities and refuses an invalid remote root', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wxs-writer-sync-adapter-'))
  const commonDir = join(root, '.git')
  const nowMs = Date.now()
  try {
    const events = join(commonDir, 'wanxiangshu', 'events')
    mkdirSync(events, { recursive: true })
    writeFileSync(join(events, 'writer-local.ndjson'), canonicalLine('a'.repeat(40), '1'.repeat(40)))
    const result = await writerSyncAdapterScenario({
      commonDir, nowMs, remoteWriterId: 'writer-remote',
      remoteWriterText: canonicalLine('b'.repeat(40), '2'.repeat(40)), remoteActivityMs: nowMs,
    })
    assert.equal(result.first.ok, true, JSON.stringify(result.first))
    assert.equal(result.repeat.ok, true, JSON.stringify(result.repeat))
    assert.deepEqual(result.localWriterIds, ['writer-local', 'writer-remote'])
    assert.deepEqual(result.writerIdsAfterInvalid, ['writer-local', 'writer-remote'])
    assert.equal(result.first.protocol.includes(`ReadTree ${result.validRemoteRoot}`), true)
    assert.equal(result.first.root, writtenRoot(result.first.protocol))
    assert.equal(result.repeat.root, result.first.root)
    assert.equal(result.repeat.root, writtenRoot(result.repeat.protocol))
    assert.equal(result.invalid.ok, false)
    assert.match(result.invalid.error, /sync root must contain writers\//)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('WHAT[durable-convergence-009] absent remote materializes a valid local-only Git snapshot', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'wxs-writer-sync-absent-'))
  execFileSync('git', ['init', '-q', repo])
  const commonDir = join(repo, '.git')
  const nowMs = Date.now()
  try {
    const events = join(commonDir, 'wanxiangshu', 'events')
    mkdirSync(events, { recursive: true })
    writeFileSync(join(events, 'writer-local.ndjson'), canonicalLine('a'.repeat(40), '1'.repeat(40)))
    const result = await syncAt(repo, commonDir, null, nowMs)
    assert.equal(result.ok, true, JSON.stringify(result))
    const entries = execFileSync('git', ['-C', repo, 'ls-tree', result.root], { encoding: 'utf8' })
    assert.match(entries, /\twriters$/m)
    // durable-events-012: payload bytes live inline in each writer line, so the
    // remote snapshot carries writers plus the manifest and no payloads tree.
    assert.doesNotMatch(entries, /\tpayloads$/m)
    assert.match(entries, /\twriter-manifest$/m)
    assert.deepEqual(retainedWriterIdsAt(commonDir, nowMs), ['writer-local'])
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

integrationTest('WHAT[durable-convergence-009] two independent clients converge and replay exact facts using only a bare Git remote and hook processes', async () => {
  const workspace = createBareWorkspace(['left', 'right'])
  try {
    const left = workspace.client('left')
    const right = workspace.client('right')
    const a = event('a'.repeat(40), [], { writer: 'left' })
    const b = event('b'.repeat(40), [], { writer: 'right' })
    await appendFact(left, 'writer-left', a)
    await appendFact(right, 'writer-right', b)
    runHook(left)
    const first = readRemoteStoreOid(workspace.bare)
    assert.match(first, /^[0-9a-f]{40}$/)
    assert.equal(remoteHasObject(workspace.bare, first), true)
    runHook(right)
    runHook(left)
    const merged = readRemoteStoreOid(workspace.bare)
    assert.notEqual(merged, first)
    for (const repo of [left, right]) {
      assertFacts(repo, [a, b])
      runHook(repo)
      assert.equal(readRemoteStoreOid(workspace.bare), merged)
      assertFacts(repo, [a, b])
    }
  } finally {
    workspace.cleanup()
  }
})
