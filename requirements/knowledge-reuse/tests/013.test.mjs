import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'smol-toml'
import { runVerificationToolProbe } from '../../../scripts/lib/verification-tool-probe.mjs'
import * as eventStore from '../../../dist/Persistence/EventStore/Surface.js'
import * as casebook from '../../../dist/Repository/Knowledge/Casebook/Surface.js'
import * as index from '../../../dist/Repository/Knowledge/Casebook/IndexSurface.js'
import * as fetchSurface from '../../../dist/Repository/Knowledge/Casebook/FetchSurface.js'
import * as bookkeeper from '../../../dist/Repository/Knowledge/Casebook/BookkeeperSurface.js'
import * as settlements from '../../../dist/Repository/Knowledge/Casebook/SettlementSurface.js'
import * as lifecycle from '../../../dist/Repository/Knowledge/Casebook/LifecycleSurface.js'
import * as hostFinalize from '../../../dist/OpenCode/Plugin/PluginHostWiringSurface.js'
import { createCase } from './support/casebook.mjs'
import { CANONICAL_Q, CANONICAL_A, installBookkeeperRuntime, scriptedBookkeeperPort } from './support/bookkeeper-session-support.mjs'

for (const operation of ['Refresh', 'Access']) {
  for (const settlement of ['committed', 'CurrentCommitUnknown']) {
    test(`WHAT[knowledge-reuse-013] controlled malformed payload ${operation} ${settlement} refuses a normal fetch answer after actual cut settlement and cold reopen`, async t => {
      const directory = mkdtempSync(join(tmpdir(), 'wxs-casebook-cut-'))
      mkdirSync(join(directory, '.wanxiang', 'casebook'), { recursive: true })
      let handle
      const cause = new Error('original Casebook Current commit cause')
      const observed = []
      const incidents = []
      const owner = settlements.createOwner(incident => {
        assert.equal(observed.length, 1, 'the original Store result settles before delivery')
        incidents.push(incident)
      })
      try {
        handle = eventStore.create(directory, 'setup')
        const identity = `case-cut-${operation}-${settlement}`
        const { baseline, shelfmark } = await createCase({ dir: directory, store: handle }, identity)
        const before = await casebook.fetchCaseByIdentity(handle, identity)
        const baselineEntry = JSON.parse(baseline)['subject.txt']
        assert.equal(baselineEntry.kind, 'Present')
        const baselineBytes = Buffer.from(await eventStore.readPayload(handle, baselineEntry.payloadRef))
        assert.equal(baselineBytes.toString('utf8'), 'version-B')
        await index.refresh(handle, 256)
        const beforeIndex = index.tryGet()
        const eventsDirectory = join(directory, 'wanxiangshu', 'events')
        const setupFile = join(eventsDirectory, 'setup.ndjson')
        const setupBytes = readFileSync(setupFile)
        eventStore.dispose(handle)
        handle = undefined

        const writer = settlement === 'CurrentCommitUnknown' ? 'faulted-operation' : 'operation'
        handle = settlement === 'CurrentCommitUnknown'
          ? eventStore.createWithCurrentCommitFault(directory, writer, cause, false)
          : eventStore.create(directory, writer)
        const wrapped = eventStore.createAppendPayloadStore(handle, true, observation => observed.push(observation))
        const { port, createCalls, programCalls } = scriptedBookkeeperPort()
        if (operation === 'Refresh') {
          installBookkeeperRuntime(port, [identity])
          writeFileSync(join(directory, 'subject.txt'), 'version-C')
        } else {
          bookkeeper.resetRuntime()
        }
        const tool = fetchSurface.contract(
          { tool: { schema: { string: () => ({}) } } }, directory, wrapped, owner,
        )
        let response
        let rejection
        try {
          response = await tool.execute({ shelfmark }, { sessionID: 'reader', agent: 'engineer' })
        } catch (error) {
          rejection = error
        }

        assert.equal(createCalls.length, operation === 'Refresh' ? 1 : 0)
        assert.equal(programCalls.length, operation === 'Refresh' ? 1 : 0)
        assert.equal(observed.length, 1, 'a settled cut is never retried with a fresh event identity')
        const { originalRequested, append } = observed[0]
        assert.equal(originalRequested.length, 1)
        assert.equal(append.requested.length, 1)
        assert.equal(originalRequested[0].type, operation === 'Refresh' ? 'EngineerCaseRefreshed' : 'EngineerCaseAccessed')
        assert.equal(originalRequested[0].payload.identity, identity)
        assert.equal(append.requested[0].id, originalRequested[0].id)
        assert.deepEqual(append.requested[0].payload, {}, 'only the explicitly injected payload is malformed')
        assert.equal(append.cuts.length, 1)
        const cut = append.cuts[0]
        assert.equal(cut.rule, 'Casebook')
        assert.equal(cut.failedEventId, originalRequested[0].id)
        if (settlement === 'CurrentCommitUnknown') {
          assert.equal(append.error.code, 'CommitUnknown')
          assert.equal(append.error.phase, 'CurrentCommit')
          assert.strictEqual(append.error.cause, cause)
          assert.deepEqual(append.error.cleanupFailures, [])
          assert.deepEqual(append.error.requested, append.requested)
          assert.deepEqual(append.error.prepared.durableEvents.map(event => event.id), [cut.failedEventId, cut.cutEventId])
          assert.deepEqual(append.error.prepared.cuts, [cut])
        } else {
          assert.equal(append.error, null)
        }
        assert.equal(incidents.length, 1)
        const incident = settlements.describeIncident(incidents[0])
        assert.equal(incident.operation, operation)
        assert.equal(incident.caseIdentity, identity)
        assert.equal(incident.eventId, originalRequested[0].id)
        assert.deepEqual(incident.cuts, append.cuts)
        assert.equal(incident.failure.eventId, originalRequested[0].id)
        if (settlement === 'CurrentCommitUnknown') {
          assert.equal(incident.failure.isOriginalError(append.originalError), true)
          assert.equal(incident.sharesPreparedWithError(append.originalError), true)
          assert.strictEqual(incident.failure.primary.cause, cause)
          assert.deepEqual(incident.failure.cleanupFailures, [])
        }
        assert.deepEqual(index.tryGet(), beforeIndex, 'cut handling does not advance the provider index epoch')
        assert.deepEqual(readFileSync(setupFile), setupBytes, 'original capture canonical bytes are retained')

        const operationFile = join(eventsDirectory, `${writer}.ndjson`)
        const operationBytes = readFileSync(operationFile)
        const physicalFacts = operationBytes.toString('utf8').trimEnd().split('\n').map(JSON.parse)
        assert.deepEqual(physicalFacts.map(event => event.event_id), [cut.failedEventId, cut.cutEventId])
        assert.equal(physicalFacts[0].event_type, originalRequested[0].type)
        assert.deepEqual(physicalFacts[0].payload, {})
        assert.equal(physicalFacts[1].event_type, 'ProjectionCutTail')
        assert.equal(physicalFacts[1].payload.rule, 'Casebook')
        assert.equal(physicalFacts[1].payload.failed_event_id, cut.failedEventId)
        assert.deepEqual(physicalFacts[1].parents, [cut.failedEventId])
        for (let delivery = 0; delivery < 2; delivery += 1) {
          assert.throws(() => settlements.observeIncident(owner, incidents[0]), error => error === incidents[0])
        }
        assert.equal(incidents.length, 1, 'one incident has one callback owner')
        assert.equal(observed.length, 1, 'redelivery cannot append again')
        const foreignCallbacks = []
        const foreignOwner = settlements.createOwner(incident => foreignCallbacks.push(incident))
        assert.throws(
          () => settlements.observeIncident(foreignOwner, incidents[0]),
          /original settled owner/,
          'another owner cannot adopt an already settled incident'
        )
        assert.deepEqual(foreignCallbacks, [])
        assert.deepEqual(readFileSync(operationFile), operationBytes)
        assert.deepEqual(index.tryGet(), beforeIndex)

        eventStore.dispose(handle)
        handle = undefined
        handle = eventStore.create(directory, 'cold-reader')
        const badFact = eventStore.read(handle, cut.failedEventId)
        const cutFact = eventStore.read(handle, cut.cutEventId)
        assert.equal(badFact.id, originalRequested[0].id)
        assert.equal(badFact.type, originalRequested[0].type)
        assert.deepEqual(badFact.payload, {})
        assert.equal(cutFact.type, 'ProjectionCutTail')
        assert.equal(cutFact.payload.rule, 'Casebook')
        assert.equal(cutFact.payload.failed_event_id, badFact.id)
        assert.deepEqual(cutFact.parents, [badFact.id])
        assert.deepEqual(readFileSync(operationFile), operationBytes, 'cold reopen adds no further settlement events')
        assert.deepEqual(readFileSync(setupFile), setupBytes)
        assert.deepEqual(readdirSync(eventsDirectory).sort(), ['setup.ndjson', `${writer}.ndjson`].sort())
        assert.deepEqual(Buffer.from(await eventStore.readPayload(handle, baselineEntry.payloadRef)), baselineBytes)
        // Casebook's current cut reset preserves its last-good projection.
        const current = await casebook.fetchCaseByIdentity(handle, identity)
        assert.deepEqual(current, before)
        assert.equal(current.completionFileState, baseline)
        assert.equal(current.maintenanceFileState, baseline)
        assert.deepEqual(index.tryGet(), beforeIndex)

        eventStore.dispose(handle)
        handle = undefined
        const env = { ...process.env }
        delete env.NODE_TEST_CONTEXT
        const cold = JSON.parse(await runVerificationToolProbe(process.execPath, [
          fileURLToPath(new URL('./support/cut-cold-child.mjs', import.meta.url)), directory,
          JSON.stringify({ writer, setupBytes: setupBytes.toString('base64'), operationBytes: operationBytes.toString('base64'),
            failedEventId: cut.failedEventId, cutEventId: cut.cutEventId, identity,
            before: { ...before, accessOrder: before.accessOrder.toString(), lastAccessOrder: before.lastAccessOrder.toString() }, baseline,
            payloadRef: baselineEntry.payloadRef, payloadBytes: baselineBytes.toString('base64') }),
        ], { cwd: directory, env, signal: t.signal }).catch(error => {
          if (error.stderr) error.message += '\n' + error.stderr
          throw error
        }))
        assert.notEqual(cold.pid, process.pid)
        assert.deepEqual({ ...cold.current, accessOrder: BigInt(cold.current.accessOrder), lastAccessOrder: BigInt(cold.current.lastAccessOrder) }, before)

        assert.equal(response, undefined,
          `settled Casebook cut must refuse a normal fetch answer; returned=${String(response)}`)
        assert.equal(settlements.isIncident(rejection), true)
        assert.strictEqual(rejection, incidents[0], 'a returning capability still rejects with the original typed incident')
      } finally {
        bookkeeper.resetRuntime()
        if (handle) eventStore.dispose(handle)
        rmSync(directory, { recursive: true, force: true })
      }
    })
  }
}

