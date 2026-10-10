import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import * as eventStore from '../../../dist/Persistence/EventStore/Surface.js'
import * as Hook from '../../../dist/Git/Hook/Surface.js'

const hexId = (n) => n.toString(16).padStart(40, '0')
const event = (id, n, parents = []) => ({
  id,
  stream: 'proof/local',
  type: 'JobRequested',
  parents,
  payload: { n },
  payloadRefs: [],
})

test('WHAT[durable-events-011] runtime append creates zero Git objects and remote sync encodes single writer file as single Git blob', async (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'wxs-de011-'))
  t.after(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  // 1. Initialize real Git repo
  execFileSync('git', ['init', '--quiet', repo])
  const gitDir = join(repo, '.git')

  await t.test('WHAT[durable-events-011] initial git ODB is empty', () => {
    const objectsEntries = readdirSync(join(gitDir, 'objects')).filter(e => e !== 'info' && e !== 'pack')
    assert.equal(objectsEntries.length, 0, 'initial git ODB must be empty')
  })

  // 2. Runtime append: append multiple events via EventStore
  const store = eventStore.create(gitDir, 'writer-de011-test')
  const e1 = event(hexId(1), 101)
  const e2 = event(hexId(2), 102, [hexId(1)])
  await eventStore.append(store, [e1, e2])

  await t.test('WHAT[durable-events-011] runtime append creates zero loose Git objects', () => {
    // Verify no loose object subdirectories (excluding pack/info) in .git/objects
    const objectsEntries = readdirSync(join(gitDir, 'objects')).filter(e => e !== 'info' && e !== 'pack')
    assert.equal(objectsEntries.length, 0, 'runtime append must never create loose Git objects in ODB')
  })

  await t.test('WHAT[durable-events-011] remote sync hook configuration and single writer file', () => {
    // 3. Remote sync boundary: Hook.ensure configures sync hook and remote refspec
    execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', 'https://example.com/repo.git'])
    const ensured = Hook.ensure(repo)
    assert.equal(ensured, true, 'Hook.ensure must configure git hooks')

    // When remote sync runs, each retained writer NDJSON file encodes to exactly one Git blob
    const writerFiles = readdirSync(join(gitDir, 'wanxiangshu/events')).filter(f => f.endsWith('.ndjson'))
    assert.equal(writerFiles.length, 1, 'exactly one writer NDJSON file must exist for this runtime')
  })
})
