import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
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
  let replay = 0
  const incumbent = (road, round) => 'incumbency:' + (road === target ? 'a' : 'b') + String(round).padStart(63, '0')
  const assessment = (road, round) => `assessment:${road}:${round}`
  const append = (road, cases) => {
    const parent = sequence === 0 ? [] : [sequence.toString(16).padStart(40, '0')]
    sequence += 1
    const id = sequence.toString(16).padStart(40, '0')
    const event = {
      event_id: id, event_type: 'JournalEnvelope', parents: parent, payload_refs: [],
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
  const retire = (road, round, accepted) => append(road, [['RetirementCommitted', {
    Id: ['RetirementId', `retirement:${road}:${round}`], IncumbencyId: ['IncumbencyId', incumbent(road, round)],
    SnapshotId: ['WorkspaceSnapshotId', 'snapshot'], AuthorityRevision: ['AuthorityRevision', `user:${road}`],
    ProjectionCut: { ProviderRunId: `provider:${road}:${round}`, ToolCallId: `suicide:${road}:${round}` },
    Outcome: accepted ? ['Accepted', ['QualityCertificateId', `certificate:${assessment(road, round)}`]] : 'Continue',
  }]])
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
  for (const id of ['humanroot-loop.0', 'humanroot-loop.1', 'manager-reopened-loop.0', 'manager-reopened-loop.1']) {
    signals.consume({ id, sessionId: target })
  }
  for (const id of ['manager-reopened-loop.0', 'manager-reopened-loop.1']) signals.consume({ id, sessionId: foreign })
  const authority = [{ role: 'system', content: 'Manager authority' }, { role: 'user', content: 'HumanRoot demand' }]
  const review = { role: 'assistant', tool_calls: [{ id: 'review:first', type: 'function',
    function: { name: 'review', arguments: '{}' } }] }
  const result = { role: 'tool', tool_call_id: 'review:first', content: 'review accepted' }
  const successor = [...authority, review, result, { role: 'assistant', tool_calls: [{ id: 'retire:first',
    type: 'function', function: { name: 'suicide', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'retire:first', content: 'Continue' },
    { role: 'user', content: '# You are the 2 Manager taking over this mission.' }]
  const wire = (messages) => ({ sessionID: target, messages,
    tools: ['review', 'suicide'].map((name) => ({ function: { name } })) })
  const scenario = {
    host: { workDir },
    provider: {
      requests: [wire(authority), wire([...authority, review, result]), wire(successor),
        wire([...successor, { ...review, tool_calls: [{ ...review.tool_calls[0], id: 'review:second' }] }])],
      matchCount: (id, sessionId) => signals.matchCount(id, sessionId),
    },
    client: { request: async () => ({ ok: true, data: { [target]: { type: 'idle' } } }) },
  }
  try {
    return await run({ workDir, target, foreign, scenario, open, assess, retire, reopen, assertReplayed, signals })
  } finally {
    await releaseSharedObserver(workDir)
    fs.rmSync(workDir, { recursive: true, force: true })
  }
}