for (const operation of ['Refresh', 'Access']) {
  const fates = ['success', 'CurrentCommitUnknown', 'AppendNotAttempted', 'NoNewWriteReleaseFailed', 'cut-callback-throws']
  if (operation === 'Access') fates.push('ordinary-observer-throws')
  for (const fate of fates) {
    test(`WHAT[knowledge-reuse-013] actual fetch ${operation} ${fate} preserves its settlement boundary`, async () => {
      const directory = mkdtempSync(join(tmpdir(), 'wxs-casebook-control-'))
      mkdirSync(join(directory, '.wanxiang', 'casebook'), { recursive: true })
      const cause = new Error('original ordinary Current commit cause')
      const sentinel = new Error(`original ${fate} exception`)
      const observed = []
      const incidents = []
      const cut = fate === 'cut-callback-throws'
      const controlled = fate === 'AppendNotAttempted' || fate === 'NoNewWriteReleaseFailed'
      const owner = settlements.createOwner(incident => {
        if (!cut) assert.fail('ordinary append settlement must not deliver a semantic-cut incident')
        incidents.push(incident)
        throw sentinel
      })
      let handle
      try {
        handle = eventStore.create(directory, 'setup')
        const identity = `control-${operation}-${fate}`
        const { baseline, shelfmark } = await createCase({ dir: directory, store: handle }, identity)
        const before = await casebook.fetchCaseByIdentity(handle, identity)
        const eventsDirectory = join(directory, 'wanxiangshu', 'events')
        const setupBytes = readFileSync(join(eventsDirectory, 'setup.ndjson'))
        eventStore.dispose(handle)
        handle = fate === 'CurrentCommitUnknown'
          ? eventStore.createWithCurrentCommitFault(directory, 'operation', cause, false)
          : eventStore.create(directory, 'operation')
        const onAppend = observation => {
          observed.push(observation)
          if (fate === 'ordinary-observer-throws') throw sentinel
        }
        const wrapped = controlled
          ? eventStore.createAppendFailureStore(handle, {
            code: fate, phase: fate === 'AppendNotAttempted' ? 'BeforePhysicalAppend' : 'StoreRelease', cause,
          }, append => onAppend({ append }))
          : eventStore.createAppendPayloadStore(handle, cut, onAppend)
        const { port, createCalls, programCalls } = scriptedBookkeeperPort()
        if (operation === 'Refresh') {
          installBookkeeperRuntime(port, [identity])
          writeFileSync(join(directory, 'subject.txt'), 'version-C')
        } else bookkeeper.resetRuntime()
        const tool = fetchSurface.contract({ tool: { schema: { string: () => ({}) } } }, directory, wrapped, owner)
        let response
        let rejection
        try {
          response = await tool.execute({ shelfmark }, { sessionID: 'reader', agent: 'engineer' })
        } catch (error) {
          rejection = error
        }
        assert.equal(createCalls.length, operation === 'Refresh' ? 1 : 0)
        assert.equal(programCalls.length, operation === 'Refresh' ? 1 : 0)
        const expectedAppends = operation === 'Refresh' && fate === 'success' ? 2 : 1
        assert.equal(observed.length, expectedAppends, 'a failed append is never retried')
        const append = observed[0].append
        assert.equal(append.requested[0].type, operation === 'Refresh' ? 'EngineerCaseRefreshed' : 'EngineerCaseAccessed')
        if (fate === 'CurrentCommitUnknown') {
          assert.equal(append.error.code, 'CommitUnknown')
          assert.equal(append.error.phase, 'CurrentCommit')
          assert.strictEqual(append.error.cause, cause)
          assert.deepEqual(append.error.prepared.cuts, [])
          assert.deepEqual(append.error.prepared.durableEvents.map(event => event.id), [append.requested[0].id])
        } else if (controlled) {
          assert.equal(append.error.code, fate)
          assert.strictEqual(append.error.cause, cause)
          assert.equal(append.error.prepared, null)
        } else assert.equal(append.error, null)
        assert.equal(append.cuts.length, cut ? 1 : 0)
        if (cut) {
          assert.strictEqual(rejection, sentinel, 'the injected fatal capability exception is not swallowed or replaced')
          assert.equal(response, undefined)
          assert.equal(incidents.length, 1)
          assert.equal(settlements.isIncident(incidents[0]), true)
          assert.deepEqual(settlements.describeIncident(incidents[0]).cuts, append.cuts)
        } else {
          assert.equal(rejection, undefined)
          assert.equal(incidents.length, 0)
          assert.equal(parse(response).answer, operation === 'Refresh' && fate === 'success' ? CANONICAL_A : 'Answer B')
          const consequence = operation === 'Refresh'
            ? fate === 'success' ? /was maintained from differences|已根据关联文件差异维护/ : /Maintenance could not|未能根据所给文件 diff/
            : /No change was found|没有变化/
          assert.match(response, consequence)
        }
        const files = readdirSync(eventsDirectory)
        const operationFile = join(eventsDirectory, 'operation.ndjson')
        const operationBytes = files.includes('operation.ndjson') ? readFileSync(operationFile) : null
        const facts = operationBytes ? operationBytes.toString('utf8').trimEnd().split('\n').map(JSON.parse) : []
        if (controlled) {
          assert.equal(facts.length, 0, 'only this controlled non-writing port is known not to append')
        } else {
          assert.equal(facts.length, cut ? 2 : expectedAppends)
          assert.equal(facts[0].event_id, append.requested[0].id)
          assert.equal(facts[0].event_type, append.requested[0].type)
          assert.deepEqual(facts[0].payload, append.requested[0].payload)
          if (cut) assert.equal(facts[1].event_type, 'ProjectionCutTail')
        }
        assert.deepEqual(readFileSync(join(eventsDirectory, 'setup.ndjson')), setupBytes)
        eventStore.dispose(handle)
        handle = eventStore.create(directory, 'cold-reader')
        const current = await casebook.fetchCaseByIdentity(handle, identity)
        assert.equal(current.completionFileState, baseline)
        if (controlled || cut) assert.deepEqual(current, before)
        else if (operation === 'Refresh') {
          assert.equal(current.q, CANONICAL_Q)
          assert.equal(current.a, CANONICAL_A)
          assert.notEqual(current.maintenanceFileState, baseline)
        } else {
          assert.equal(current.a, before.a)
          assert.equal(current.maintenanceFileState, baseline)
          assert.ok(Number(current.accessOrder) > Number(before.accessOrder))
        }
        if (!controlled) {
          assert.equal(eventStore.read(handle, append.requested[0].id).type, append.requested[0].type,
            'CurrentCommitUnknown and an observer exception can follow actual durable bytes')
          assert.deepEqual(readFileSync(operationFile), operationBytes, 'cold replay appends no extra fact')
        }
        assert.deepEqual(readFileSync(join(eventsDirectory, 'setup.ndjson')), setupBytes)
      } finally {
        bookkeeper.resetRuntime()
        if (handle) eventStore.dispose(handle)
        rmSync(directory, { recursive: true, force: true })
      }
    })
  }
}

