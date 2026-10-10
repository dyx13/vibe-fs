import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { syncBuiltinESMExports } from 'node:module'

const [mode, commonDir, writerId, scenario, requestJson] = process.argv.slice(2)
const request = JSON.parse(requestJson)
assert.ok(['measure', 'cold'].includes(mode))
assert.ok(['gate-directory', 'before-directory', 'mixed-release', 'cut-release', 'validation-release', 'preparation-random'].includes(scenario))
const writerFile = path.join(commonDir, 'wanxiangshu', 'events', `${writerId}.ndjson`)
const sourceFile = path.join(commonDir, 'wanxiangshu', 'events', `${request.sourceWriterId}.ndjson`)
const lockPath = path.join(commonDir, 'wanxiangshu.lock')
const gateDirectory = path.join(commonDir, 'wanxiangshu')
const eventsDirectory = path.join(gateDirectory, 'events')
const noWrite = ['gate-directory', 'before-directory', 'validation-release', 'preparation-random'].includes(scenario)

const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  }
  return value
}
const eventLine = event => JSON.stringify(canonical({
  event_id: event.id,
  event_type: event.type,
  parents: event.parents,
  payload: event.payload,
  payload_refs: event.payloadRefs,
  stream_id: event.stream,
})) + '\n'
const eventDto = event => ({
  id: event.event_id,
  stream: event.stream_id,
  type: event.event_type,
  parents: event.parents,
  payload: event.payload,
  payloadRefs: event.payload_refs,
})
const readViews = (store, handle, facts) => (facts.length === 0 ? [request.incoming] : facts).map(fact => ({
  event: store.read(handle, fact.id),
  head: store.head(handle, fact.stream),
  heads: store.heads(handle, fact.stream),
}))

async function cold() {
  assert.notEqual(writerId, request.sourceWriterId)
  const store = await import('../../../../dist/Persistence/EventStore/Surface.js')
  const handle = store.create(commonDir, writerId)
  try {
    const views = readViews(store, handle, request.facts)
    const bytes = noWrite ? Buffer.alloc(0) : fs.readFileSync(sourceFile)
    assert.equal(fs.existsSync(sourceFile), !noWrite)
    assert.equal(bytes.toString('base64'), request.bytesBase64)
    assert.equal(fs.existsSync(writerFile), false)
    assert.equal(fs.existsSync(lockPath), false)
    return { pid: process.pid, views, bytesBase64: bytes.toString('base64'), writerCreated: false }
  } finally {
    store.dispose(handle)
  }
}

