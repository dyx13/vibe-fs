import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as authority from '../../../../dist/Interaction/Authority/RuntimeSurface.js'
import * as dispatch from '../../../../dist/Interaction/Dispatch/DispatchSurface.js'
import * as events from '../../../../dist/OpenCode/Host/EventsSurface.js'
import * as journal from '../../../../dist/Persistence/Journal/Surface.js'

const canonical = value => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value

export async function withManagerLoop(caseName, body) {
  const directory = mkdtempSync(join(tmpdir(), 'wxs-manager-loop-'))
  const commonDir = join(directory, '.git')
  const session = `manager-loop-${caseName}`
  const rootPhysical = `root-${session}`
  const terminalPort = events.create()
  const completions = []
  const subscription = events.subscribeFuture(terminalPort, (observedSession, outcome) => {
    if (observedSession === session) completions.push(outcome)
  })
  let handle
  let incarnation = 0
  const reopen = async () => {
    if (handle) journal.JournalSurface_dispose(handle)
    handle = null
    incarnation += 1
    const opened = await journal.JournalSurface_bootWithWriterId(commonDir,
      `manager-loop-${incarnation}`, `rt_manager_loop_${incarnation}`, 4242, '2026-10-08T00:00:00Z')
    assert.equal(opened.ok, true, JSON.stringify(opened.error))
    handle = opened.journal
    return handle
  }
  try {
    execFileSync('git', ['init', '-q', directory])
    await reopen()
    const owner = await dispatch.acceptHumanRoot(handle, `owner-${session}`, `owner-root-${session}`, 'orchestrator')
    assert.equal(owner.ok, true, JSON.stringify(owner.error))
    const seed = authority.issueInheritedIdentitySeed('manager', owner.profile)
    assert.equal(seed.ok, true, seed.error)
    const root = await dispatch.sendAgentOwnerRootAwait({
      SubscribeTerminal: () => ({ Dispose() {} }),
      SendPrompt: async () => dispatch.admittedWithReceipt(`root-receipt-${session}`),
    }, handle, session, 'Deliver this original Manager charge.', seed.value)
    assert.equal(root.ok, true, root.error)
    const accepted = await dispatch.acceptAgentOwnerRoot(handle, session, root.key, rootPhysical)
    assert.equal(accepted.ok, true, JSON.stringify(accepted.error))
    const profile = accepted.profile
    const rootFile = join(commonDir, 'wanxiangshu', 'events', 'manager-loop-1.ndjson')
    const rootEnvelopes = readFileSync(rootFile, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    let parent = rootEnvelopes.at(-1).event_id
    let sequence = 0
    journal.JournalSurface_dispose(handle)
    handle = null
    const file = join(commonDir, 'wanxiangshu', 'events', 'manager-loop-fixture.ndjson')
    const append = cases => {
      sequence += 1
      const id = 'f' + sequence.toString(16).padStart(39, '0')
      appendFileSync(file, JSON.stringify(canonical({
        event_id: id, event_type: 'JournalEnvelope', parents: [parent], payload_refs: [],
        stream_id: `journal/session/${session}`,
        payload: {
          EventId: ['EventId', id], RuntimeId: ['RuntimeId', 'rt_manager_loop_fixture'],
          LocalSeq: ['LocalSeq', String(sequence)], ObservedAt: '9999-01-01T00:00:00.000+00:00',
          Stream: ['Session', ['SessionId', session]],
          Fact: ['Agent', ['Relay', ['TransactionCommitted', {
            RoadId: ['RoadId', session], Transaction: ['RelayTransaction', cases],
          }]]],
        },
      })) + '\n')
      parent = id
    }
    const incumbent = round => `incumbency:${round}`
    const assessment = round => `assessment:${round}`
    const certificate = round => `certificate:${assessment(round)}`
    const open = round => append([
      ...(round === 1 ? [['RoadOpened', ['RoadId', session], ['AuthorityRevision', rootPhysical],
        ['PhysicalUserMessageId', rootPhysical]]] : []),
      ['IncumbencyOpened', ['IncumbencyId', incumbent(round)], ['WorkspaceSnapshotId', 'snapshot']],
    ])
    const assess = (round, grade) => append([['AssessmentCommitted',
      ['AssessmentId', assessment(round)], ['IncumbencyId', incumbent(round)], {
        PhysicalUserMessageId: rootPhysical, ProviderRunId: `provider:${round}`,
        ToolCallId: `review:${round}`, NarrativeDigest: 'narrative', PayloadDigest: `payload:${grade}`,
        RootRequestDigest: 'root', RequirementSetDigest: 'requirements', EvidenceFrontierDigest: 'evidence',
      }, ['WorkspaceSnapshotId', 'snapshot'], ['AuthorityRevision', rootPhysical],
      ['AssessmentFindings', grade === 'Perfect' ? [] : [
        { AcceptanceCriteria: 'Complete the original charge.', WorkPlan: 'Finish the remaining work.' },
      ]],
    ]])
    const retire = accepted => append([['RetirementCommitted', {
      Id: ['RetirementId', 'retirement:1'], IncumbencyId: ['IncumbencyId', incumbent(1)],
      SnapshotId: ['WorkspaceSnapshotId', 'snapshot'], AuthorityRevision: ['AuthorityRevision', rootPhysical],
      ProjectionCut: { ProviderRunId: 'provider:1', ToolCallId: 'suicide:1' },
      Outcome: accepted ? ['Accepted', ['QualityCertificateId', certificate(1)]] : 'Continue',
    }]])
    const invalidate = round => append([['QualityCertificateInvalidated',
      ['QualityCertificateId', certificate(round)], 'InitialRebaseRequired']])
    const acceptedOutcome = !caseName.startsWith('continue')
    open(1)
    assess(1, acceptedOutcome ? 'Perfect' : 'Revise')
    retire(acceptedOutcome)
    if (acceptedOutcome && caseName !== 'valid-accepted') invalidate(1)
    const activeSuccessor = caseName.endsWith('-active') || caseName.startsWith('missing-') || caseName.startsWith('foreign-')
    if (activeSuccessor) open(2)
    if (caseName === 'missing-certificate') assess(2, 'Revise')
    if (caseName.startsWith('foreign-')) assess(2, 'Perfect')
    if (caseName === 'foreign-invalid-certificate') invalidate(2)
    await reopen()
    const road = () => journal.JournalSurface_snapshot(handle).sessionProjections[session].relay.roads[0]
    assert.equal(road().retiredIncumbencyCount, 1, 'the real cold fold must accept the retired original incumbency')
    assert.equal(road().activeIncumbencyPresent, activeSuccessor)
    assert.equal(road().certificatePresent, acceptedOutcome && caseName !== 'missing-certificate')
    assert.equal(road().latestRetirementPresent, true)
    assert.deepEqual(dispatch.projectionObservation(handle, session).activeLogicalRun, profile,
      'Accepted retirement must retain the original AgentOwnerRoot and logical run')
    await body({ directory, session, profile, road, reopen, terminalPort, completions,
      journal: () => handle, assertSubscriptionLive: () => {
        assert.equal(events.notifyForAuthority(terminalPort, session, 'Failed', rootPhysical, 'original completion observer'), true)
        assert.deepEqual(completions, [{ kind: 'Failed', providerRun: '', text: 'original completion observer', authorityRoot: rootPhysical }])
      } })
  } finally {
    events.dispose(subscription)
    if (handle) journal.JournalSurface_dispose(handle)
    rmSync(directory, { recursive: true, force: true })
  }
}