test('WHAT[knowledge-reuse-013] the native owner requires its capability and rejects an incident descriptor without an original settled carrier', () => {
  assert.throws(() => settlements.createOwner(null), /onIncident/)
  const callbacks = []
  const owner = settlements.createOwner(value => callbacks.push(value))
  const descriptor = { operation: 'Access', caseIdentity: 'unsettled', eventId: 'invented', cuts: [] }
  assert.equal(settlements.isIncident(descriptor), false)
  assert.throws(() => settlements.describeIncident(descriptor), /original settled owner/)
  assert.throws(() => settlements.observeIncident(owner, descriptor), /original settled owner/)
  assert.deepEqual(callbacks, [])
})

for (const malformed of [false, true]) {
  for (const unknown of [false, true]) {
    const fate = unknown ? 'CurrentCommitUnknown' : 'committed'
    test(`WHAT[knowledge-reuse-013] actual Lifecycle Capture ${malformed ? 'controlled malformed payload' : 'valid payload'} ${fate} preserves the original settlement and durable projection`, async t => {
      const directory = mkdtempSync(join(tmpdir(), 'wxs-casebook-capture-'))
      mkdirSync(join(directory, '.wanxiang', 'casebook'), { recursive: true })
      const cause = new Error('original Capture Current commit cause')
      const observed = []
      let handle
      try {
        handle = eventStore.create(directory, 'setup')
        const oldIdentity = `prior-Capture-${malformed}-${fate}`
        const identity = `new-Capture-${malformed}-${fate}`
        const trace = `logical-trace-${identity}`
        const question = 'Capture original question'
        const answer = 'Capture original answer'
        const { baseline } = await createCase({ dir: directory, store: handle }, oldIdentity)
        const before = await casebook.fetchCaseByIdentity(handle, oldIdentity)
        const payloadRef = JSON.parse(baseline)['subject.txt'].payloadRef
        const payloadBytes = Buffer.from(await eventStore.readPayload(handle, payloadRef))
        assert.equal(payloadBytes.toString('utf8'), 'version-B')
        await index.refresh(handle, 256)
        const beforeIndex = index.tryGet()
        const eventsDirectory = join(directory, 'wanxiangshu', 'events')
        const setupFile = join(eventsDirectory, 'setup.ndjson')
        const setupBytes = readFileSync(setupFile)
        eventStore.dispose(handle)
        handle = undefined

        handle = unknown
          ? eventStore.createWithCurrentCommitFault(directory, 'operation', cause, false)
          : eventStore.create(directory, 'operation')
        const wrapped = eventStore.createAppendPayloadStore(handle, malformed, value => observed.push(value))
        const result = await lifecycle.finalizeEngineerCase(
          wrapped, identity, trace, question, answer, ['subject.txt'], baseline,
        )
        assert.equal(observed.length, 1, 'the Capture producer never retries the original append')
        const { originalRequested, append } = observed[0]
        assert.equal(originalRequested.length, 1)
        assert.equal(append.requested.length, 1)
        const requested = originalRequested[0]
        assert.equal(requested.type, 'EngineerCaseCaptured')
        assert.equal(requested.payload.identity, identity)
        assert.equal(requested.payload.source_trace, trace)
        assert.equal(requested.payload.q, question)
        assert.equal(requested.payload.a, answer)
        assert.deepEqual(requested.payload.related_paths, ['subject.txt'])
        assert.equal(requested.payload.completion_file_state, baseline)
        assert.equal(requested.payload.maintenance_file_state, baseline)
        assert.equal(append.requested[0].id, requested.id)
        assert.deepEqual(append.requested[0].parents, requested.parents)
        assert.deepEqual(append.requested[0].payload, malformed ? {} : requested.payload)
        assert.equal(append.cuts.length, malformed ? 1 : 0)
        const cut = append.cuts[0]
        if (malformed) {
          assert.equal(cut.rule, 'Casebook')
          assert.equal(cut.failedEventId, requested.id)
        }
        if (unknown) {
          assert.equal(append.error.code, 'CommitUnknown')
          assert.equal(append.error.phase, 'CurrentCommit')
          assert.strictEqual(append.error.cause, cause)
          assert.deepEqual(append.error.cleanupFailures, [])
          assert.deepEqual(append.error.requested, append.requested)
          assert.deepEqual(append.error.prepared.cuts, append.cuts)
          assert.deepEqual(append.error.prepared.durableEvents.map(event => event.id),
            malformed ? [requested.id, cut.cutEventId] : [requested.id])
        } else assert.equal(append.error, null)

        if (malformed || unknown) {
          assert.equal(result.ok, false)
          assert.equal(result.releasesIdentity, false)
          assert.equal(result.kind, unknown ? 'unknown' : 'notCommitted')
          assert.equal(result.code, unknown ? 'CASEBOOK_APPEND_COMMIT_UNKNOWN' : 'CASEBOOK_APPEND_FAILED')
          assert.equal(result.persistenceFailure.operation, 'Capture')
          assert.equal(result.persistenceFailure.caseIdentity, identity)
          assert.equal(result.persistenceFailure.eventId, requested.id)
          if (unknown) {
            assert.equal(result.persistenceFailure.isOriginalError(append.originalError), true)
            assert.strictEqual(result.persistenceFailure.primary.cause, cause)
            assert.equal(result.persistenceFailure.primary.phase, 'CurrentCommit')
            assert.deepEqual(result.persistenceFailure.cleanupFailures, [])
            assert.deepEqual(result.persistenceFailure.requestedEventIds, [requested.id])
            assert.deepEqual(result.persistenceFailure.preparedEventIds,
              malformed ? [requested.id, cut.cutEventId] : [requested.id])
          }
          assert.deepEqual(index.tryGet(), beforeIndex, 'failed Capture does not publish a new provider index epoch')
        } else {
          assert.equal(result.ok, true)
          assert.equal(result.releasesIdentity, true)
          assert.equal(result.persistenceFailure, undefined)
          assert.ok(index.tryGet().epoch > beforeIndex.epoch)
          assert.ok(index.tryGet().cases.some(entry => entry.question === question))
        }
        assert.deepEqual(await casebook.fetchCaseByIdentity(handle, oldIdentity), before)
        if (malformed || unknown) {
          assert.equal(await casebook.fetchCaseByIdentity(handle, identity), null,
            'the failed Capture does not publish a new live Case')
        }
        const operationFile = join(eventsDirectory, 'operation.ndjson')
        const operationBytes = readFileSync(operationFile)
        const facts = operationBytes.toString('utf8').trimEnd().split('\n').map(JSON.parse)
        assert.equal(facts.length, malformed ? 2 : 1)
        assert.equal(facts[0].event_id, requested.id)
        assert.equal(facts[0].event_type, 'EngineerCaseCaptured')
        assert.deepEqual(facts[0].payload, append.requested[0].payload)
        if (malformed) {
          assert.equal(facts[1].event_id, cut.cutEventId)
          assert.equal(facts[1].event_type, 'ProjectionCutTail')
          assert.equal(facts[1].payload.rule, 'Casebook')
          assert.equal(facts[1].payload.failed_event_id, requested.id)
          assert.deepEqual(facts[1].parents, [requested.id])
        }
        assert.deepEqual(readFileSync(setupFile), setupBytes)
        eventStore.dispose(handle)
        handle = undefined
        handle = eventStore.create(directory, 'cold-reader')
        assert.deepEqual(await casebook.fetchCaseByIdentity(handle, oldIdentity), before)
        const current = await casebook.fetchCaseByIdentity(handle, identity)
        if (malformed) assert.equal(current, null)
        else {
          assert.equal(current.identity, identity)
          assert.equal(current.sourceTrace, trace)
          assert.equal(current.q, question)
          assert.equal(current.a, answer)
          assert.equal(current.completionFileState, baseline)
          assert.equal(current.maintenanceFileState, baseline)
        }
        assert.equal(eventStore.read(handle, requested.id).type, 'EngineerCaseCaptured',
          'ordinary CurrentCommitUnknown can follow actual durable Capture bytes')
        assert.deepEqual(Buffer.from(await eventStore.readPayload(handle, payloadRef)), payloadBytes)
        assert.deepEqual(readFileSync(operationFile), operationBytes)
        assert.deepEqual(readFileSync(setupFile), setupBytes)
        assert.deepEqual(readdirSync(eventsDirectory).sort(), ['operation.ndjson', 'setup.ndjson'])
        if (malformed) {
          eventStore.dispose(handle)
          handle = undefined
          const env = { ...process.env }
          delete env.NODE_TEST_CONTEXT
          const cold = JSON.parse(await runVerificationToolProbe(process.execPath, [
            fileURLToPath(new URL('./support/cut-cold-child.mjs', import.meta.url)), directory,
            JSON.stringify({ writer: 'operation', setupBytes: setupBytes.toString('base64'),
              operationBytes: operationBytes.toString('base64'), failedEventId: requested.id,
              cutEventId: cut.cutEventId, identity: oldIdentity, missingIdentity: identity,
              before: { ...before, accessOrder: before.accessOrder.toString(), lastAccessOrder: before.lastAccessOrder.toString() },
              baseline, payloadRef, payloadBytes: payloadBytes.toString('base64') }),
          ], { cwd: directory, env, signal: t.signal }).catch(error => {
            if (error.stderr) error.message += '\n' + error.stderr
            throw error
          }))
          assert.notEqual(cold.pid, process.pid)
          assert.equal(cold.missingIdentity, identity)
          assert.deepEqual({ ...cold.current, accessOrder: BigInt(cold.current.accessOrder),
            lastAccessOrder: BigInt(cold.current.lastAccessOrder) }, before)
          assert.deepEqual(readFileSync(operationFile), operationBytes)
          assert.deepEqual(readFileSync(setupFile), setupBytes)
        }
      } finally {
        if (handle) eventStore.dispose(handle)
        rmSync(directory, { recursive: true, force: true })
      }
    })
  }
}

