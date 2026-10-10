import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import path from 'node:path'

const [binding, commonDir, writerId, scenario, requestJson] = process.argv.slice(2)
assert.ok(['wire', 'mcp', 'cold'].includes(binding))
assert.ok(['valid', 'valid-release', 'malformed-release'].includes(scenario))
const request = JSON.parse(requestJson)
const store = await import('../../../../dist/Persistence/EventStore/Surface.js')
const persistence = await import('../../../../dist/Sphinx/V2/Persistence/Surface.js')
const digest = value => createHash('sha256').update(value).digest('hex')
const dto = event => ({ id: event.event_id, stream: event.stream_id, type: event.event_type,
  parents: event.parents, payload: event.payload, payloadRefs: event.payload_refs })
const root = path.dirname(commonDir)
const sourceFile = path.join(commonDir, 'wanxiangshu', 'events', `${writerId}.ndjson`)
const lock = path.join(commonDir, 'wanxiangshu.lock')
const handle = store.create(commonDir, writerId)

if (binding === 'cold') {
  try {
    assert.notEqual(writerId, request.sourceWriter)
    const file = path.join(commonDir, 'wanxiangshu', 'events', `${request.sourceWriter}.ndjson`)
    assert.equal(fs.readFileSync(file, 'base64'), request.physical.bytes)
    for (const fact of request.physical.facts) assert.deepEqual(store.read(handle, fact.id), fact)
    for (const head of request.physical.heads) {
      assert.deepEqual(store.heads(handle, head.stream), head.heads)
      assert.equal(store.head(handle, head.stream), head.head)
    }
    const current = persistence.canonicalCurrent(handle, digest, request.inquiryId)
    assert.deepEqual(current, request.physical.current)
    if (request.seed) {
      const seedFile = path.join(commonDir, 'wanxiangshu', 'events', `${request.seed.writerId}.ndjson`)
      assert.equal(fs.readFileSync(seedFile, 'base64'), request.seed.bytes)
      for (const fact of request.seed.facts) assert.deepEqual(store.read(handle, fact.id), fact)
    }
    assert.equal(fs.existsSync(sourceFile), false)
    assert.equal(fs.existsSync(lock), false)
    assert.equal(fs.readFileSync(file, 'base64'), request.physical.bytes)
    fs.writeSync(1, JSON.stringify({ pid: process.pid, parentPid: process.ppid, writerId,
      current, bytes: request.physical.bytes, preserved: true }) + '\n')
  } finally { store.dispose(handle) }
} else {
  assert.equal(process.env.WANXIANGSHU_NO_FATAL_EXIT, undefined)
  assert.equal(process.env.NODE_TEST_CONTEXT, undefined)
  const malformed = scenario === 'malformed-release'
  const release = scenario.endsWith('-release')
  const cause = new Error(`Sphinx ${binding} original owned Release completed before response failed`)
  const descriptors = new Set()
  const synced = new Set()
  const counts = { append: 0, fsync: 0, close: 0, release: 0, injected: 0 }
  const originals = { appendFileSync: fs.appendFileSync, openSync: fs.openSync,
    fsyncSync: fs.fsyncSync, closeSync: fs.closeSync, rmSync: fs.rmSync }
  const ownsFile = value => typeof value === 'string' && path.resolve(value) === sourceFile
  fs.appendFileSync = function (...args) {
    const result = Reflect.apply(originals.appendFileSync, this, args)
    if (ownsFile(args[0])) counts.append += 1
    return result
  }
  fs.openSync = function (...args) {
    const descriptor = Reflect.apply(originals.openSync, this, args)
    if (ownsFile(args[0])) descriptors.add(descriptor)
    return descriptor
  }
  fs.fsyncSync = function (...args) {
    const result = Reflect.apply(originals.fsyncSync, this, args)
    if (descriptors.has(args[0])) {
      counts.fsync += 1
      synced.add(args[0])
    }
    return result
  }
  fs.closeSync = function (...args) {
    const result = Reflect.apply(originals.closeSync, this, args)
    if (synced.has(args[0])) counts.close += 1
    descriptors.delete(args[0])
    synced.delete(args[0])
    return result
  }
  fs.rmSync = function (...args) {
    const owned = typeof args[0] === 'string' && path.resolve(args[0]) === lock
    if (owned) assert.equal(JSON.parse(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8')).pid, process.pid)
    const result = Reflect.apply(originals.rmSync, this, args)
    if (owned) {
      counts.release += 1
      assert.equal(fs.existsSync(lock), false)
      if (release) {
        counts.injected += 1
        throw cause
      }
    }
    return result
  }
  syncBuiltinESMExports()
  let observed = 0
  const observe = observation => {
    observed += 1
    assert.equal(observed, 1, 'the original binding has one physical append attempt')
    assert.equal(observation.originalRequested.length, 1)
    const [original] = observation.originalRequested
    const inquiryId = original.payload.inquiry
    const bytes = fs.readFileSync(sourceFile)
    const facts = bytes.toString('utf8').trimEnd().split('\n').map(JSON.parse).map(dto)
    for (const fact of facts) assert.deepEqual(store.read(handle, fact.id), fact)
    const physical = { bytes: bytes.toString('base64'), facts,
      current: persistence.canonicalCurrent(handle, digest, inquiryId),
      heads: facts.map(fact => ({ stream: fact.stream, head: store.head(handle, fact.stream), heads: store.heads(handle, fact.stream) })),
      counts: { ...counts }, lockReleased: !fs.existsSync(lock),
      openDescriptors: descriptors.size, syncedDescriptors: synced.size }
    const appendError = observation.append.error
    const appendErrorView = appendError === null ? null : {
      code: appendError.code, phase: appendError.phase, causeSame: appendError.cause === cause,
      requested: appendError.requested, prepared: appendError.prepared,
      cleanupFailures: appendError.cleanupFailures, priorRejection: appendError.priorRejection,
    }
    const receipt = { pid: process.pid, parentPid: process.ppid, writerId, binding, scenario,
      inquiryId, commandId: original.payload.commandId, original,
      requested: observation.append.requested, cuts: observation.append.cuts,
      appendError: appendErrorView, causeText: cause.message, physical }
    const fd = fs.openSync(path.join(root, 'settlement.json'), 'wx')
    try {
      fs.writeSync(fd, JSON.stringify(receipt) + '\n')
      fs.fsyncSync(fd)
    } finally { fs.closeSync(fd) }
  }
  const port = store.createAppendPayloadStore(handle, malformed, observe)
  if (binding === 'wire') {
    const wire = await import('../../../../dist/Sphinx/V2/Wire/Surface.js')
    const runtime = wire.createWithStore(port, request.configuration)
    try {
      const result = await wire.start(runtime, request.command)
      assert.equal(observed, 1)
      fs.writeFileSync(path.join(root, 'returned.json'), JSON.stringify(result))
    } finally {
      Object.assign(fs, originals)
      syncBuiltinESMExports()
      wire.dispose(runtime)
      store.dispose(port)
      store.dispose(handle)
    }
  } else {
    const mcp = await import('../../../../dist/Sphinx/V2/Hosts/Mcp/Surface.js')
    await mcp.serveConfigured(port, request.configuration)
    // The actual MCP transport owns stdin until the coordinator closes it after a real reply.
    process.stdin.once('end', () => {
      Object.assign(fs, originals)
      syncBuiltinESMExports()
      store.dispose(port)
      store.dispose(handle)
    })
  }
}
