// requirements/knowledge-reuse/tests/016.test.mjs
//
// Laws: knowledge-reuse-016

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import test from 'node:test'

import * as eventStore from '../../../dist/Persistence/EventStore/Surface.js'
import * as casebook from '../../../dist/Repository/Knowledge/Casebook/Surface.js'
import * as bookkeeper from '../../../dist/Repository/Knowledge/Casebook/BookkeeperSurface.js'
import { sandbox, createCase, index, parse } from './support/casebook.mjs'
import { CANONICAL_A, installBookkeeperRuntime, scriptedBookkeeperPort } from './support/bookkeeper-session-support.mjs'

test('WHAT[knowledge-reuse-016] present_entry_maintains_immutable_content_addressing_and_storage_reuse', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wxs-kr-016-present-'))
  const store = eventStore.create(dir, 'kr-016-writer-present')
  try {
    const filePath = join(dir, 'example.txt')
    writeFileSync(filePath, 'hello immutable baseline', 'utf8')

    // First freeze
    const baseline1Json = await casebook.freezeCompletionState(store, dir, ['example.txt'])
    assert.equal(typeof baseline1Json, 'string')
    const parsed1 = JSON.parse(baseline1Json)
    const entry1 = parsed1['example.txt']

    assert.equal(entry1.kind, 'Present')
    assert.ok(entry1.payloadRef)
    assert.equal(entry1.sha256, casebook.contentHash('hello immutable baseline'))
    assert.equal(entry1.contentHash, entry1.sha256)

    // Verify stored payload in EventStore
    const payloadBytes1 = await eventStore.readPayload(store, entry1.payloadRef)
    assert.ok(payloadBytes1)
    assert.equal(new TextDecoder().decode(payloadBytes1), 'hello immutable baseline')

    // Second freeze on unchanged file: must reuse identical payloadRef and sha256
    const baseline2Json = await casebook.freezeCompletionState(store, dir, ['example.txt'])
    assert.equal(typeof baseline2Json, 'string')
    const parsed2 = JSON.parse(baseline2Json)
    const entry2 = parsed2['example.txt']

    assert.equal(entry2.kind, 'Present')
    assert.equal(entry2.payloadRef, entry1.payloadRef, 'must reuse identical payload reference for unchanged content')
    assert.equal(entry2.sha256, entry1.sha256, 'hash fingerprint must be identical')

    // Modify file: freeze must yield a different payloadRef and updated sha256
    writeFileSync(filePath, 'hello changed content', 'utf8')
    const baseline3Json = await casebook.freezeCompletionState(store, dir, ['example.txt'])
    const parsed3 = JSON.parse(baseline3Json)
    const entry3 = parsed3['example.txt']

    assert.equal(entry3.kind, 'Present')
    assert.notEqual(entry3.payloadRef, entry1.payloadRef, 'modified content must generate a new payloadRef')
    assert.equal(entry3.sha256, casebook.contentHash('hello changed content'))
    assert.equal(new TextDecoder().decode(await eventStore.readPayload(store, entry1.payloadRef)), 'hello immutable baseline')
  } finally {
    eventStore.dispose(store)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('WHAT[knowledge-reuse-016] missing_entry_records_nonexistent_file_as_missing_and_drives_diff', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wxs-kr-016-missing-'))
  const store = eventStore.create(dir, 'kr-016-writer-missing')
  try {
    const nonExistentPath = 'never-created.fs'

    const baselineJson = await casebook.freezeCompletionState(store, dir, [nonExistentPath])
    assert.equal(typeof baselineJson, 'string')
    const parsed = JSON.parse(baselineJson)

    assert.equal(parsed[nonExistentPath]?.kind, 'Missing', 'nonexistent file must be classified as Missing')
    assert.equal(parsed[nonExistentPath]?.payloadRef, undefined, 'Missing entry must not have a payloadRef')

    // Computing diff against Missing baseline when file remains missing -> no diff
    const diffBefore = await casebook.computeMaintenanceDiff(store, dir, [nonExistentPath], baselineJson)
    assert.equal(diffBefore.hasDiff, false)

    // When the file is subsequently created on disk, diff must identify it as an added file (new file)
    writeFileSync(join(dir, nonExistentPath), 'let created = true', 'utf8')
    const diffAfter = await casebook.computeMaintenanceDiff(store, dir, [nonExistentPath], baselineJson)
    assert.equal(diffAfter.hasDiff, true)
    assert.match(diffAfter.diffSummary, /new file/i)
    assert.match(diffAfter.diffSummary, /let created = true/)
  } finally {
    eventStore.dispose(store)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('WHAT[knowledge-reuse-016] io_failure_on_directory_or_unreadable_path_fails_closed_without_recording_missing_or_present', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wxs-kr-016-iofail-'))
  const store = eventStore.create(dir, 'kr-016-writer-iofail')
  try {
    // Create a directory where a file path is expected
    const subDirName = 'folder-as-file'
    mkdirSync(join(dir, subDirName), { recursive: true })

    // freezeCompletionState must fail closed on EISDIR / directory read error
    const result = await casebook.freezeCompletionState(store, dir, [subDirName])

    // Result must NOT be a baseline JSON string mapping folder-as-file to Missing or Present
    assert.notEqual(typeof result, 'string', 'I/O failure must not return a successful baseline JSON')
    assert.equal(result.ok, false, 'freeze completion state must fail with ok: false')
    assert.ok(result.error, 'must report explicit error message')
    assert.match(String(result.error), /failed to read file/i)
  } finally {
    eventStore.dispose(store)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('WHAT[knowledge-reuse-016] missing and corrupt inline payloads cannot authorize actual maintenance', async (t) => {
  for (const failure of ['missing', 'corrupt']) {
    await t.test(`WHAT[knowledge-reuse-016] ${failure} inline payload retains both baselines and the old body`, async () => {
      const local = sandbox()
      try {
        const { identity, baseline, shelfmark } = await createCase(local, 'case-1', 'version-B')
        // durable-events-012: payloads are inline in the ndjson event line.
        // A missing or corrupted inline payload is a storage-invalid event line;
        // the store must fail closed and never authorize maintenance.
        const eventsDir = join(local.dir, 'wanxiangshu', 'events')
        const writerFile = readdirSync(eventsDir).find((name) => name.endsWith('.ndjson'))
        const writerPath = join(eventsDir, writerFile)
        const lines = readFileSync(writerPath, 'utf8').trimEnd().split('\n')
        const last = JSON.parse(lines.at(-1))
        const ref = last.payload_refs[0]
        if (failure === 'missing') delete last.payloads[ref]
        else last.payloads[ref] = Buffer.from('different old bytes', 'utf8').toString('base64')
        lines[lines.length - 1] = JSON.stringify(last)
        writeFileSync(writerPath, lines.join('\n') + '\n')

        // A fresh store boot must fail closed on the tampered inline payload.
        assert.throws(() => eventStore.create(local.dir, 'kr-016-tampered-writer'))
        assert.equal(await casebook.fetchCaseByIdentity(local.store, identity) === null, false)
      } finally { bookkeeper.resetRuntime(); local.close() }
    })
  }
})

test('WHAT[knowledge-reuse-016] completion preserves every valid UTF-8 byte including BOM and line endings', async () => {
  const local = sandbox()
  try {
    const bytes = Buffer.from('\uFEFF完整内容\r\nlast line', 'utf8')
    writeFileSync(join(local.dir, 'subject.txt'), bytes)
    const baseline = await casebook.freezeCompletionState(local.store, local.dir, ['subject.txt'])
    assert.equal(typeof baseline, 'string')
    const stored = JSON.parse(baseline)['subject.txt']
    assert.equal(stored.sha256, createHash('sha256').update(bytes).digest('hex'))
    assert.deepEqual(Buffer.from(await eventStore.readPayload(local.store, stored.payloadRef)), bytes)
  } finally { local.close() }
})

test('WHAT[knowledge-reuse-016] actual fetch observes BOM removal and retains the original completion payload', async () => {
  const local = sandbox()
  try {
    const { identity, baseline, shelfmark } = await createCase(local, 'bom-removal', '\uFEFFsame text')
    writeFileSync(join(local.dir, 'subject.txt'), 'same text')
    const { port, prompts } = scriptedBookkeeperPort()
    installBookkeeperRuntime(port, [identity])
    assert.equal(parse(await local.fetch(shelfmark)).answer, CANONICAL_A)
    assert.equal(prompts.length, 1)
    const diff = parse(prompts[0]).diff.content
    assert.ok(diff.includes('-\uFEFFsame text'), diff)
    assert.ok(diff.includes('+same text'), diff)
    const current = await casebook.fetchCaseByIdentity(local.store, identity)
    assert.equal(current.completionFileState, baseline)
    const completion = JSON.parse(baseline)['subject.txt']
    const maintenance = JSON.parse(current.maintenanceFileState)['subject.txt']
    assert.deepEqual(Buffer.from(await eventStore.readPayload(local.store, completion.payloadRef)), Buffer.from('\uFEFFsame text'))
    assert.deepEqual(Buffer.from(await eventStore.readPayload(local.store, maintenance.payloadRef)), Buffer.from('same text'))
  } finally { bookkeeper.resetRuntime(); local.close() }
})

test('WHAT[knowledge-reuse-016] invalid UTF-8 cannot be frozen or maintained as replacement text', async () => {
  const local = sandbox()
  try {
    const { identity, baseline, shelfmark } = await createCase(local)
    writeFileSync(join(local.dir, 'subject.txt'), Buffer.from([0xFF]))
    const frozen = await casebook.freezeCompletionState(local.store, local.dir, ['subject.txt'])
    assert.equal(frozen.ok, false)
    const { port, createCalls } = scriptedBookkeeperPort()
    installBookkeeperRuntime(port, [identity])
    const result = await local.fetch(shelfmark)
    assert.equal(parse(result).answer, 'Answer B')
    assert.match(result, /could not|unable|未|无法/i)
    assert.equal(createCalls.length, 0)
    const current = await casebook.fetchCaseByIdentity(local.store, identity)
    assert.equal(current.completionFileState, baseline)
    assert.equal(current.maintenanceFileState, baseline)
  } finally { bookkeeper.resetRuntime(); local.close() }
})

test('WHAT[knowledge-reuse-016] an unreadable current target is not a deletion and cannot advance actual maintenance', async () => {
  const local = sandbox()
  try {
    const { identity, baseline, shelfmark } = await createCase(local)
    rmSync(join(local.dir, 'subject.txt'))
    mkdirSync(join(local.dir, 'subject.txt'))
    const { port, createCalls } = scriptedBookkeeperPort()
    installBookkeeperRuntime(port, [identity])
    const result = await local.fetch(shelfmark)
    assert.equal(parse(result).answer, 'Answer B')
    assert.match(result, /could not|unable|未|无法/i)
    assert.equal(createCalls.length, 0)
    const current = await casebook.fetchCaseByIdentity(local.store, identity)
    assert.equal(current.completionFileState, baseline)
    assert.equal(current.maintenanceFileState, baseline)
  } finally { bookkeeper.resetRuntime(); local.close() }
})

test('WHAT[knowledge-reuse-016] actual maintenance distinguishes empty content, additions and deletions', async (t) => {
  const transitions = [
    { name: 'empty to text', before: '', after: 'created text', removed: null, added: '+created text', marker: null },
    { name: 'text to empty', before: 'removed text', after: '', removed: '-removed text', added: null, marker: null },
    { name: 'present to missing', before: 'deleted text', after: null, removed: '-deleted text', added: null, marker: 'deleted file' },
    { name: 'missing to present', before: null, after: 'new text', removed: null, added: '+new text', marker: 'new file' },
  ]
  for (const transition of transitions) {
    await t.test(`WHAT[knowledge-reuse-016] ${transition.name} preserves exact persistent state`, async () => {
      const local = sandbox()
      try {
        const path = join(local.dir, 'subject.txt')
        if (transition.before !== null) writeFileSync(path, transition.before)
        const baseline = await casebook.freezeCompletionState(local.store, local.dir, ['subject.txt'])
        const identity = transition.name
        assert.equal((await casebook.finalizeEngineerCase(local.store, identity, 'trace', 'Question?', 'Answer B', ['subject.txt'], baseline)).kind, 'finalized')
        if (transition.after === null) rmSync(path)
        else writeFileSync(path, transition.after)
        const { port, prompts } = scriptedBookkeeperPort()
        installBookkeeperRuntime(port, [identity])
        assert.equal(parse(await local.fetch(index.shelfmarkFor(identity, 'Question?'))).answer, CANONICAL_A)
        assert.equal(prompts.length, 1)
        const diff = parse(prompts[0]).diff.content
        if (transition.removed) assert.ok(diff.includes(transition.removed), diff)
        if (transition.added) assert.ok(diff.includes(transition.added), diff)
        if (transition.marker) assert.ok(diff.includes(transition.marker), diff)
        else assert.doesNotMatch(diff, /new file|deleted file/)
        assert.doesNotMatch(diff, new RegExp(casebook.contentHash('')))
        const current = await casebook.fetchCaseByIdentity(local.store, identity)
        assert.equal(current.completionFileState, baseline)
        const target = JSON.parse(current.maintenanceFileState)['subject.txt']
        if (transition.after === null) assert.deepEqual(target, { kind: 'Missing' })
        else {
          assert.equal(target.kind, 'Present')
          assert.equal(target.sha256, casebook.contentHash(transition.after))
          assert.equal(new TextDecoder().decode(await eventStore.readPayload(local.store, target.payloadRef)), transition.after)
        }
      } finally { bookkeeper.resetRuntime(); local.close() }
    })
  }
})