for (const scenario of [
  { unknown: false, callbackThrows: false }, { unknown: true, callbackThrows: false },
  { unknown: false, callbackThrows: true }, { unknown: true, callbackThrows: true },
]) {
  const { unknown, callbackThrows } = scenario
  test(`WHAT[knowledge-reuse-013] original Host finalization helper refuses controlled malformed Capture ${unknown ? 'CurrentCommitUnknown' : 'committed'} with ${callbackThrows ? 'throwing' : 'returning'} owner after real Bookkeeper settlement`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'wxs-casebook-host-finalize-'))
    mkdirSync(join(directory, '.wanxiang', 'casebook'), { recursive: true })
    const cause = new Error('original Host Capture Current commit cause')
    const observed = []
    const incidents = []
    const callbackError = new Error('original Capture owner callback error')
    const owner = settlements.createOwner(incident => {
      assert.equal(observed.length, 1, 'actual Capture settles before its original owner receives the incident')
      incidents.push(incident)
      if (callbackThrows) throw callbackError
    })
    const identity = `host-Capture-${unknown}`
    const oldIdentity = `prior-${identity}`
    let handle
    try {
      handle = eventStore.create(directory, 'setup')
      const { baseline } = await createCase({ dir: directory, store: handle }, oldIdentity)
      const before = await casebook.fetchCaseByIdentity(handle, oldIdentity)
      const payloadRef = JSON.parse(baseline)['subject.txt'].payloadRef
      const payloadBytes = Buffer.from(await eventStore.readPayload(handle, payloadRef))
      await index.refresh(handle, 256)
      const beforeIndex = index.tryGet()
      const eventsDirectory = join(directory, 'wanxiangshu', 'events')
      const setupFile = join(eventsDirectory, 'setup.ndjson')
      const setupBytes = readFileSync(setupFile)
      eventStore.dispose(handle)
      handle = unknown
        ? eventStore.createWithCurrentCommitFault(directory, 'operation', cause, false)
        : eventStore.create(directory, 'operation')
      const wrapped = eventStore.createAppendPayloadStore(handle, true, value => observed.push(value))
      const { port, createCalls, programCalls, prompts } = scriptedBookkeeperPort()
      installBookkeeperRuntime(port, [identity])
      lifecycle.notePrompt(identity, 'Original delegated investigation')
      lifecycle.noteAnswer(identity, 'Original completed Engineer result')
      lifecycle.collect(identity, 'read', { path: 'subject.txt' }, 'version-B')
      let response
      let rejection
      try {
        response = await hostFinalize.finalizeDraft(directory, wrapped, identity, owner)
      } catch (error) {
        rejection = error
      }
      assert.equal(createCalls.length, 1)
      assert.equal(createCalls[0].physicalParentId, undefined)
      assert.equal(programCalls.length, 1)
      assert.ok(prompts.some(text => text.includes('CaseFinalize')))
      assert.equal(observed.length, 1, 'the real finalized Capture is never retried')
      const { originalRequested, append } = observed[0]
      assert.equal(originalRequested.length, 1)
      const original = originalRequested[0]
      assert.equal(original.type, 'EngineerCaseCaptured')
      assert.equal(original.payload.identity, identity)
      assert.equal(original.payload.source_trace, identity)
      assert.equal(original.payload.q, CANONICAL_Q)
      assert.equal(original.payload.a, CANONICAL_A)
      assert.deepEqual(original.payload.related_paths, ['subject.txt'])
      assert.equal(original.payload.completion_file_state, baseline)
      assert.equal(original.payload.maintenance_file_state, baseline)
      assert.equal(append.requested[0].id, original.id)
      assert.deepEqual(append.requested[0].payload, {})
      assert.equal(append.cuts.length, 1)
      const cut = append.cuts[0]
      assert.equal(cut.rule, 'Casebook')
      assert.equal(cut.failedEventId, original.id)
      if (unknown) {
        assert.equal(append.error.code, 'CommitUnknown')
        assert.equal(append.error.phase, 'CurrentCommit')
        assert.strictEqual(append.error.cause, cause)
        assert.deepEqual(append.error.prepared.cuts, [cut])
        assert.deepEqual(append.error.prepared.durableEvents.map(event => event.id), [original.id, cut.cutEventId])
      } else assert.equal(append.error, null)
      if (response !== undefined) {
        assert.equal(response.identity, identity)
        assert.equal(response.releasesIdentity, false)
        assert.equal(response.persistenceFailure.operation, 'Capture')
        assert.equal(response.persistenceFailure.eventId, original.id)
        if (unknown) assert.equal(response.persistenceFailure.isOriginalError(append.originalError), true)
      }
      assert.deepEqual(index.tryGet(), beforeIndex)
      assert.deepEqual(await casebook.fetchCaseByIdentity(handle, oldIdentity), before)
      const operationFile = join(eventsDirectory, 'operation.ndjson')
      const operationBytes = readFileSync(operationFile)
      const facts = operationBytes.toString('utf8').trimEnd().split('\n').map(JSON.parse)
      assert.deepEqual(facts.map(event => event.event_id), [original.id, cut.cutEventId])
      assert.equal(facts[0].event_type, 'EngineerCaseCaptured')
      assert.deepEqual(facts[0].payload, {})
      assert.equal(facts[1].event_type, 'ProjectionCutTail')
      assert.equal(facts[1].payload.failed_event_id, original.id)
      assert.deepEqual(facts[1].parents, [original.id])
      eventStore.dispose(handle)
      handle = eventStore.create(directory, 'cold-reader')
      assert.deepEqual(await casebook.fetchCaseByIdentity(handle, oldIdentity), before)
      assert.equal(await casebook.fetchCaseByIdentity(handle, identity), null)
      assert.deepEqual(Buffer.from(await eventStore.readPayload(handle, payloadRef)), payloadBytes)
      assert.deepEqual(readFileSync(operationFile), operationBytes)
      assert.deepEqual(readFileSync(setupFile), setupBytes)
      assert.deepEqual(index.tryGet(), beforeIndex)
      assert.equal(response, undefined, 'an actual Capture cut must not return a normal Host finalization settlement')
      assert.equal(incidents.length, 1)
      assert.strictEqual(rejection, callbackThrows ? callbackError : incidents[0])
      assert.equal(settlements.isIncident(incidents[0]), true)
      const incident = settlements.describeIncident(incidents[0])
      assert.equal(incident.operation, 'Capture')
      assert.equal(incident.caseIdentity, identity)
      assert.equal(incident.eventId, original.id)
      assert.deepEqual(incident.cuts, [cut])
      if (unknown) {
        assert.equal(incident.failure.isOriginalError(append.originalError), true)
        assert.equal(incident.sharesPreparedWithError(append.originalError), true)
        assert.strictEqual(incident.failure.primary.cause, cause)
      }
    } finally {
      lifecycle.cleanup(identity)
      bookkeeper.resetRuntime()
      if (handle) eventStore.dispose(handle)
      rmSync(directory, { recursive: true, force: true })
    }
  })
}

