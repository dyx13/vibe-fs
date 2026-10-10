import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runVerificationToolProbe } from '../../../scripts/lib/verification-tool-probe.mjs'
import * as settlement from '../../../dist/Sphinx/V2/Composition/SettlementSurface.js'
import * as wire from '../../../dist/Sphinx/V2/Wire/Surface.js'
import * as mcp from '../../../dist/Sphinx/V2/Hosts/Mcp/Surface.js'
import * as journals from '../../../dist/Verification/JournalPortObservationSurface.js'
import * as eventStore from '../../../dist/Persistence/EventStore/Surface.js'
import * as eventCodec from '../../../dist/Persistence/EventStore/CodecSurface.js'

const child = fileURLToPath(new URL('./support/sphinx-command-settlement-child.mjs', import.meta.url))
const configuration = {
  commandNamespace: 'settlement-owner', createdBy: 'authorized-controller', profileRef: 'sphinx.default@2',
  executionMode: 'delegated', resourceSpecs: [{ name: 'calls', kind: { case: 'consumed', payload: 'calls' }, authorizedLimit: 0 }],
  renderReserve: { calls: 0 },
}

for (const scenario of ['valid', 'malformed-release', 'valid-release', 'not-attempted-controlled', 'no-new-write-controlled']) {
  test(`WHAT[durable-events-024] actual Sphinx Commands.start ${scenario} preserves its original settlement capability and guard`, async t => {
    assert.equal(typeof settlement.create, 'function')
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'sphinx-command-settlement-')))
    const commonDir = join(root, '.git')
    const sourceWriter = randomUUID()
    const sourceFile = join(commonDir, 'wanxiangshu', 'events', `${sourceWriter}.ndjson`)
    const command = { commandId: 'settlement-' + scenario, goalText: '实际目标\r\nNUL:\u0000；雪 😀 尾部  ',
      constraints: ['preserve the authorized text'], materialRefs: ['material:source'],
      authorizationRef: 'authorized-user', profileRef: configuration.profileRef }
    const controlled = scenario.endsWith('-controlled')
    const malformed = scenario === 'malformed-release'
    const release = scenario.endsWith('-release')
    const env = { ...process.env }
    delete env.NODE_TEST_CONTEXT
    const probe = async (mode, writerId, request) => {
      try {
        return JSON.parse(await runVerificationToolProbe(process.execPath,
          [child, mode, commonDir, writerId, scenario, JSON.stringify(request)],
          { cwd: root, env, signal: t.signal }))
      } catch (error) {
        if (error?.stderr && typeof error.message === 'string') error.message += '\n' + error.stderr
        throw error
      }
    }
    let completed = false
    try {
      const measured = await probe('measure', sourceWriter, { configuration, command })
      assert.notEqual(measured.pid, process.pid)
      const { physical, original, requested } = measured
      const expectedCounts = controlled ? { append: 0, fsync: 0, close: 0, release: 0, injected: 0 }
        : { append: 1, fsync: 1, close: 1, release: 1, injected: release ? 1 : 0 }
      assert.deepEqual(physical.counts, expectedCounts)
      assert.equal(physical.writerCreated, !controlled)
      assert.equal(existsSync(sourceFile), !controlled)
      assert.equal(physical.lockReleased, true)
      assert.equal(physical.openDescriptors, 0)
      assert.equal(physical.syncedDescriptors, 0)
      assert.equal(existsSync(join(commonDir, 'wanxiangshu.lock')), false)
      assert.equal(controlled ? '' : readFileSync(sourceFile, 'base64'), physical.bytes)
      assert.equal(physical.facts.length, controlled ? 0 : malformed ? 2 : 1)
      assert.equal(original.payload.commandId, command.commandId)
      assert.equal(original.payload.inquiry, measured.inquiryId)
      assert.equal(original.payload.events[0].payload.goal.originalText, command.goalText)
      assert.deepEqual(requested, { ...original, payload: malformed ? {} : original.payload })
      if (!controlled) assert.deepEqual(physical.facts[0], requested)

      const coldWriter = randomUUID()
      const cold = await probe('cold', coldWriter, { sourceWriter, inquiryId: measured.inquiryId,
        writerCreated: physical.writerCreated, bytes: physical.bytes, facts: physical.facts, current: physical.current })
      assert.notEqual(cold.pid, measured.pid)
      assert.notEqual(cold.pid, process.pid)
      assert.equal(cold.writerId, coldWriter)
      assert.equal(cold.preserved, true)
      assert.deepEqual(cold.current, physical.current)
      assert.equal(cold.bytes, physical.bytes)
      assert.equal(existsSync(join(commonDir, 'wanxiangshu', 'events', `${coldWriter}.ndjson`)), false)
      assert.equal(controlled ? '' : readFileSync(sourceFile, 'base64'), physical.bytes)
      t.diagnostic(JSON.stringify({ scenario, measuredPid: measured.pid, coldPid: cold.pid,
        physicalAndCold: true, counts: physical.counts, cutIds: measured.cuts.map(cut => cut.cutEventId) }))

      if (scenario === 'valid') {
        assert.equal(measured.result.ok, true, JSON.stringify(measured.result.error))
        assert.equal(measured.result.value.outcome, 'created')
        assert.equal(measured.result.value.inquiryId, measured.inquiryId)
        assert.equal(measured.result.value.eventId, original.id)
        assert.equal(measured.appendError, null)
      } else {
        const code = controlled ? scenario === 'not-attempted-controlled' ? 'AppendNotAttempted' : 'NoNewWriteReleaseFailed' : 'CommitUnknown'
        assert.deepEqual(measured.appendError, { code,
          phase: scenario === 'not-attempted-controlled' ? 'BeforePhysicalAppend' : 'StoreRelease',
          causeSame: true, requested: [requested],
          prepared: controlled ? null : { durableEvents: physical.facts, cuts: measured.cuts },
          cleanupFailures: [], priorRejection: null })
        assert.equal(measured.result.ok, false)
        assert.equal(measured.result.error.code, controlled
          ? scenario === 'not-attempted-controlled' ? 'PERSISTENCE_NOT_ATTEMPTED' : 'RELEASE_FAILED' : 'COMMIT_UNKNOWN')
        assert.equal(measured.result.error.path, 'inquiryId')
        for (const identity of [measured.inquiryId, command.commandId, original.id]) {
          assert.ok(measured.result.error.message.includes(identity), identity)
        }
      }
      assert.equal(measured.cuts.length, malformed ? 1 : 0)
      assert.equal(measured.incidentReceipts.length, malformed ? 1 : 0)
      assert.deepEqual(measured.timeline, malformed ? ['append-settled', 'incident', 'returned'] : ['append-settled', 'returned'])
      if (malformed) {
        assert.deepEqual(measured.incidentReceipts[0], { inquiryId: measured.inquiryId,
          commandId: command.commandId, eventId: original.id, causeSame: true,
          evidenceSame: true, observedSettlements: 1, physical })
        assert.equal(measured.redelivery.errorMessage, 'Sphinx append-cut incident was already delivered')
        assert.equal(measured.redelivery.callbacksBefore, 1)
        assert.equal(measured.redelivery.callbacksAfter, 1)
        assert.ok(measured.redelivery.ioBefore > 0, 'Actual owned filesystem observation has a nonzero control')
        assert.equal(measured.redelivery.ioAfter, measured.redelivery.ioBefore)
        assert.equal(measured.redelivery.bytesUnchanged, true)
        assert.equal(measured.redelivery.currentUnchanged, true)
        assert.deepEqual(measured.redelivery.countsBefore, expectedCounts)
        assert.deepEqual(measured.redelivery.countsAfter, expectedCounts)
      } else assert.equal(measured.redelivery, null)
      completed = true
    } finally {
      if (completed) rmSync(root, { recursive: true, force: true })
      else t.diagnostic('SPHINX_COMMAND_SETTLEMENT_FAILURE_EVIDENCE: retained ' + root)
    }
  })
}

