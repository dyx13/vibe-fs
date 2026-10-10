import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { syncBuiltinESMExports } from 'node:module'
import { execFileSync } from 'node:child_process'
import * as eventStore from '../../../../dist/Persistence/EventStore/Surface.js'
import * as casebook from '../../../../dist/Repository/Knowledge/Casebook/Surface.js'
import * as index from '../../../../dist/Repository/Knowledge/Casebook/IndexSurface.js'
import * as lifecycle from '../../../../dist/Repository/Knowledge/Casebook/LifecycleSurface.js'
import * as bookkeeper from '../../../../dist/Repository/Knowledge/Casebook/BookkeeperSurface.js'
import * as hostFinalize from '../../../../dist/OpenCode/Plugin/PluginHostWiringSurface.js'
import { createCase } from './casebook.mjs'
import { CANONICAL_Q, CANONICAL_A, installBookkeeperRuntime, scriptedBookkeeperPort } from './bookkeeper-session-support.mjs'

const [mode, directory, scenario, requestJson] = process.argv.slice(2)
const request = JSON.parse(requestJson)
const commonDir = path.join(directory, '.git')
const eventsDirectory = path.join(commonDir, 'wanxiangshu', 'events')
const sourceFile = path.join(eventsDirectory, 'operation.ndjson')
const encodeCase = value => value === null ? null : { ...value,
  accessOrder: value.accessOrder.toString(), lastAccessOrder: value.lastAccessOrder.toString() }
const canonicalBytes = () => Object.fromEntries(fs.readdirSync(eventsDirectory).sort()
  .filter(name => name.endsWith('.ndjson')).map(name => [name, fs.readFileSync(path.join(eventsDirectory, name), 'base64')]))
const record = (name, value) => {
  const fd = fs.openSync(path.join(directory, name), 'wx')
  try {
    fs.writeSync(fd, JSON.stringify(value) + '\n')
    fs.fsyncSync(fd)
  } finally { fs.closeSync(fd) }
}