for (const fate of ['success', 'CurrentCommitUnknown', 'observer-throws']) {
  test(`WHAT[knowledge-reuse-013] original Host finalization ${fate} without cuts retains the ordinary settlement after actual Capture`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'wxs-host-capture-control-'))
    mkdirSync(join(directory, '.wanxiang', 'casebook'), { recursive: true })
    writeFileSync(join(directory, 'subject.txt'), 'version-B')
    const identity = `host-control-${fate}`
    const cause = new Error('original ordinary Capture error')
    const observed = []
    const incidents = []
    const owner = settlements.createOwner(value => incidents.push(value))
    let handle
    try {
      handle = fate === 'CurrentCommitUnknown'
        ? eventStore.createWithCurrentCommitFault(directory, 'operation', cause, false)
        : eventStore.create(directory, 'operation')
      const wrapped = eventStore.createAppendPayloadStore(handle, false, value => {
        observed.push(value)
        if (fate === 'observer-throws') throw cause
      })
      const { port, createCalls, programCalls } = scriptedBookkeeperPort()
      installBookkeeperRuntime(port, [identity])
      lifecycle.notePrompt(identity, 'Original completed work')
      lifecycle.noteAnswer(identity, 'Original result')
      lifecycle.collect(identity, 'read', { path: 'subject.txt' }, 'version-B')
      const result = await hostFinalize.finalizeDraft(directory, wrapped, identity, owner)
      assert.equal(result.identity, identity)
      assert.equal(result.releasesIdentity, fate === 'success')
      assert.equal(result.commitment, fate === 'success' ? 'Finalized'
        : fate === 'CurrentCommitUnknown' ? 'PersistenceFailed' : 'Unknown')
      assert.equal(result.reason, fate === 'observer-throws' ? cause.message : null)
      assert.equal(createCalls.length, 1)
      assert.equal(programCalls.length, 1)
      assert.equal(observed.length, 1)
      assert.deepEqual(incidents, [])
      const { originalRequested, append } = observed[0]
      assert.equal(originalRequested[0].type, 'EngineerCaseCaptured')
      assert.deepEqual(append.cuts, [])
      if (fate === 'CurrentCommitUnknown') {
        assert.equal(result.persistenceFailure.isOriginalError(append.originalError), true)
        assert.strictEqual(result.persistenceFailure.primary.cause, cause)
        assert.equal(result.persistenceFailure.primary.phase, 'CurrentCommit')
        assert.equal(await casebook.fetchCaseByIdentity(handle, identity), null)
      } else {
        assert.equal(result.persistenceFailure, null)
        assert.equal(append.error, null)
      }
      const operationFile = join(directory, 'wanxiangshu', 'events', 'operation.ndjson')
      const bytes = readFileSync(operationFile)
      assert.equal(bytes.toString('utf8').trimEnd().split('\n').length, 1)
      eventStore.dispose(handle)
      handle = eventStore.create(directory, 'cold-reader')
      const current = await casebook.fetchCaseByIdentity(handle, identity)
      assert.equal(current.identity, identity, 'ordinary failure can follow actual durable Capture')
      assert.equal(current.q, CANONICAL_Q)
      assert.equal(current.a, CANONICAL_A)
      assert.deepEqual(readFileSync(operationFile), bytes)
      assert.deepEqual(readdirSync(join(directory, 'wanxiangshu', 'events')), ['operation.ndjson'])
    } finally {
      lifecycle.cleanup(identity)
      bookkeeper.resetRuntime()
      if (handle) eventStore.dispose(handle)
      rmSync(directory, { recursive: true, force: true })
    }
  })
}

