import assert from 'node:assert/strict'
import test from 'node:test'
import fs, { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sandbox, createCase, casebook, eventStore, index } from './support/casebook.mjs'
import * as fetchSurface from '../../../dist/Repository/Knowledge/Casebook/FetchSurface.js'
import * as settlements from '../../../dist/Repository/Knowledge/Casebook/SettlementSurface.js'
import * as lifecycle from '../../../dist/Repository/Knowledge/Casebook/LifecycleSurface.js'

test('WHAT[knowledge-reuse-009] absent marker keeps an existing root neutral and the bound fetch recognizes later enabling', async () => {
  const local = sandbox({ enabled: false })
  try {
    const beforeIndex = index.tryGet()
    const beforeStreams = eventStore.streams(local.store)
    assert.equal(casebook.featureEnabled(local.dir), false)
    assert.match(await local.fetch('Anything · 00000000'), /could not be read|无法.*读取|不可用/i)
    assert.deepEqual(index.tryGet(), beforeIndex, 'a disabled fetch does not construct or refresh the provider index')
    assert.deepEqual(eventStore.streams(local.store), beforeStreams, 'a disabled fetch appends no Casebook fact')
    mkdirSync(join(local.dir, '.wanxiang', 'casebook'), { recursive: true })
    assert.equal(casebook.featureEnabled(local.dir), true)
    assert.match(await local.fetch('Anything · 00000000'), /no entry|没有条目/i,
      'the same bound tool observes a marker added to its existing physical root')
    assert.deepEqual(eventStore.streams(local.store), beforeStreams)
  } finally { local.close() }
})

const bindFetch = (directory, store, owner) => fetchSurface.contract(
  { tool: { schema: { string: () => ({}) } } }, directory, store, owner,
)

test('WHAT[knowledge-reuse-009] a missing root binds a neutral fetch without creating a directory, index or event', async () => {
  const local = sandbox({ enabled: false })
  const observations = []
  const incidents = []
  let observed
  try {
    const missing = join(local.dir, 'missing-workspace')
    const beforeIndex = index.tryGet()
    const beforeStreams = eventStore.streams(local.store)
    observed = eventStore.createAppendPayloadStore(local.store, false, value => observations.push(value))
    const tool = bindFetch(missing, observed, settlements.createOwner(value => incidents.push(value)))
    assert.equal(existsSync(missing), false)
    assert.equal(casebook.featureEnabled(missing), false)
    const response = await tool.execute({ shelfmark: 'Anything · 00000000' }, { sessionID: 'reader', agent: 'engineer' })
    assert.match(response, /could not be read|无法.*读取|不可用/i)
    assert.equal(existsSync(missing), false)
    assert.deepEqual(index.tryGet(), beforeIndex)
    assert.deepEqual(eventStore.streams(local.store), beforeStreams)
    assert.deepEqual(observations, [])
    assert.deepEqual(incidents, [])
  } finally {
    if (observed) eventStore.dispose(observed)
    local.close()
  }
})

test('WHAT[knowledge-reuse-009] a root resolution I/O fault refuses binding with its original error and no fallback or Casebook effects', async () => {
  const local = sandbox()
  const realpath = fs.realpathSync
  const cause = Object.assign(new Error('controlled workspace realpath I/O failure'), { code: 'EIO' })
  const observations = []
  const incidents = []
  let observed
  let calls = 0
  let rejection
  let tool
  try {
    const { identity } = await createCase(local, 'realpath-fault-neutral')
    await index.refresh(local.store, 256)
    const beforeIndex = index.tryGet()
    const beforeCase = await casebook.fetchCaseByIdentity(local.store, identity)
    const beforeStreams = eventStore.streams(local.store)
    const beforeHeads = beforeStreams.map(stream => [stream, eventStore.heads(local.store, stream)])
    observed = eventStore.createAppendPayloadStore(local.store, false, value => observations.push(value))
    fs.realpathSync = (path, ...args) => {
      if (path === local.dir) {
        calls += 1
        throw cause
      }
      return realpath(path, ...args)
    }
    syncBuiltinESMExports()
    try {
      tool = bindFetch(local.dir, observed, settlements.createOwner(value => incidents.push(value)))
    } catch (error) {
      rejection = error
    } finally {
      fs.realpathSync = realpath
      syncBuiltinESMExports()
    }
    assert.strictEqual(rejection, cause, 'an I/O fault must refuse binding rather than silently retaining the raw path')
    assert.equal(tool, undefined)
    assert.equal(calls, 1)
    assert.deepEqual(index.tryGet(), beforeIndex)
    assert.deepEqual(await casebook.fetchCaseByIdentity(local.store, identity), beforeCase)
    assert.deepEqual(eventStore.streams(local.store), beforeStreams)
    assert.deepEqual(beforeStreams.map(stream => [stream, eventStore.heads(local.store, stream)]), beforeHeads)
    assert.deepEqual(observations, [])
    assert.deepEqual(incidents, [])
  } finally {
    fs.realpathSync = realpath
    syncBuiltinESMExports()
    if (observed) eventStore.dispose(observed)
    local.close()
  }
})

test('WHAT[knowledge-reuse-009] actual lifecycle finalization without a marker does not publish a case', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wxs-casebook-off-'))
  execFileSync('git', ['init', '--quiet', dir])
  const store = eventStore.create(join(dir, '.git'), 'off-writer')
  try {
    lifecycle.enable(dir)
    lifecycle.notePrompt('off', 'Q')
    lifecycle.noteAnswer('off', 'A')
    assert.equal((await lifecycle.tryFinalize(dir, 'off')).ok, true)
    assert.equal(await casebook.fetchCaseByIdentity(store, 'off'), null)
  } finally { lifecycle.disable(); eventStore.dispose(store); rmSync(dir, { recursive: true, force: true }) }
})

test.todo('WHAT[knowledge-reuse-009] GAP-160: actual plugin excludes description and index and appends no Casebook facts while disabled')
