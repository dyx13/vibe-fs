import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as journal from '../../../../dist/Persistence/Journal/Surface.js'
import { StrictMockSignals } from '../e2e/support/strict-mock-signals.js'
import { releaseSharedObserver } from '../e2e/support/journal-observer.js'

const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value

export async function withHumanRootLoopFixture(run) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wxs-humanroot-road-'))
  execFileSync('git', ['init', '-q', workDir])
  const commonDir = path.join(workDir, '.git')
  const eventsDir = path.join(commonDir, 'wanxiangshu', 'events')
  fs.mkdirSync(eventsDir, { recursive: true })
  const file = path.join(eventsDir, 'relay-fixture.ndjson')
  const target = 'ses_humanroot_canary'
  const foreign = 'ses_strength_owner'
  let sequence = 0
  let previousEventId = null
  let replay = 0
  const incumbent = (road, round) => 'incumbency:' + (road === target ? 'a' : 'b') + String(round).padStart(63, '0')
  const assessment = (road, round) => `assessment:${road}:${round}`
  const append = (road, cases, parents = previousEventId === null ? [] : [previousEventId]) => {
    sequence += 1
    const id = createHash('sha1').update(`fixture-event:${sequence}`).digest('hex')
    previousEventId = id
    const event = {
      event_id: id, event_type: 'JournalEnvelope', parents, payload_refs: [],
      stream_id: `journal/session/${road}`,
      payload: {
        EventId: ['EventId', id], RuntimeId: ['RuntimeId', 'rt_fixture'],
        LocalSeq: ['LocalSeq', String(sequence)], ObservedAt: '9999-01-01T00:00:00.000+00:00',
        Stream: ['Session', ['SessionId', road]],
        Fact: ['Agent', ['Relay', ['TransactionCommitted', {
          RoadId: ['RoadId', road], Transaction: ['RelayTransaction', cases],
        }]]],
      },
    }
    fs.appendFileSync(file, JSON.stringify(canonical(event)) + '\n')
  }
  const open = (road, round) => append(road, [
    ...(round === 1 ? [['RoadOpened', ['RoadId', road], ['AuthorityRevision', `user:${road}`],
      ['PhysicalUserMessageId', `user:${road}`]]] : []),
    ['IncumbencyOpened', ['IncumbencyId', incumbent(road, round)], ['WorkspaceSnapshotId', 'snapshot']],
  ])
  const assess = (road, round, grade) => append(road, [[
    'AssessmentCommitted', ['AssessmentId', assessment(road, round)], ['IncumbencyId', incumbent(road, round)],
    {
      PhysicalUserMessageId: `user:${road}`, ProviderRunId: `provider:${road}:${round}`,
      ToolCallId: `review:${road}:${round}`, NarrativeDigest: 'narrative', PayloadDigest: `payload:${grade}`,
      RootRequestDigest: 'root', RequirementSetDigest: 'requirements', EvidenceFrontierDigest: 'evidence',
    },
    ['WorkspaceSnapshotId', 'snapshot'], ['AuthorityRevision', `user:${road}`],
    ['AssessmentFindings', grade === 'Perfect' ? [] : [
      { AcceptanceCriteria: 'Complete the original charge.', WorkPlan: 'Finish the remaining work.' },
    ]],
  ]])
  const retire = (road, round, accepted, { confirmationParents } = {}) => {
    append(road, [['RetirementConfirmationCommitted', ['IncumbencyId', incumbent(road, round)],
      `provider:${road}:${round}:confirm`, `confirm:${road}:${round}`]], confirmationParents)
    append(road, [['RetirementCommitted', {
      Id: ['RetirementId', `retirement:${road}:${round}`], IncumbencyId: ['IncumbencyId', incumbent(road, round)],
      SnapshotId: ['WorkspaceSnapshotId', 'snapshot'], AuthorityRevision: ['AuthorityRevision', `user:${road}`],
      ProjectionCut: { ProviderRunId: `provider:${road}:${round}:retire`, ToolCallId: `suicide:${road}:${round}` },
      Outcome: accepted ? ['Accepted', ['QualityCertificateId', `certificate:${assessment(road, round)}`]] : 'Continue',
    }]])
  }
  const reopen = (road, round) => {
    append(road, [['QualityCertificateInvalidated',
      ['QualityCertificateId', `certificate:${assessment(road, round - 1)}`], 'ContinuousSessionAdvancesRoad']])
    open(road, round)
  }
  const assertReplayed = async (road, retired, active) => {
    replay += 1
    const booted = await journal.JournalSurface_bootWithWriterId(commonDir, `oracle-replay-${replay}`,
      `rt_replay_${replay}`, 4242, '2026-01-02T00:00:00Z')
    assert.equal(booted.ok, true, JSON.stringify(booted.error))
    try {
      const state = journal.JournalSurface_snapshot(booted.journal).sessionProjections[road].relay
      const view = state.roads.find((item) => item.roadId === road)
      assert.equal(view.retiredIncumbencyCount, retired, 'fixture must cold-replay the real Relay transitions')
      assert.equal(view.activeIncumbencyPresent, active)
    } finally {
      journal.JournalSurface_dispose(booted.journal)
    }
  }
  const signals = new StrictMockSignals()
  for (const id of ['humanroot-loop.0', 'humanroot-loop.1', 'humanroot-loop.2', 'manager-reopened-loop.0', 'manager-reopened-loop.1', 'manager-reopened-loop.2']) {
    signals.consume({ id, sessionId: target })
  }
  for (const id of ['manager-reopened-loop.0', 'manager-reopened-loop.1']) signals.consume({ id, sessionId: foreign })
  const authority = [{ role: 'system', content: 'Manager authority' }, { role: 'user', content: 'HumanRoot demand' }]
  const exchange = (tool, call, output) => [{ role: 'assistant', tool_calls: [{ id: call,
    type: 'function', function: { name: tool, arguments: '{}' } }] },
  { role: 'tool', tool_call_id: call, content: output }]
  const firstReview = exchange('review', `review:${target}:1`, 'review accepted')
  const firstConfirmation = exchange('suicide', `confirm:${target}:1`, 'finished = false\nconfirmation_required = true')
  const firstRetirement = exchange('suicide', `suicide:${target}:1`, 'finished = true')
  const secondReview = exchange('review', `review:${target}:2`, 'review accepted')
  const secondConfirmation = exchange('suicide', `confirm:${target}:2`, 'finished = false\nconfirmation_required = true')
  const successor = [...authority, ...firstReview, ...firstConfirmation, ...firstRetirement,
    { role: 'user', content: '# You are the 2 Manager taking over this mission.' }]
  const wire = (messages) => ({ sessionID: target, messages,
    tools: ['review', 'suicide'].map((name) => ({ function: { name } })) })
  const calls = [
    ['review', `provider:${target}:1`, `review:${target}:1`, 'review accepted'],
    ['suicide', `provider:${target}:1:confirm`, `confirm:${target}:1`, 'finished = false\nconfirmation_required = true'],
    ['suicide', `provider:${target}:1:retire`, `suicide:${target}:1`, 'finished = true'],
    ['review', `provider:${target}:2`, `review:${target}:2`, 'review accepted'],
    ['suicide', `provider:${target}:2:confirm`, `confirm:${target}:2`, 'finished = false\nconfirmation_required = true'],
    ['suicide', `provider:${target}:2:retire`, `suicide:${target}:2`, 'finished = true'],
  ]
  const hostMessages = calls.map(([tool, id, callID, output]) => ({ info: { id, role: 'assistant' },
    parts: [{ type: 'tool', tool, callID, state: { status: 'completed', input: {}, output } }] }))
  const scenario = {
    host: { workDir },
    provider: {
      requests: [wire(authority), wire([...authority, ...firstReview]),
        wire([...authority, ...firstReview, ...firstConfirmation]), wire(successor),
        wire([...successor, ...secondReview]), wire([...successor, ...secondReview, ...secondConfirmation])],
      toolCallBatches: calls.map(([name, , id], requestIndex) => ({ sessionId: target, requestIndex,
        calls: [{ id, name, arguments: '{}' }] })),
      matchCount: (id, sessionId) => signals.matchCount(id, sessionId),
    },
    client: { request: async () => ({ ok: true, data: { [target]: { type: 'idle' } } }),
      messages: async () => ({ ok: true, data: hostMessages }) },
  }
  try {
    return await run({ workDir, target, foreign, scenario, open, assess, retire, reopen, assertReplayed, signals })
  } finally {
    await releaseSharedObserver(workDir)
    fs.rmSync(workDir, { recursive: true, force: true })
  }
}