if (mode === 'cold') {
  const handle = eventStore.create(commonDir, 'independent-boot-cold-reader')
  try {
    assert.deepEqual(canonicalBytes(), request.physical.files)
    for (const fact of request.physical.facts) assert.deepEqual(eventStore.read(handle, fact.id), fact)
    const before = await casebook.fetchCaseByIdentity(handle, request.oldIdentity)
    assert.deepEqual(encodeCase(before), request.before)
    assert.equal(before.completionFileState, request.baseline)
    assert.equal(before.maintenanceFileState, request.baseline)
    assert.equal(Buffer.from(await eventStore.readPayload(handle, request.payloadRef)).toString('base64'), request.payloadBytes)
    const current = await casebook.fetchCaseByIdentity(handle, request.identity)
    if (request.cuts.length > 0) assert.equal(current, null)
    else {
      assert.equal(current.identity, request.identity)
      assert.equal(current.q, CANONICAL_Q)
      assert.equal(current.a, CANONICAL_A)
      assert.equal(current.sourceTrace, request.identity)
      assert.equal(current.completionFileState, request.baseline)
      assert.equal(current.maintenanceFileState, request.baseline)
    }
    assert.equal(fs.existsSync(path.join(eventsDirectory, 'independent-boot-cold-reader.ndjson')), false)
    assert.equal(fs.existsSync(path.join(commonDir, 'wanxiangshu.lock')), false)
    assert.deepEqual(canonicalBytes(), request.physical.files)
    fs.writeSync(1, JSON.stringify({ pid: process.pid, parentPid: process.ppid,
      before: encodeCase(before), current: encodeCase(current), preserved: true }) + '\n')
  } finally { eventStore.dispose(handle) }
} else {
  assert.equal(mode, 'measure')
  assert.ok(['valid', 'valid-unknown', 'malformed', 'malformed-unknown'].includes(scenario))
  assert.equal(process.env.WANXIANGSHU_NO_FATAL_EXIT, undefined)
  assert.equal(process.env.NODE_TEST_CONTEXT, undefined)
  execFileSync('git', ['init', '--quiet', directory], { stdio: 'pipe' })
  const malformed = scenario.startsWith('malformed')
  const unknown = scenario.endsWith('-unknown')
  const configDirectory = path.join(directory, 'boot-routing', '.config', 'opencode')
  fs.mkdirSync(configDirectory, { recursive: true })
  fs.writeFileSync(path.join(configDirectory, 'wanxiangshu.mjs'),
    'export const routingProtocol = 2\nexport default function route() { return { model: "fixture/bookkeeper", reasoning: "none" } }\n')
  const originalHomeDirectory = os.homedir
  os.homedir = () => path.join(directory, 'boot-routing')
  syncBuiltinESMExports()
  fs.mkdirSync(path.join(directory, '.wanxiang', 'casebook'), { recursive: true })
  const identity = `boot-Capture-${scenario}`
  const oldIdentity = `prior-${identity}`
  let handle = eventStore.create(commonDir, 'setup')
  const { baseline } = await createCase({ dir: directory, store: handle }, oldIdentity)
  const before = await casebook.fetchCaseByIdentity(handle, oldIdentity)
  const payloadRef = JSON.parse(baseline)['subject.txt'].payloadRef
  const payloadBytes = Buffer.from(await eventStore.readPayload(handle, payloadRef)).toString('base64')
  eventStore.dispose(handle)
  handle = undefined
  const boot = await hostFinalize.createBoot({ directory })
  assert.equal(hostFinalize.bootHasJournal(boot), true, 'the actual Boot opened its workspace journal')
  const indexReader = eventStore.create(commonDir, 'index-reader')
  try { await index.refresh(indexReader, 256) }
  finally { eventStore.dispose(indexReader) }
  const beforeIndex = index.tryGet()
  const beforeFiles = canonicalBytes()
  const cause = new Error('original Boot Capture Current commit failure')
  handle = unknown ? eventStore.createWithCurrentCommitFault(commonDir, 'operation', cause, false)
    : eventStore.create(commonDir, 'operation')
  const counts = { append: 0, fsync: 0, close: 0, release: 0 }
  const descriptors = new Set()
  const synced = new Set()
  const originals = { appendFileSync: fs.appendFileSync, openSync: fs.openSync,
    fsyncSync: fs.fsyncSync, closeSync: fs.closeSync, rmSync: fs.rmSync }
  fs.appendFileSync = function (...args) {
    const result = Reflect.apply(originals.appendFileSync, this, args)
    if (typeof args[0] === 'string' && path.resolve(args[0]) === sourceFile) counts.append += 1
    return result
  }
  fs.openSync = function (...args) {
    const descriptor = Reflect.apply(originals.openSync, this, args)
    if (typeof args[0] === 'string' && path.resolve(args[0]) === sourceFile) descriptors.add(descriptor)
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
    const ownsLock = typeof args[0] === 'string' && path.resolve(args[0]) === path.join(commonDir, 'wanxiangshu.lock')
    if (ownsLock && counts.append > 0) {
      assert.equal(JSON.parse(fs.readFileSync(path.join(args[0], 'owner.json'), 'utf8')).pid, process.pid)
    }
    const result = Reflect.apply(originals.rmSync, this, args)
    if (ownsLock && counts.append > 0) counts.release += 1
    return result
  }
  syncBuiltinESMExports()
  let observed = 0
  const { port, createCalls, programCalls, prompts } = scriptedBookkeeperPort()
  installBookkeeperRuntime(port, [identity])
  const wrapped = eventStore.createAppendPayloadStore(handle, malformed, observation => {
    observed += 1
    assert.equal(observed, 1, 'Capture has one settled physical append')
    assert.equal(createCalls.length, 1)
    assert.equal(programCalls.length, 1)
    assert.ok(prompts.some(text => text.includes('CaseFinalize')))
    const facts = fs.readFileSync(sourceFile, 'utf8').trimEnd().split('\n').map(JSON.parse)
      .map(fact => ({ id: fact.event_id, stream: fact.stream_id, type: fact.event_type,
        parents: fact.parents, payload: fact.payload, payloadRefs: fact.payload_refs }))
    const appendError = observation.append.error
    record('settlement.json', { pid: process.pid, parentPid: process.ppid, scenario,
      bootJournalAvailable: hostFinalize.bootHasJournal(boot),
      identity, oldIdentity, baseline, before: encodeCase(before), payloadRef, payloadBytes, beforeFiles,
      original: observation.originalRequested[0], requested: observation.append.requested,
      cuts: observation.append.cuts, appendError: appendError === null ? null : {
        code: appendError.code, phase: appendError.phase, causeSame: appendError.cause === cause,
        requested: appendError.requested, prepared: appendError.prepared,
        cleanupFailures: appendError.cleanupFailures, priorRejection: appendError.priorRejection },
      causeText: cause.message, indexUnchanged: JSON.stringify(index.tryGet()) === JSON.stringify(beforeIndex),
      physical: { facts, files: canonicalBytes(), counts: { ...counts },
        lockReleased: !fs.existsSync(path.join(commonDir, 'wanxiangshu.lock')), openDescriptors: descriptors.size } })
  })
  try {
    lifecycle.notePrompt(identity, 'Original delegated investigation')
    lifecycle.noteAnswer(identity, 'Original completed Engineer result')
    lifecycle.collect(identity, 'read', { path: 'subject.txt' }, 'version-B')
    const result = await hostFinalize.finalizeDraftWithBoot(directory, wrapped, identity, boot)
    assert.equal(observed, 1)
    record('returned.json', result)
  } finally {
    Object.assign(fs, originals)
    os.homedir = originalHomeDirectory
    syncBuiltinESMExports()
    lifecycle.cleanup(identity)
    bookkeeper.resetRuntime()
    eventStore.dispose(wrapped)
    eventStore.dispose(handle)
    await hostFinalize.disposeBoot(boot)
  }
}
