import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCompileShardInventory } from '../../../scripts/lib/compile-shards.mjs'
import { buildSubsystemInventory } from '../../../scripts/checks/subsystems.mjs'
import * as HostSignalSurface from '../../../dist/OpenCode/Host/HostSignalSurface.js'
import { assertEffectIsInjected, assertFatalBoundary, assertOptionalObservationNoninterference, assertPureContract } from '../../structured-workflow/tests/support/m6-boundary-proof.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const requireShard = (projects, shardId) => {
  const matches = [...projects.values()].filter((candidate) => candidate.shard === shardId)
  assert.equal(matches.length, 1, `${shardId} must resolve to exactly one production compile shard`)
  return matches[0]
}

const relSources = (project) => project.implementationFiles.map((p) => path.relative(ROOT, p)).sort()

const refShards = (project, projects) => project.references.map((refPath) => projects.get(refPath).shard).sort()

const closureSources = (root, projects) => {
  const closure = new Set()
  const pending = [root]
  while (pending.length > 0) {
    const project = pending.pop()
    if (closure.has(project)) continue
    closure.add(project)
    for (const refPath of project.references) {
      pending.push(projects.get(refPath))
    }
  }
  return new Set([...closure].flatMap(relSources))
}

test('WHAT[host-boundary-027] Host message loop and envelope slices reject the old wide signal closure', () => {
  assertPureContract()
  assertEffectIsInjected('host')
})

test('WHAT[host-boundary-027] production inventory closes Host codec audiences without the wide signal adapter', () => {
  const shardInventory = readCompileShardInventory({ repositoryRoot: ROOT })
  const subsystemInventory = buildSubsystemInventory({ compileInventory: shardInventory })
  assert.ok(subsystemInventory.ok, subsystemInventory.violations.join('\n'))
  const projects = subsystemInventory.projects

  const envelope = requireShard(projects, 'host-event-envelope')
  const message = requireShard(projects, 'host-message-codec')
  const loop = requireShard(projects, 'loop-event-codec')

  assert.equal(envelope.subsystem, 'host')
  assert.equal(message.subsystem, 'host')
  assert.equal(loop.subsystem, 'host')

  assert.deepEqual(relSources(envelope), ['src/Wanxiangshu/OpenCode/Codec/HostEventEnvelope.fs'])
  assert.deepEqual(relSources(message), ['src/Wanxiangshu/OpenCode/Codec/HostMessageCodec.fs'])

  const messageSources = closureSources(message, projects)
  assert.ok(messageSources.has('src/Wanxiangshu/Participant/Provider/MessageEvidence.fs'))
  for (const unrelated of [
    'src/Wanxiangshu/OpenCode/Codec/OpencodeTypes.fs',
    'src/Wanxiangshu/OpenCode/Signals/EventContract.fs',
    'src/Wanxiangshu/Host/Digest.fs',
  ])
    assert.ok(!messageSources.has(unrelated), `message codec must not acquire ${unrelated}`)
  assert.deepEqual(relSources(loop), ['src/Wanxiangshu/OpenCode/Codec/LoopEventCodec.fs'])
  // LoopEventCodec produces JournalAppendOutcome-shaped values — its decode path legitimately
  // references the runtime-platform Outcome vocabulary (retagged JS codec tier authority).
  assert.deepEqual(refShards(loop, projects), ['host-event-envelope', 'identity', 'outcome'])

  for (const id of ['host-session-runtime', 'authority-runtime-surface', 'opencode-codec-providerprojectionsurface']) {
    const consumer = requireShard(projects, id)
    assert.ok(refShards(consumer, projects).includes('host-message-codec'), `${id} must consume the message codec contract`)
    assert.ok(!refShards(consumer, projects).includes('host-signal-adapter'), `${id} must not consume the wide signal adapter`)
  }

  const loopRuntime = requireShard(projects, 'execution-session-loopdetector')
  assert.ok(refShards(loopRuntime, projects).includes('loop-event-codec'))
  assert.ok(!refShards(loopRuntime, projects).includes('host-signal-adapter'))
  assert.ok(!refShards(loopRuntime, projects).includes('host-diagnostics-runtime'))

  const signalAdapter = requireShard(projects, 'host-signal-adapter')
  assert.ok(refShards(signalAdapter, projects).includes('host-event-envelope'))
  assert.ok(refShards(signalAdapter, projects).includes('loop-event-codec'))
  assert.ok(!relSources(signalAdapter).includes('src/Wanxiangshu/OpenCode/Codec/HostMessageCodec.fs'))
  assert.ok(!relSources(signalAdapter).includes('src/Wanxiangshu/OpenCode/Codec/LoopEventCodec.fs'))

  const visibility = requireShard(projects, 'opencode-host-messagevisibility')
  assert.ok(refShards(visibility, projects).includes('host-event-envelope'))
  assert.ok(!refShards(visibility, projects).includes('host-signal-adapter'))
  assert.ok(refShards(requireShard(projects, 'execution-delegation-hostturnobservedsurface'), projects).includes('host-event-envelope'))
})

test('WHAT[host-boundary-027] Host envelope projection is shared and never mutates the raw payload', () => {
  const payload = { type: 'message.updated', properties: { sessionID: 'session-1', info: { sessionID: 'session-2' } } }
  const input = { directory: '/must-not-cross', payload }

  assert.equal(HostSignalSurface.unwrapEnvelope(input), payload)
  assert.equal(Object.hasOwn(payload, 'directory'), false)
  assert.equal(HostSignalSurface.envelopeEventType(input), 'message.updated')
  assert.equal(HostSignalSurface.envelopeSessionId(input), 'session-1')
  assert.equal(HostSignalSurface.envelopeMessageSessionId(input), 'session-1')
  assert.equal(
    HostSignalSurface.envelopeMessageSessionId({ payload: { type: 'message.updated', properties: { info: { sessionID: 'session-2' } } } }),
    'session-2',
  )
})
