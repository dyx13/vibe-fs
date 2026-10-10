import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { syncBuiltinESMExports } from 'node:module'

const [mode, commonDir, writerId, scenario, requestJson] = process.argv.slice(2)
assert.ok(mode === 'measure' || mode === 'cold')
assert.ok(['normal', 'fresh-release', 'duplicate-release', 'empty-release', 'append', 'open', 'fsync', 'close', 'current-before', 'current-after', 'fsync-close-release'].includes(scenario))
const { incoming, canonicalLine, sourceWriterId } = JSON.parse(requestJson)
const writerFile = path.join(commonDir, 'wanxiangshu', 'events', `${writerId}.ndjson`)
const sourceFile = path.join(commonDir, 'wanxiangshu', 'events', `${sourceWriterId}.ndjson`)
const lockPath = path.join(commonDir, 'wanxiangshu.lock')
const expectedBytes = Buffer.from(canonicalLine, 'utf8')

async function cold() {
  assert.notEqual(writerId, sourceWriterId, 'Cold reading must not take over the exited producer writer')
  const store = await import('../../../../dist/Persistence/EventStore/Surface.js')
  const handle = store.create(commonDir, writerId)
  try {
    assert.deepEqual(fs.readFileSync(sourceFile), expectedBytes)
    assert.deepEqual(store.read(handle, incoming.id), incoming)
    assert.equal(store.head(handle, incoming.stream), incoming.id)
    assert.deepEqual(store.heads(handle, incoming.stream), [incoming.id])
    assert.equal(fs.existsSync(writerFile), false, 'A cold read must not append to its fresh writer')
    assert.equal(fs.existsSync(lockPath), false)
    return {
      pid: process.pid,
      writerId,
      event: store.read(handle, incoming.id),
      head: store.head(handle, incoming.stream),
      heads: store.heads(handle, incoming.stream),
      bytesBase64: fs.readFileSync(sourceFile).toString('base64'),
    }
  } finally {
    store.dispose(handle)
  }
}