for (const scenario of ['valid', 'valid-unknown', 'malformed', 'malformed-unknown']) {
  test(`WHAT[knowledge-reuse-013] actual Boot owner ${scenario} reports and terminates its own native process only after original Host Capture settlement`, async t => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'wxs-boot-capture-physical-')))
    const fatal = scenario.startsWith('malformed')
    const unknown = scenario.endsWith('-unknown')
    const env = { ...process.env }
    delete env.NODE_TEST_CONTEXT
    delete env.NODE_OPTIONS
    delete env.WANXIANGSHU_NO_FATAL_EXIT
    const probe = async (entry, args) => {
      try {
        return JSON.parse(await runVerificationToolProbe(process.execPath, [entry, ...args],
          { cwd: directory, env, signal: t.signal }))
      } catch (error) {
        if (error?.stderr && typeof error.message === 'string') error.message += '\n' + error.stderr
        throw error
      }
    }
    let completed = false
    try {
      assert.equal(typeof hostFinalize.finalizeDraftWithBoot, 'function')
      const measured = await probe(fileURLToPath(new URL('./support/boot-capture-physical-coordinator.mjs', import.meta.url)),
        [directory, scenario])
      assert.notEqual(measured.coordinatorPid, process.pid)
      assert.notEqual(measured.pid, measured.coordinatorPid)
      assert.notEqual(measured.pid, process.pid)
      assert.equal(measured.cleanupRequested, false, 'parent cleanup never supplies fatal evidence')
      assert.deepEqual({ exitCode: measured.exitCode, signal: measured.signal }, fatal
        ? { exitCode: null, signal: 'SIGKILL' } : { exitCode: 0, signal: null })
      const receipt = measured.measured
      assert.equal(receipt.pid, measured.pid)
      assert.equal(receipt.parentPid, measured.coordinatorPid)
      assert.equal(receipt.scenario, scenario)
      const { original, requested, cuts, physical } = receipt
      assert.equal(original.type, 'EngineerCaseCaptured')
      assert.equal(original.payload.identity, receipt.identity)
      assert.equal(original.payload.source_trace, receipt.identity)
      assert.equal(original.payload.q, CANONICAL_Q)
      assert.equal(original.payload.a, CANONICAL_A)
      assert.deepEqual(original.payload.related_paths, ['subject.txt'])
      assert.equal(original.payload.completion_file_state, receipt.baseline)
      assert.equal(original.payload.maintenance_file_state, receipt.baseline)
      assert.deepEqual(requested, [{ ...original, payload: fatal ? {} : original.payload }])
      assert.deepEqual(physical.facts[0], requested[0])
      assert.equal(physical.facts.length, fatal ? 2 : 1)
      assert.deepEqual(physical.counts, { append: 1, fsync: 1, close: 1, release: 1 })
      assert.equal(physical.lockReleased, true)
      assert.equal(physical.openDescriptors, 0)
      assert.equal(existsSync(join(directory, '.git', 'wanxiangshu.lock')), false)
      const operationBytes = readFileSync(join(directory, '.git', 'wanxiangshu', 'events', 'operation.ndjson'), 'base64')
      assert.deepEqual(physical.files, { ...receipt.beforeFiles, 'operation.ndjson': operationBytes })
      assert.equal(receipt.bootJournalAvailable, true, 'the actual Boot owns its workspace journal')
      assert.ok(Object.hasOwn(receipt.beforeFiles, 'setup.ndjson'), 'the prior Case has original canonical bytes')
      assert.equal(cuts.length, fatal ? 1 : 0)
      if (unknown) {
        assert.deepEqual(receipt.appendError, { code: 'CommitUnknown', phase: 'CurrentCommit', causeSame: true,
          requested, prepared: { durableEvents: physical.facts, cuts }, cleanupFailures: [], priorRejection: null })
      } else assert.equal(receipt.appendError, null)
      if (fatal) {
        const [cut] = cuts
        assert.equal(cut.rule, 'Casebook')
        assert.equal(cut.failedEventId, original.id)
        const cutFact = physical.facts[1]
        assert.equal(cut.cutEventId, cutFact.id)
        assert.equal(cutFact.type, 'ProjectionCutTail')
        assert.equal(cutFact.payload.rule, 'Casebook')
        assert.equal(cutFact.payload.failed_event_id, original.id)
        assert.deepEqual(cutFact.parents, [original.id])
        assert.notEqual(cutFact.stream, original.stream)
        assert.equal(receipt.indexUnchanged, true)
        assert.equal(measured.returned, null)
        assert.equal(measured.reports.length, 1)
        assert.equal(measured.reports[0].operation, 'casebook-semantic-cut')
        for (const text of ['Capture', receipt.identity, original.id, cut.cutEventId]) {
          assert.ok(measured.reports[0].result.includes(text), text)
        }
        if (unknown) {
          assert.ok(measured.reports[0].result.includes('CurrentCommit'))
          assert.ok(measured.reports[0].result.includes(receipt.causeText))
        }
      } else {
        assert.deepEqual(measured.reports, [])
        assert.equal(measured.returned.identity, receipt.identity)
        assert.equal(measured.returned.commitment, unknown ? 'PersistenceFailed' : 'Finalized')
        assert.equal(measured.returned.releasesIdentity, !unknown)
        if (unknown) {
          assert.equal(receipt.indexUnchanged, true)
          assert.equal(measured.returned.persistenceFailure.primary.phase, 'CurrentCommit')
        }
      }
      const cold = await probe(fileURLToPath(new URL('./support/boot-capture-physical-child.mjs', import.meta.url)),
        ['cold', directory, scenario, JSON.stringify(receipt)])
      for (const pid of [process.pid, measured.pid, measured.coordinatorPid]) assert.notEqual(cold.pid, pid)
      assert.equal(cold.preserved, true)
      assert.deepEqual(cold.before, receipt.before)
      assert.equal(cold.current === null, fatal)
      assert.deepEqual(readdirSync(join(directory, '.git', 'wanxiangshu', 'events')).sort(), Object.keys(physical.files).sort())
      t.diagnostic(JSON.stringify({ scenario, nativePid: measured.pid, coldPid: cold.pid,
        terminal: measured.signal ?? measured.exitCode, originalBootPhysicalAndCold: true }))
      completed = true
    } finally {
      if (completed) rmSync(directory, { recursive: true, force: true })
      else t.diagnostic('CASEBOOK_BOOT_PHYSICAL_FAILURE_EVIDENCE: retained ' + directory)
    }
  })
}

test.todo('WHAT[knowledge-reuse-013] GAP-160: actual Casebook semantic conflict commits or settles its failure cut before a mandatory injected fuse reports and kills once without modifying its projection')
