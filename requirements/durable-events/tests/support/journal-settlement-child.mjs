import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { syncBuiltinESMExports } from 'node:module'

const [mode, commonDir, writerId, scenario, requestJson] = process.argv.slice(2)
const file = path.join(commonDir, 'wanxiangshu', 'events', `${writerId}.ndjson`)
const lock = path.join(commonDir, 'wanxiangshu.lock')
const request = JSON.parse(requestJson)

async function cold() {
  const store = await import('../../../../dist/Persistence/EventStore/Surface.js')
  const handle = store.create(commonDir, writerId)
  try {
    return {
      pid: process.pid,
      present: request.ids.map(id => store.read(handle, id) !== null),
      writerCreated: fs.existsSync(file),
      sourceBytes: fs.readFileSync(request.sourceFile, 'base64'),
    }
  } finally {
    store.dispose(handle)
  }
}

async function measure() {
  const originals = { appendFileSync: fs.appendFileSync, openSync: fs.openSync, fsyncSync: fs.fsyncSync, closeSync: fs.closeSync, rmSync: fs.rmSync }
  const cause = new Error(`native journal ${scenario} response failed`)
  const descriptors = new Set()
  const synced = new Set()
  const observed = { append: 0, fsync: 0, close: 0, release: 0, injected: 0 }
  const faultAt = scenario.startsWith('initialization-') ? 1 : 2
  const barrier = scenario.endsWith('-fsync')
  let recording = false
  let surface
  let handle
  const ownFile = value => typeof value === 'string' && path.resolve(value) === file
  try {
    fs.appendFileSync = function (...args) {
      const result = Reflect.apply(originals.appendFileSync, this, args)
      if (recording && ownFile(args[0])) observed.append += 1
      return result
    }
    fs.openSync = function (...args) {
      const descriptor = Reflect.apply(originals.openSync, this, args)
      if (ownFile(args[0])) descriptors.add(descriptor)
      return descriptor
    }
    fs.fsyncSync = function (...args) {
      const result = Reflect.apply(originals.fsyncSync, this, args)
      if (recording && descriptors.has(args[0])) {
        synced.add(args[0])
        observed.fsync += 1
        if (barrier && observed.fsync === faultAt) {
          observed.injected += 1
          throw cause
        }
      }
      return result
    }
    fs.closeSync = function (...args) {
      const result = Reflect.apply(originals.closeSync, this, args)
      if (recording && synced.has(args[0])) observed.close += 1
      descriptors.delete(args[0])
      synced.delete(args[0])
      return result
    }
    fs.rmSync = function (...args) {
      const owned = recording && typeof args[0] === 'string' && path.resolve(args[0]) === lock
      if (owned) {
        assert.equal(JSON.parse(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8')).pid, process.pid)
        observed.release += 1
      }
      const result = Reflect.apply(originals.rmSync, this, args)
      if (owned && !barrier && observed.release === faultAt) {
        assert.equal(fs.existsSync(lock), false)
        observed.injected += 1
        throw cause
      }
      return result
    }
    syncBuiltinESMExports()
    surface = await import('../../../../dist/Verification/JournalPortObservationSurface.js')
    handle = await surface.openActualJournal(commonDir, writerId, new Date().toISOString())
    const initial = surface.observeActualJournal(handle)
    assert.equal(fs.existsSync(file), false, 'Lazy journal acquisition writes nothing')
    recording = true
    const first = await surface.appendActualJournal(handle)
    const afterFirst = surface.observeActualJournal(handle)
    const firstCauseSame = first.error.cause === cause
    const liveInit = surface.containsActualJournalEvent(handle, initial.initEventId)
    const liveBusiness = surface.containsActualJournalEvent(handle, first.error.eventId)
    const beforeSecond = { ...observed }
    const second = await surface.appendActualJournal(handle)
    const afterSecond = surface.observeActualJournal(handle)
    assert.deepEqual(observed, beforeSecond, 'The poisoned writer performs no further store I/O')
    assert.equal(second.error.cause, cause, 'The poison retains the original native cause object')
    assert.equal(second.error.failedEventId, first.error.failedEventId)
    assert.equal(descriptors.size, 0)
    assert.equal(synced.size, 0)
    assert.equal(fs.existsSync(lock), false)
    const bytes = fs.readFileSync(file)
    const lines = bytes.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line))
    return {
      pid: process.pid, initial, afterFirst, afterSecond, observed, first, second,
      firstCauseSame, secondCauseSame: second.error.cause === cause,
      liveInit, liveBusiness, ids: lines.map(event => event.event_id),
      bytesBase64: bytes.toString('base64'), lockReleased: !fs.existsSync(lock),
    }
  } finally {
    recording = false
    try {
      if (handle !== undefined) await surface.disposeActualJournal(handle)
    } finally {
      Object.assign(fs, originals)
      syncBuiltinESMExports()
    }
  }
}

const result = mode === 'cold' ? await cold() : await measure()
process.stdout.write(JSON.stringify(result, (_key, value) => typeof value === 'bigint' ? value.toString() : value))