async function measure() {
  assert.equal(writerId, sourceWriterId)
  const originals = {
    appendFileSync: fs.appendFileSync,
    openSync: fs.openSync,
    closeSync: fs.closeSync,
    fsyncSync: fs.fsyncSync,
    rmSync: fs.rmSync,
  }
  const injected = new Error(`Actual owned ${scenario} operation failed`)
  const closeFailure = new Error('Actual owned descriptor closed before its response failed')
  const releaseFailure = new Error('Actual owned lock removed before its response failed')
  const descriptors = new Map()
  const syncedDescriptors = new Set()
  const observed = { appendCalls: 0, fsyncCalls: 0, syncedCloseCalls: 0, releaseCalls: 0, injectedCalls: 0 }
  let recording = false
  let armed = false
  let store
  let handle
  const currentFault = scenario === 'current-before' || scenario === 'current-after'
  const multipleFaults = scenario === 'fsync-close-release'
  const beforeBarrier = scenario === 'append' || scenario === 'open'
  const currentUnchanged = beforeBarrier || scenario === 'fsync' || scenario === 'close' || scenario === 'current-before' || multipleFaults
  const ownFile = value => typeof value === 'string' && path.resolve(value) === writerFile
  const ownLock = value => typeof value === 'string' && path.resolve(value) === lockPath

  function sameInjectedCause(value, expected = injected) {
    try {
      assert.strictEqual(value, expected)
      return true
    } catch (error) {
      if (error.code !== 'ERR_ASSERTION') throw error
      return false
    }
  }

  function errorView(error) {
    if (error === undefined) return null
    const { cause, cleanupFailures, ...fields } = error
    return {
      ...fields,
      causeIsInjected: sameInjectedCause(cause),
      cleanupFailures: Array.isArray(cleanupFailures)
        ? cleanupFailures.map(({ cause: cleanupCause, ...cleanup }) => ({ ...cleanup, causeIsInjected: sameInjectedCause(cleanupCause,
          multipleFaults ? cleanup.phase === 'DurabilityClose' ? closeFailure : releaseFailure : injected) }))
        : null,
    }
  }

  try {
    fs.appendFileSync = function (...args) {
      const result = Reflect.apply(originals.appendFileSync, this, args)
      if (recording && ownFile(args[0])) {
        observed.appendCalls += 1
        if (armed && scenario === 'append') {
          armed = false
          observed.injectedCalls += 1
          throw injected
        }
      }
      return result
    }
    fs.openSync = function (...args) {
      if (recording && armed && ownFile(args[0]) && args[1] === 'r+' && scenario === 'open') {
        armed = false
        observed.injectedCalls += 1
        throw injected
      }
      const descriptor = Reflect.apply(originals.openSync, this, args)
      if (ownFile(args[0])) descriptors.set(descriptor, writerFile)
      return descriptor
    }
    fs.closeSync = function (...args) {
      const result = Reflect.apply(originals.closeSync, this, args)
      const owned = recording && syncedDescriptors.has(args[0])
      if (owned) observed.syncedCloseCalls += 1
      syncedDescriptors.delete(args[0])
      descriptors.delete(args[0])
      if (owned && multipleFaults) {
        observed.injectedCalls += 1
        throw closeFailure
      }
      if (owned && armed && scenario === 'close') {
        armed = false
        observed.injectedCalls += 1
        throw injected
      }
      return result
    }
    fs.fsyncSync = function (...args) {
      const result = Reflect.apply(originals.fsyncSync, this, args)
      if (recording && descriptors.get(args[0]) === writerFile) {
        observed.fsyncCalls += 1
        syncedDescriptors.add(args[0])
        if (armed && (scenario === 'fsync' || multipleFaults)) {
          armed = false
          observed.injectedCalls += 1
          throw injected
        }
      }
      return result
    }
    fs.rmSync = function (...args) {
      const release = recording && ownLock(args[0])
      if (release) {
        assert.equal(JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'), 'utf8')).pid, process.pid)
        observed.releaseCalls += 1
      }
      const result = Reflect.apply(originals.rmSync, this, args)
      if (release && multipleFaults) {
        observed.injectedCalls += 1
        assert.equal(fs.existsSync(lockPath), false)
        throw releaseFailure
      }
      if (release && armed && scenario !== 'fsync') {
        armed = false
        observed.injectedCalls += 1
        assert.equal(fs.existsSync(lockPath), false, 'The original native removal actually completed')
        throw injected
      }
      return result
    }
    syncBuiltinESMExports()

    store = await import('../../../../dist/Persistence/EventStore/Surface.js')
    handle = currentFault
      ? store.createWithCurrentCommitFault(commonDir, writerId, injected, scenario === 'current-after')
      : store.create(commonDir, writerId)
    const noNewWrite = scenario === 'duplicate-release' || scenario === 'empty-release'
    if (noNewWrite) {
      assert.deepEqual(await store.append(handle, [incoming]), { ok: true, cuts: [] })
      assert.deepEqual(store.read(handle, incoming.id), incoming)
      assert.deepEqual(fs.readFileSync(writerFile), expectedBytes)
    }
    const before = fs.existsSync(writerFile) ? fs.readFileSync(writerFile) : Buffer.alloc(0)
    let result
    let thrown
    recording = true
    armed = scenario !== 'normal' && !currentFault
    try {
      result = await store.append(handle, scenario === 'empty-release' ? [] : [incoming])
    } catch (error) {
      thrown = error
    } finally {
      recording = false
    }

    const bytes = fs.readFileSync(writerFile)
    assert.deepEqual(bytes, expectedBytes, 'The actual writer contains the complete expected canonical JSON plus LF')
    if (noNewWrite) assert.deepEqual(bytes, before, 'This invocation must add no bytes')
    const event = store.read(handle, incoming.id)
    const head = store.head(handle, incoming.stream)
    const heads = store.heads(handle, incoming.stream)
    assert.deepEqual(event, currentUnchanged ? null : incoming)
    assert.equal(head, currentUnchanged ? null : incoming.id)
    assert.deepEqual(heads, currentUnchanged ? [] : [incoming.id])
    assert.equal(fs.existsSync(lockPath), false, 'The actual owned lock is already released')
    assert.equal(observed.appendCalls, noNewWrite ? 0 : 1)
    assert.equal(observed.fsyncCalls, noNewWrite || beforeBarrier ? 0 : 1)
    assert.equal(observed.syncedCloseCalls, noNewWrite || beforeBarrier ? 0 : 1)
    assert.equal(observed.releaseCalls, 1)
    assert.equal(observed.injectedCalls, multipleFaults ? 3 : scenario === 'normal' || currentFault ? 0 : 1)
    assert.equal(descriptors.size, 0, 'Every captured writer descriptor was actually closed')
    assert.equal(syncedDescriptors.size, 0)
    if (thrown !== undefined) assert.strictEqual(thrown, injected, 'The old rejected Task still carries the original native failure')

    return {
      pid: process.pid,
      scenario,
      observed,
      bytesBase64: bytes.toString('base64'),
      beforeBase64: before.toString('base64'),
      event,
      head,
      heads,
      lockReleased: !fs.existsSync(lockPath),
      settled: thrown === undefined,
      thrownIsInjected: thrown === injected,
      result: result === undefined ? null : result.ok ? result : { ok: result.ok, error: errorView(result.error) },
    }
  } finally {
    recording = false
    try {
      if (handle !== undefined) store.dispose(handle)
    } finally {
      Object.assign(fs, originals)
      syncBuiltinESMExports()
    }
  }
}

process.stdout.write(JSON.stringify(mode === 'measure' ? await measure() : await cold()))