async function measure() {
  assert.equal(writerId, request.sourceWriterId)
  const originals = {
    mkdirSync: fs.mkdirSync,
    appendFileSync: fs.appendFileSync,
    openSync: fs.openSync,
    fsyncSync: fs.fsyncSync,
    closeSync: fs.closeSync,
    rmSync: fs.rmSync,
  }
  const injected = Object.assign(new Error(`Actual owned ${scenario} boundary failed`), { code: 'EIO' })
  const observed = { directoryFailures: 0, random: 0, append: 0, fsync: 0, close: 0, release: 0, injected: 0 }
  const nativeCrypto = globalThis.crypto
  const randomDescriptor = Object.getOwnPropertyDescriptor(nativeCrypto, 'getRandomValues')
  const originalRandom = nativeCrypto.getRandomValues
  let randomArmed = scenario === 'preparation-random'
  const descriptors = new Set()
  let recording = false
  let store
  let handle
  let output
  let operationFailure
  const cleanupFailures = []
  const owns = (value, ownedPath) => typeof value === 'string' && path.resolve(value) === ownedPath

  try {
    if (randomArmed) {
      Object.defineProperty(nativeCrypto, 'getRandomValues', {
        configurable: true,
        writable: true,
        value: function (...args) {
          if (recording && randomArmed) {
            assert.equal(args.length, 1)
            assert.ok(args[0] instanceof Uint8Array)
            assert.equal(args[0].byteLength, 16)
            assert.equal(JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'), 'utf8')).pid, process.pid)
            randomArmed = false
            observed.random += 1
            observed.injected += 1
            throw injected
          }
          return Reflect.apply(originalRandom, this, args)
        },
      })
    }
    fs.mkdirSync = function (...args) {
      const failGate = scenario === 'gate-directory' && owns(args[0], gateDirectory)
      const failBeforeAppend = scenario === 'before-directory' && owns(args[0], eventsDirectory)
      if (recording && (failGate || failBeforeAppend)) {
        observed.directoryFailures += 1
        observed.injected += 1
        throw injected
      }
      return Reflect.apply(originals.mkdirSync, this, args)
    }
    fs.appendFileSync = function (...args) {
      const result = Reflect.apply(originals.appendFileSync, this, args)
      if (recording && owns(args[0], writerFile)) observed.append += 1
      return result
    }
    fs.openSync = function (...args) {
      const descriptor = Reflect.apply(originals.openSync, this, args)
      if (recording && owns(args[0], writerFile) && args[1] === 'r+') descriptors.add(descriptor)
      return descriptor
    }
    fs.fsyncSync = function (...args) {
      const result = Reflect.apply(originals.fsyncSync, this, args)
      if (recording && descriptors.has(args[0])) observed.fsync += 1
      return result
    }
    fs.closeSync = function (...args) {
      const result = Reflect.apply(originals.closeSync, this, args)
      if (descriptors.delete(args[0])) observed.close += 1
      return result
    }
    fs.rmSync = function (...args) {
      const owned = recording && owns(args[0], lockPath)
      if (owned) {
        assert.equal(JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'), 'utf8')).pid, process.pid)
        observed.release += 1
      }
      const result = Reflect.apply(originals.rmSync, this, args)
      if (owned && scenario.endsWith('-release')) {
        assert.equal(fs.existsSync(lockPath), false)
        observed.injected += 1
        throw injected
      }
      return result
    }
    syncBuiltinESMExports()
    store = await import('../../../../dist/Persistence/EventStore/Surface.js')
    handle = store.create(commonDir, writerId)
    if (scenario === 'mixed-release') {
      assert.deepEqual(await store.append(handle, [request.seed]), { ok: true, cuts: [] })
      assert.deepEqual(fs.readFileSync(writerFile, 'utf8'), eventLine(request.seed))
    }
    const before = fs.existsSync(writerFile) ? fs.readFileSync(writerFile) : Buffer.alloc(0)
    const incoming = scenario === 'mixed-release' ? [request.seed, request.incoming] : [request.incoming]
    let result
    let rejected
    recording = true
    try {
      result = await store.append(handle, incoming)
    } catch (error) {
      rejected = { error }
    } finally {
      recording = false
    }
    assert.equal(fs.existsSync(writerFile), !noWrite)
    const bytes = noWrite ? Buffer.alloc(0) : fs.readFileSync(writerFile)
    const facts = noWrite ? [] : bytes.toString('utf8').trimEnd().split('\n').map(JSON.parse).map(eventDto)
    assert.equal(bytes.toString('utf8'), facts.map(eventLine).join(''), 'Full independent canonical bytes, including the final LF')
    if (scenario === 'mixed-release') {
      assert.deepEqual(facts, [request.seed, request.incoming])
      assert.equal(before.toString('utf8'), eventLine(request.seed))
    }
    if (scenario === 'cut-release') {
      assert.equal(facts.length, 2)
      assert.deepEqual(facts[0], request.incoming)
      assert.equal(facts[1].type, 'ProjectionCutTail')
      assert.equal(facts[1].payload.failed_event_id, request.incoming.id)
      assert.equal(facts[1].payload.rule, 'Casebook')
      assert.deepEqual(facts[1].parents, [request.incoming.id])
      assert.equal(typeof facts[1].payload.reset_json, 'string')
      assert.equal(typeof facts[1].payload.reason, 'string')
      assert.ok(facts[1].payload.reason.length > 0)
    }
    const views = readViews(store, handle, facts)
    assert.deepEqual(views, noWrite ? [{ event: null, head: null, heads: [] }]
      : facts.map(fact => ({ event: fact, head: fact.id, heads: [fact.id] })))
    assert.equal(fs.existsSync(lockPath), false)
    assert.equal(descriptors.size, 0)
    assert.deepEqual(observed, {
      directoryFailures: scenario.endsWith('directory') ? 1 : 0,
      random: scenario === 'preparation-random' ? 1 : 0,
      append: noWrite ? 0 : 1,
      fsync: noWrite ? 0 : 1,
      close: noWrite ? 0 : 1,
      release: scenario === 'gate-directory' ? 0 : 1,
      injected: 1,
    })
    let error = null
    if (result !== undefined && !result.ok) {
      const { cause, ...fields } = result.error
      error = { ...fields, causeIsInjected: cause === injected }
    }
    output = {
      pid: process.pid,
      observed,
      facts,
      views,
      bytesBase64: bytes.toString('base64'),
      beforeBase64: before.toString('base64'),
      writerCreated: fs.existsSync(writerFile),
      settled: rejected === undefined,
      rejectionIsInjected: rejected?.error === injected,
      result: result === undefined ? null : { ok: result.ok, error },
    }
  } catch (error) {
    operationFailure = { error }
  } finally {
    recording = false
    Object.assign(fs, originals)
    syncBuiltinESMExports()
    try {
      if (scenario === 'preparation-random') {
        if (randomDescriptor === undefined) delete nativeCrypto.getRandomValues
        else Object.defineProperty(nativeCrypto, 'getRandomValues', randomDescriptor)
      }
    } catch (error) {
      cleanupFailures.push(error)
    }
    try {
      if (handle !== undefined) store.dispose(handle)
    } catch (error) {
      cleanupFailures.push(error)
    }
  }
  if (cleanupFailures.length > 0) {
    throw new AggregateError(operationFailure === undefined ? cleanupFailures : [operationFailure.error, ...cleanupFailures],
      'append boundary fixture cleanup failed', { cause: operationFailure?.error })
  }
  if (operationFailure !== undefined) throw operationFailure.error
  return output
}

process.stdout.write(JSON.stringify(mode === 'measure' ? await measure() : await cold()))