const physicalCoordinator = fileURLToPath(new URL('./support/sphinx-physical-binding-coordinator.mjs', import.meta.url))
const physicalChild = fileURLToPath(new URL('./support/sphinx-physical-binding-child.mjs', import.meta.url))

for (const binding of ['wire', 'mcp']) {
  for (const scenario of ['valid', 'valid-release', 'malformed-release']) {
    test(`WHAT[durable-events-024] original Sphinx ${binding} binding ${scenario} settles before its physical terminal and independent cold replay`, async t => {
      assert.equal(typeof (binding === 'wire' ? wire.createWithStore : mcp.serveConfigured), 'function')
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'sphinx-physical-binding-')))
      const commonDir = join(root, '.git')
      const sourceWriter = randomUUID()
      const fatal = scenario === 'malformed-release'
      const release = scenario.endsWith('-release')
      const command = { commandId: `physical-${binding}-${scenario}`, goalText: '原授权目标\r\nNUL:\u0000；雪 😀 尾部  ',
        constraints: [], materialRefs: [], authorizationRef: 'user', profileRef: configuration.profileRef }
      const cancelReason = '原用户请求取消\r\nNUL:\u0000；雪 😀 尾部  '
      const env = { ...process.env }
      delete env.NODE_TEST_CONTEXT
      delete env.NODE_OPTIONS
      delete env.WANXIANGSHU_NO_FATAL_EXIT
      const probe = async (entry, args) => {
        try {
          return JSON.parse(await runVerificationToolProbe(process.execPath, [entry, ...args],
            { cwd: root, env, signal: t.signal }))
        } catch (error) {
          if (error?.stderr && typeof error.message === 'string') error.message += '\n' + error.stderr
          throw error
        }
      }
      let completed = false
      try {
        let seed = null
        if (binding === 'mcp') {
          const seedWriter = randomUUID()
          const seeded = await probe(child, ['measure', commonDir, seedWriter, 'valid', JSON.stringify({
            configuration, command: { ...command, commandId: 'seed-' + command.commandId },
          })])
          assert.equal(seeded.result.ok, true)
          assert.equal(seeded.result.value.outcome, 'created')
          assert.equal(seeded.physical.facts.length, 1)
          seed = { writerId: seedWriter, pid: seeded.pid, inquiryId: seeded.inquiryId,
            bytes: seeded.physical.bytes, facts: seeded.physical.facts }
        }
        const measured = await probe(physicalCoordinator, [binding, commonDir, sourceWriter, scenario,
          JSON.stringify({ configuration, command, cancelReason, seed })])
        assert.notEqual(measured.coordinatorPid, process.pid)
        assert.notEqual(measured.pid, process.pid)
        assert.notEqual(measured.pid, measured.coordinatorPid)
        assert.equal(measured.cleanupRequested, false, 'cleanup never supplies the fatal evidence')
        assert.deepEqual({ exitCode: measured.exitCode, signal: measured.signal }, fatal
          ? { exitCode: null, signal: 'SIGKILL' } : { exitCode: 0, signal: null })
        const receipt = measured.measured
        assert.equal(receipt.parentPid, measured.coordinatorPid)
        assert.equal(receipt.binding, binding)
        assert.equal(receipt.commandId, command.commandId)
        const { physical, original, requested, cuts } = receipt
        assert.equal(original.type, 'sphinx/v2-transition@2')
        assert.equal(original.payload.inquiry, receipt.inquiryId)
        assert.equal(original.payload.commandId, command.commandId)
        assert.equal(original.payload.events.length, 1)
        assert.equal(original.payload.events[0].case, binding === 'wire' ? 'InquiryCreated' : 'CancelRequested')
        if (binding === 'wire') assert.equal(original.payload.events[0].payload.goal.originalText, command.goalText)
        else {
          assert.equal(receipt.inquiryId, seed.inquiryId)
          assert.equal(original.payload.events[0].payload.reason, cancelReason)
          assert.equal(measured.protocol.command.reason, cancelReason)
          assert.equal(measured.protocol.replies, fatal ? 0 : 1)
          assert.equal(measured.protocol.read.inquiryId, seed.inquiryId)
          assert.notEqual(seed.pid, measured.pid)
        }
        assert.deepEqual(requested, [{ ...original, payload: fatal ? {} : original.payload }])
        assert.equal(physical.facts.length, fatal ? 2 : 1)
        assert.deepEqual(physical.facts[0], requested[0])
        assert.deepEqual(physical.counts, { append: 1, fsync: 1, close: 1, release: 1, injected: release ? 1 : 0 })
        assert.equal(physical.lockReleased, true)
        assert.equal(physical.openDescriptors, 0)
        assert.equal(physical.syncedDescriptors, 0)
        assert.equal(existsSync(join(commonDir, 'wanxiangshu.lock')), false)
        const sourceFile = join(commonDir, 'wanxiangshu', 'events', `${sourceWriter}.ndjson`)
        assert.equal(readFileSync(sourceFile, 'base64'), physical.bytes)
        for (const head of physical.heads) {
          const fact = physical.facts.find(value => value.stream === head.stream)
          assert.equal(head.head, fact.id)
          assert.deepEqual(head.heads, [fact.id])
        }
        assert.equal(cuts.length, fatal ? 1 : 0)
        if (release) {
          assert.deepEqual(receipt.appendError, { code: 'CommitUnknown', phase: 'StoreRelease', causeSame: true,
            requested, prepared: { durableEvents: physical.facts, cuts }, cleanupFailures: [], priorRejection: null })
        } else assert.equal(receipt.appendError, null)
        if (fatal) {
          const [cut] = cuts
          const cutFact = physical.facts[1]
          assert.equal(cut.rule, 'SphinxV2')
          assert.equal(cut.failedEventId, original.id)
          assert.equal(cut.cutEventId, cutFact.id)
          assert.equal(cutFact.type, 'ProjectionCutTail')
          assert.equal(cutFact.payload.rule, 'SphinxV2')
          assert.equal(cutFact.payload.failed_event_id, original.id)
          assert.deepEqual(cutFact.parents, [original.id])
          assert.notEqual(cutFact.stream, original.stream)
          assert.equal(physical.current.ok, false)
          assert.equal(physical.current.error.code, 'SemanticCut')
          assert.match(physical.current.error.message, /INVALID_TRANSITION_DTO/)
          assert.equal(measured.returned, null)
          assert.equal(measured.reports.length, 1)
          assert.equal(measured.reports[0].operation, 'sphinx-semantic-cut')
          for (const text of [receipt.inquiryId, command.commandId, original.id, 'StoreRelease', receipt.causeText]) {
            assert.ok(measured.reports[0].result.includes(text), text)
          }
        } else {
          assert.deepEqual(measured.reports, [])
          assert.equal(physical.current.ok, true)
          assert.equal(physical.current.value.eventHead, original.id)
          assert.equal(physical.current.value.revision, binding === 'wire' ? '0' : '1')
          assert.equal(measured.returned.outcome, release ? 'refused' : binding === 'wire' ? 'created' : 'applied')
          if (binding === 'mcp') {
            assert.deepEqual(physical.current.value.status, { case: 'Cancelling' })
            if (!release) assert.equal(measured.returned.status, 'cancelling')
          }
          if (release) {
            assert.equal(measured.returned.refusal.code, 'COMMIT_UNKNOWN')
            for (const text of [receipt.inquiryId, command.commandId, original.id, receipt.causeText]) {
              assert.ok(measured.returned.refusal.message.includes(text), text)
            }
          }
        }
        const coldWriter = randomUUID()
        const cold = await probe(physicalChild, ['cold', commonDir, coldWriter, scenario,
          JSON.stringify({ sourceWriter, inquiryId: receipt.inquiryId, physical, seed })])
        assert.notEqual(cold.pid, measured.pid)
        assert.notEqual(cold.pid, measured.coordinatorPid)
        assert.notEqual(cold.pid, process.pid)
        assert.equal(cold.writerId, coldWriter)
        assert.equal(cold.preserved, true)
        assert.deepEqual(cold.current, physical.current)
        assert.equal(cold.bytes, physical.bytes)
        assert.equal(existsSync(join(commonDir, 'wanxiangshu', 'events', `${coldWriter}.ndjson`)), false)
        assert.equal(readFileSync(sourceFile, 'base64'), physical.bytes)
        if (seed) assert.equal(readFileSync(join(commonDir, 'wanxiangshu', 'events', `${seed.writerId}.ndjson`), 'base64'), seed.bytes)
        t.diagnostic(JSON.stringify({ binding, scenario, nativePid: measured.pid, coldPid: cold.pid,
          terminal: measured.signal ?? measured.exitCode, physicalAndCold: true }))
        completed = true
      } finally {
        if (completed) rmSync(root, { recursive: true, force: true })
        else t.diagnostic('SPHINX_PHYSICAL_BINDING_FAILURE_EVIDENCE: retained ' + root)
      }
    })
  }
}

const journalPhysicalCoordinator = fileURLToPath(new URL('./support/journal-physical-coordinator.mjs', import.meta.url))
const journalPhysicalChild = fileURLToPath(new URL('./support/journal-physical-child.mjs', import.meta.url))

for (const scenario of ['valid', 'valid-release', 'malformed', 'malformed-release']) {
  test(`WHAT[durable-events-024] original Journal RuntimeStarted ${scenario} settles before its physical terminal and independent cold replay`, async t => {
    assert.equal(typeof journals.openActualJournalWithStore, 'function')
    assert.equal(typeof journals.observeActualJournalProjection, 'function')
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'journal-physical-settlement-')))
    const commonDir = join(root, '.git')
    const sourceWriter = randomUUID()
    const sourceFile = join(commonDir, 'wanxiangshu', 'events', `${sourceWriter}.ndjson`)
    const malformed = scenario.startsWith('malformed')
    const release = scenario.endsWith('-release')
    const env = { ...process.env }
    delete env.NODE_TEST_CONTEXT
    delete env.NODE_OPTIONS
    delete env.WANXIANGSHU_NO_FATAL_EXIT
    const probe = async (entry, args) => {
      try {
        return JSON.parse(await runVerificationToolProbe(process.execPath, [entry, ...args],
          { cwd: root, env, signal: t.signal }))
      } catch (error) {
        if (error?.stderr && typeof error.message === 'string') error.message += '\n' + error.stderr
        throw error
      }
    }
    let completed = false
    try {
      const measured = await probe(journalPhysicalCoordinator, [commonDir, sourceWriter, scenario])
      assert.notEqual(measured.coordinatorPid, process.pid)
      assert.notEqual(measured.pid, process.pid)
      assert.notEqual(measured.pid, measured.coordinatorPid)
      assert.equal(measured.cleanupRequested, false)
      assert.deepEqual({ exitCode: measured.exitCode, signal: measured.signal }, malformed
        ? { exitCode: null, signal: 'SIGKILL' } : { exitCode: 0, signal: null })
      assert.equal(measured.receipts.length, scenario === 'valid' ? 2 : 1)
      const firstReceipt = measured.receipts[0]
      const receipt = measured.receipts.at(-1)
      const original = firstReceipt.originalRequested[0]
      const initializationId = firstReceipt.initial.initEventId
      assert.equal(original.id, initializationId)
      assert.equal(original.stream, 'journal/workspace')
      assert.equal(original.type, 'JournalEnvelope')
      assert.notDeepEqual(original.payload, {})
      assert.deepEqual(firstReceipt.requested, [{ ...original, payload: malformed ? {} : original.payload }])
      assert.deepEqual(firstReceipt.facts[0], firstReceipt.requested[0])
      const count = scenario === 'valid' ? 2 : 1
      assert.deepEqual(receipt.counts, { append: count, fsync: count, close: count, release: count,
        injected: release ? 1 : 0 })
      assert.equal(receipt.lockReleased, true)
      assert.equal(receipt.openDescriptors, 0)
      assert.equal(receipt.syncedDescriptors, 0)
      assert.equal(existsSync(join(commonDir, 'wanxiangshu.lock')), false)
      assert.equal(readFileSync(sourceFile, 'base64'), receipt.bytes)
      assert.equal(receipt.facts.length, malformed || scenario === 'valid' ? 2 : 1)
      for (const frontier of receipt.heads) {
        const finalFact = receipt.facts.filter(fact => fact.stream === frontier.stream).at(-1)
        assert.equal(frontier.head, finalFact.id)
        assert.deepEqual(frontier.heads, [finalFact.id])
      }
      assert.equal(firstReceipt.initial.revision, '0')
      assert.equal(firstReceipt.initial.waitCompleted, false)
      assert.equal(firstReceipt.cuts.length, malformed ? 1 : 0)
      if (release) {
        assert.deepEqual(firstReceipt.appendError, { code: 'CommitUnknown', phase: 'StoreRelease',
          causeSame: true, requested: firstReceipt.requested,
          prepared: { durableEvents: firstReceipt.facts, cuts: firstReceipt.cuts }, cleanupFailures: [] })
      } else assert.equal(firstReceipt.appendError, null)
      if (malformed) {
        const [cut] = firstReceipt.cuts
        const cutFact = receipt.facts[1]
        assert.equal(cut.rule, 'Journal')
        assert.equal(cut.failedEventId, initializationId)
        assert.equal(cut.cutEventId, cutFact.id)
        assert.equal(cutFact.type, 'ProjectionCutTail')
        assert.equal(cutFact.payload.rule, 'Journal')
        assert.equal(cutFact.payload.failed_event_id, initializationId)
        assert.deepEqual(cutFact.parents, [initializationId])
        assert.notEqual(cutFact.stream, original.stream)
        assert.deepEqual(receipt.projection, { runtimeId: null, runtimeStartCount: 0,
          sessionCount: 0, hasNativeSession: false })
        assert.equal(measured.returned, null)
        assert.equal(measured.reports.length, 1)
        assert.equal(measured.reports[0].operation, 'runtime-started-semantic-cut')
        if (release) {
          assert.match(measured.reports[0].result, /semantic cut append settled unknown at StoreRelease/)
          assert.match(measured.reports[0].result, /original Journal initialization owned Release completed before response failed/)
        } else assert.match(measured.reports[0].result, /RuntimeStarted semantic cut:/)
      } else {
        assert.deepEqual(measured.reports, [])
        assert.equal(measured.returned.first.kind, release ? 'NotAttempted' : 'Committed')
        const { afterFirst, afterSecond, first, second } = measured.returned
        assert.equal(afterFirst.revision, release ? '0' : '2')
        assert.equal(afterFirst.lastCommittedLocalSeq, release ? '0' : '2')
        assert.equal(afterFirst.poisoned, release)
        if (release) {
          assert.equal(afterFirst.waitCompleted, false)
          assert.equal(afterSecond.waitCompleted, false)
          assert.equal(afterSecond.revision, '0')
          assert.equal(first.error.failedEventId, initializationId)
          assert.notEqual(first.error.eventId, initializationId)
          assert.equal(first.error.code, 'CommitUnknown')
          assert.equal(first.error.phase, 'StoreRelease')
          assert.deepEqual(first.error.requestedIds, [initializationId])
          assert.deepEqual(first.error.preparedIds, [initializationId])
          assert.deepEqual(first.error.cutIds, [])
          assert.equal(second.kind, 'NotAttempted')
          assert.equal(second.error.failedEventId, initializationId)
          assert.notEqual(second.error.eventId, first.error.eventId)
        }
        assert.deepEqual(measured.returned.projection, { runtimeId: 'native-' + sourceWriter,
          runtimeStartCount: 1, sessionCount: release ? 0 : 1, hasNativeSession: !release })
      }
      const projection = measured.returned?.projection ?? receipt.projection
      const coldWriter = randomUUID()
      const cold = await probe(journalPhysicalChild, ['cold', commonDir, coldWriter, scenario,
        JSON.stringify({ sourceWriter, bytes: receipt.bytes, facts: receipt.facts, heads: receipt.heads, projection })])
      assert.notEqual(cold.pid, measured.pid)
      assert.notEqual(cold.pid, measured.coordinatorPid)
      assert.notEqual(cold.pid, process.pid)
      assert.equal(cold.writerId, coldWriter)
      assert.equal(cold.preserved, true)
      assert.deepEqual(cold.projection, projection)
      assert.equal(cold.bytes, receipt.bytes)
      assert.equal(readFileSync(sourceFile, 'base64'), receipt.bytes)
      assert.equal(existsSync(join(commonDir, 'wanxiangshu', 'events', `${coldWriter}.ndjson`)), false)
      assert.equal(existsSync(join(commonDir, 'wanxiangshu.lock')), false)
      t.diagnostic(JSON.stringify({ scenario, measuredPid: measured.pid, coldPid: cold.pid,
        physicalAndCold: true, counts: receipt.counts, cutIds: receipt.cuts.map(cut => cut.cutEventId) }))
      completed = true
    } finally {
      if (completed) rmSync(root, { recursive: true, force: true })
      else t.diagnostic('JOURNAL_PHYSICAL_SETTLEMENT_FAILURE_EVIDENCE: retained ' + root)
    }
  })
}

for (const variant of ['valid', 'valid-release', 'malformed', 'malformed-release']) {
  const scenario = 'business-' + variant
  test(`WHAT[durable-events-024] original AgentJournal business ${variant} preserves legal initialization before its physical terminal and cold replay`, async t => {
    assert.equal(typeof eventStore.createAppendPayloadStoreAt, 'function')
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'journal-business-settlement-')))
    const commonDir = join(root, '.git')
    const sourceWriter = randomUUID()
    const sourceFile = join(commonDir, 'wanxiangshu', 'events', `${sourceWriter}.ndjson`)
    const malformed = variant.startsWith('malformed')
    const release = variant.endsWith('-release')
    const env = { ...process.env }
    delete env.NODE_TEST_CONTEXT
    delete env.NODE_OPTIONS
    delete env.WANXIANGSHU_NO_FATAL_EXIT
    const probe = async (entry, args) => {
      try {
        return JSON.parse(await runVerificationToolProbe(process.execPath, [entry, ...args],
          { cwd: root, env, signal: t.signal }))
      } catch (error) {
        if (error?.stderr && typeof error.message === 'string') error.message += '\n' + error.stderr
        throw error
      }
    }
    let completed = false
    try {
      const measured = await probe(journalPhysicalCoordinator, [commonDir, sourceWriter, scenario])
      assert.notEqual(measured.coordinatorPid, process.pid)
      assert.notEqual(measured.pid, process.pid)
      assert.notEqual(measured.pid, measured.coordinatorPid)
      assert.equal(measured.cleanupRequested, false)
      assert.equal(measured.receipts.length, 2)
      const [initialization, business] = measured.receipts
      assert.deepEqual(measured.receipts.map(receipt => receipt.ordinal), [1, 2])
      const initId = initialization.initial.initEventId
      assert.equal(initialization.originalRequested.length, 1)
      assert.equal(initialization.originalRequested[0].id, initId)
      assert.equal(initialization.originalRequested[0].stream, 'journal/workspace')
      assert.equal(initialization.originalRequested[0].type, 'JournalEnvelope')
      assert.notDeepEqual(initialization.originalRequested[0].payload, {})
      assert.deepEqual(initialization.requested, initialization.originalRequested)
      assert.deepEqual(initialization.facts, initialization.requested)
      assert.deepEqual(initialization.cuts, [])
      assert.equal(initialization.appendError, null)
      assert.deepEqual(initialization.counts, { append: 1, fsync: 1, close: 1, release: 1, injected: 0 })
      assert.deepEqual(initialization.projection, { runtimeId: 'native-' + sourceWriter,
        runtimeStartCount: 1, sessionCount: 0, hasNativeSession: false })

      assert.equal(business.originalRequested.length, 1)
      const original = business.originalRequested[0]
      assert.notEqual(original.id, initId)
      assert.notEqual(original.stream, initialization.originalRequested[0].stream)
      assert.equal(original.type, 'JournalEnvelope')
      assert.notDeepEqual(original.payload, {})
      assert.deepEqual(business.requested, [{ ...original, payload: malformed ? {} : original.payload }])
      assert.deepEqual(business.facts[0], initialization.facts[0])
      assert.deepEqual(business.facts[1], business.requested[0])
      assert.equal(business.facts.length, malformed ? 3 : 2)
      assert.deepEqual(business.counts, { append: 2, fsync: 2, close: 2, release: 2,
        injected: release ? 1 : 0 })
      for (const receipt of measured.receipts) {
        assert.equal(receipt.lockReleased, true)
        assert.equal(receipt.openDescriptors, 0)
        assert.equal(receipt.syncedDescriptors, 0)
        assert.equal(receipt.initial.revision, '0')
        assert.equal(receipt.initial.waitCompleted, false)
        assert.equal(receipt.initial.poisoned, false)
        assert.equal(Buffer.from(receipt.bytes, 'base64').toString('utf8'),
          receipt.facts.map(fact => eventCodec.encode(fact)).join(''))
      }
      assert.equal(initialization.initial.lastCommittedLocalSeq, '0')
      assert.equal(business.initial.lastCommittedLocalSeq, '1')
      const initialBytes = Buffer.from(initialization.bytes, 'base64')
      assert.deepEqual(Buffer.from(business.bytes, 'base64').subarray(0, initialBytes.length), initialBytes)
      assert.equal(readFileSync(sourceFile, 'base64'), business.bytes)
      assert.equal(existsSync(join(commonDir, 'wanxiangshu.lock')), false)
      for (const frontier of business.heads) {
        const finalFact = business.facts.filter(fact => fact.stream === frontier.stream).at(-1)
        assert.equal(frontier.head, finalFact.id)
        assert.deepEqual(frontier.heads, [finalFact.id])
      }

      const projection = malformed
        ? initialization.projection
        : { runtimeId: 'native-' + sourceWriter, runtimeStartCount: 1,
          sessionCount: 1, hasNativeSession: true }
      assert.deepEqual(business.projection, projection)
      const coldWriter = randomUUID()
      const cold = await probe(journalPhysicalChild, ['cold', commonDir, coldWriter, scenario,
        JSON.stringify({ sourceWriter, bytes: business.bytes, facts: business.facts,
          heads: business.heads, projection })])
      assert.notEqual(cold.pid, measured.pid)
      assert.notEqual(cold.pid, measured.coordinatorPid)
      assert.notEqual(cold.pid, process.pid)
      assert.equal(cold.writerId, coldWriter)
      assert.equal(cold.preserved, true)
      assert.deepEqual(cold.projection, projection)
      assert.equal(cold.bytes, business.bytes)
      assert.equal(readFileSync(sourceFile, 'base64'), business.bytes)
      assert.equal(existsSync(join(commonDir, 'wanxiangshu', 'events', `${coldWriter}.ndjson`)), false)
      assert.equal(existsSync(join(commonDir, 'wanxiangshu.lock')), false)

      assert.equal(business.cuts.length, malformed ? 1 : 0)
      if (release) {
        assert.deepEqual(business.appendError, { code: 'CommitUnknown', phase: 'StoreRelease',
          causeSame: true, requested: business.requested,
          prepared: { durableEvents: business.facts.slice(1), cuts: business.cuts }, cleanupFailures: [] })
      } else assert.equal(business.appendError, null)
      assert.deepEqual({ exitCode: measured.exitCode, signal: measured.signal }, malformed
        ? { exitCode: null, signal: 'SIGKILL' } : { exitCode: 0, signal: null })
      if (malformed) {
        const [cut] = business.cuts
        const cutFact = business.facts[2]
        assert.equal(cut.rule, 'Journal')
        assert.equal(cut.failedEventId, original.id)
        assert.equal(cut.cutEventId, cutFact.id)
        assert.equal(cutFact.type, 'ProjectionCutTail')
        assert.equal(cutFact.payload.rule, 'Journal')
        assert.equal(cutFact.payload.failed_event_id, original.id)
        assert.deepEqual(cutFact.parents, [original.id])
        assert.notEqual(cutFact.stream, original.stream)
        assert.equal(measured.returned, null)
        assert.equal(measured.reports.length, 1)
        assert.equal(measured.reports[0].operation, 'journal-semantic-cut')
        if (release) {
          assert.match(measured.reports[0].result, /semantic cut append settled unknown at StoreRelease/)
          assert.match(measured.reports[0].result, /original Journal business owned Release completed before response failed/)
        } else {
          assert.ok(measured.reports[0].result.includes(`journal semantic cut at ${original.id}:`))
          assert.match(measured.reports[0].result, /fact 'semantic-cut' rejected:/)
        }
      } else {
        assert.deepEqual(measured.reports, [])
        const { first, afterFirst, second, afterSecond } = measured.returned
        assert.equal(first.kind, release ? 'CommitUnknown' : 'Committed')
        assert.equal(afterFirst.revision, release ? '0' : '2')
        assert.equal(afterFirst.lastCommittedLocalSeq, release ? '1' : '2')
        assert.equal(afterFirst.poisoned, release)
        assert.deepEqual(measured.returned.projection, projection)
        if (release) {
          assert.equal(afterFirst.waitCompleted, false)
          assert.equal(afterSecond.waitCompleted, false)
          assert.equal(afterSecond.revision, '0')
          assert.equal(afterSecond.lastCommittedLocalSeq, '1')
          assert.equal(afterSecond.poisoned, true)
          assert.equal(first.error.eventId, original.id)
          assert.equal(first.error.failedEventId, original.id)
          assert.equal(first.error.code, 'CommitUnknown')
          assert.equal(first.error.phase, 'StoreRelease')
          assert.deepEqual(first.error.requestedIds, [original.id])
          assert.deepEqual(first.error.preparedIds, [original.id])
          assert.deepEqual(first.error.cutIds, [])
          assert.equal(second.kind, 'NotAttempted')
          assert.equal(second.error.failedEventId, original.id)
          assert.notEqual(second.error.eventId, original.id)
          assert.deepEqual(second.error.requestedIds, [original.id])
          assert.deepEqual(second.error.preparedIds, [original.id])
          assert.deepEqual(second.error.cutIds, [])
        } else {
          assert.equal(first.error, null)
          assert.equal(second, null)
          assert.equal(afterSecond, null)
        }
      }
      t.diagnostic(JSON.stringify({ scenario, measuredPid: measured.pid, coldPid: cold.pid,
        physicalAndCold: true, initId, businessId: original.id, counts: business.counts,
        cutIds: business.cuts.map(cut => cut.cutEventId) }))
      completed = true
    } finally {
      if (completed) rmSync(root, { recursive: true, force: true })
      else t.diagnostic('JOURNAL_BUSINESS_SETTLEMENT_FAILURE_EVIDENCE: retained ' + root)
    }
  })
}

test.todo('WHAT[durable-events-024] actual semantic-cut caller requires injected fatal capability and refuses fatal before committed or unknown settlement')
test.todo('WHAT[durable-events-024] actual physical child persists bad fact and cut then reports and exits once; duplicate incident cannot execute again')
