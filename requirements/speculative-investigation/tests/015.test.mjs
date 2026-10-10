import test from 'node:test'

{
const { default: assert } = await import("node:assert/strict");
const { createHash } = await import("node:crypto");
const { default: test } = await import("node:test");
const Strength = await import("../../../dist/Strength/Surface.js");
const EventStore = await import("../../../dist/Persistence/EventStore/Surface.js");
const { createLocalEventStore } = await import("../../verification-system/tests/support/local-event-store.mjs");

const STREAM = 'strength/decision-1'

// Pre-delegation wire shapes: snake_case payload fields, tier budget string on
// Prepared, and the four legacy type names.
const legacyEnvelope = (overrides) => ({
  id: 'evt-1',
  stream: STREAM,
  parents: [],
  payload: {},
  payloadRefs: [],
  ...overrides,
})
const legacyPrepared = legacyEnvelope({
  id: 'evt-prepared-1',
  type: 'StrengthCandidatePrepared',
  payload: {
    decision_id: 'decision-1',
    budget: 'K1',
    target_provider_run: 'run-old-1',
    frame_digest: 'frame-digest-old-1',
    byte_length: 123,
  },
})
const legacyPromoted = legacyEnvelope({
  id: 'evt-promoted-1',
  type: 'StrengthCandidatePromoted',
  payload: { decision_id: 'decision-1', target_provider_run: 'run-old-1', frame_digest: 'frame-digest-old-1' },
})
const legacyTraced = legacyEnvelope({
  id: 'evt-traced-1',
  parents: ['evt-promoted-1'],
  type: 'StrengthFramesTraced',
  payload: { decision_id: 'decision-1', start_inclusive: 20, end_exclusive: 24 },
})
const currentPrepared = legacyEnvelope({
  id: 'evt-current-prepared',
  type: 'StrengthCandidatePrepared',
  payload: {
    owner_session_id: 'owner-old-1',
    decision_id: 'decision-1',
    target_provider_run: 'run-old-1',
    replica_session_id: 'replica-old-1',
    anchor_digest: 'anchor-old-1',
    frame_digest: 'frame-digest-old-1',
    byte_length: 123,
  },
})
const currentRequested = legacyEnvelope({
  id: 'evt-current-requested',
  type: 'DelegationRequested',
  payload: { decision_id: 'decision-1', requested_rounds: 2 },
})

// WHAT[015]: the entry check decides from the protocol feature itself.
test('WHAT[speculative-investigation-015] STRENGTH_015_classifier_separates_legacy_current_and_non_strength', () => {
  assert.deepEqual(Strength.migrationClassifyEnvelope('StrengthCandidatePrepared', JSON.stringify(legacyPrepared.payload)), {
    kind: 'legacy',
    reason: 'legacy StrengthCandidatePrepared carries tier budget string',
  })
  for (const tier of ['K0', 'K1', 'K2']) {
    assert.equal(Strength.migrationClassifyEnvelope('StrengthCandidatePrepared', JSON.stringify({ ...legacyPrepared.payload, budget: tier })).kind, 'legacy')
  }
  assert.deepEqual(Strength.migrationClassifyEnvelope('StrengthCandidatePrepared', JSON.stringify(currentPrepared.payload)), { kind: 'current', reason: null })
  assert.deepEqual(Strength.migrationClassifyEnvelope('DelegationRequested', JSON.stringify(currentRequested.payload)), { kind: 'current', reason: null })
  assert.deepEqual(Strength.migrationClassifyEnvelope('JournalAppended', JSON.stringify({ text: 'x' })), { kind: 'not-strength', reason: null })
  // Promoted/Traced/Abandoned keep their names: the type name alone is never
  // evidence, the planner resolves them per decision.
  for (const envelope of [legacyPromoted, legacyTraced]) {
    assert.equal(Strength.migrationClassifyEnvelope(envelope.type, JSON.stringify(envelope.payload)).kind, 'current')
  }
})
test('WHAT[speculative-investigation-015] STRENGTH_015_a_non_tier_budget_field_is_not_legacy_evidence', () => {
  for (const budget of [3, 'N', null]) {
    assert.equal(Strength.migrationClassifyEnvelope('StrengthCandidatePrepared', JSON.stringify({ ...legacyPrepared.payload, budget })).kind, 'current')
  }
})
test('WHAT[speculative-investigation-015] STRENGTH_015_a_current_prepared_is_refused_as_unchanged_protocol', async () => {
  const local = createLocalEventStore()
  try {
    // A current Prepared without its authorization chain fails the fold: the
    // fact is committed with a ProjectionCutTail recording the refusal, and no
    // delegation lifecycle state is folded from it.
    const refused = await EventStore.append(local.store, [{
      ...currentPrepared,
      parents: [],
      payloadRefs: [],
    }])
    assert.equal(refused.ok, true, JSON.stringify(refused.error))
    assert.equal(refused.cuts.length, 1)
    assert.equal(refused.cuts[0].rule, 'Strength')
    assert.match(refused.cuts[0].reason, /Strength integration rejected: PreparedWithoutBound/)
    const projection = Strength.storeCurrent(local.store)
    assert.equal(Strength.projectionRequestedRounds('decision-1', projection), null)
    assert.equal(Strength.projectionCandidate('decision-1', projection), null)
    assert.equal(Strength.projectionIsPromoted('decision-1', projection), false)
    assert.equal(EventStore.read(local.store, 'evt-current-prepared').type, 'StrengthCandidatePrepared')
  } finally { local.close() }
})
}

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");
const Strength = await import("../../../dist/Strength/Surface.js");
const EventStore = await import("../../../dist/Persistence/EventStore/Surface.js");
const { createLocalEventStore } = await import("../../verification-system/tests/support/local-event-store.mjs");
const { createHash } = await import("node:crypto");

const sha256 = (text) => createHash('sha256').update(text).digest('hex')
const legacyPrepared = {
  id: 'evt-prepared-1',
  stream: 'strength/decision-1',
  type: 'StrengthCandidatePrepared',
  parents: [],
  payload: {
    decision_id: 'decision-1',
    budget: 'K1',
    target_provider_run: 'run-old-1',
    frame_digest: 'frame-digest-old-1',
    byte_length: 123,
  },
  payloadRefs: [],
}
const notStrength = { id: 'evt-job-1', stream: 'jobs/other', type: 'JobRequested', parents: [], payload: { id: 'evt-job-1' }, payloadRefs: [] }

// WHAT[015]: the entry check refuses the legacy fact on the integration
// path: the fact is committed with a ProjectionCutTail carrying the migration
// guidance, and nothing is silently skipped mid-read.
test('WHAT[speculative-investigation-015] STRENGTH_015_unmigrated_store_is_refused_with_migration_guidance', async () => {
  const local = createLocalEventStore()
  try {
    const refused = await EventStore.append(local.store, [legacyPrepared])
    assert.equal(refused.ok, true, JSON.stringify(refused.error))
    assert.equal(refused.cuts.length, 1)
    assert.equal(refused.cuts[0].rule, 'Strength')
    const detail = JSON.stringify(refused.cuts[0].reason)
    assert.match(detail, /predates the readonly delegation protocol/)
    assert.match(detail, /run the offline migration first/)
    assert.match(detail, /migrate-delegation-history\.mjs/)
    assert.match(detail, /--contract-revision/)
    assert.match(detail, /the runtime never migrates data/)
    // The refusal folds nothing: the lifecycle views stay empty and the legacy
    // fact itself is on disk, unchanged.
    const projection = Strength.storeCurrent(local.store)
    assert.equal(Strength.projectionRequestedRounds('decision-1', projection), null)
    assert.equal(Strength.projectionCandidate('decision-1', projection), null)
    assert.equal(EventStore.streams(local.store).includes('strength/decision-1'), true)
    assert.equal(EventStore.read(local.store, 'evt-prepared-1').payload.budget, 'K1')
  } finally { local.close() }
})
test('WHAT[speculative-investigation-015] STRENGTH_015_non_strength_events_are_not_blocked_by_the_strength_entry_check', async () => {
  const local = createLocalEventStore()
  try {
    // A foreign event type is not a Strength fact at all: the Strength rule
    // does not accept it, so it neither migrates nor blocks.
    const appended = await EventStore.append(local.store, [notStrength])
    assert.equal(appended.ok, true, JSON.stringify(appended.error))
    assert.equal(EventStore.read(local.store, 'evt-job-1').type, 'JobRequested')
  } finally { local.close() }
})
// The classify → plan → import chain is pure: no store is opened, touched or
// written on the runtime read path. Migration is never an implicit side effect.
test('WHAT[speculative-investigation-015] STRENGTH_015_migration_is_not_a_runtime_side_effect_on_read', async () => {
  const local = createLocalEventStore()
  try {
    const read = Strength.migrationReadLegacyEnvelope(JSON.stringify(legacyPrepared))
    assert.equal(read.eventType, 'StrengthCandidatePrepared')
    const planned = Strength.migrationPlanDecision(sha256, 1, [read])
    assert.equal(planned.ok, true)
    const imported = Strength.migrationImportEvent(sha256, planned.value[0])
    assert.equal(imported.ok, true)
    // No store was needed and none was written.
    assert.deepEqual(EventStore.streams(local.store), [])
    assert.equal(EventStore.read(local.store, 'evt-prepared-1'), null)
  } finally { local.close() }
})
}

{
const { default: assert } = await import("node:assert/strict");
const { createHash } = await import("node:crypto");
const { default: test } = await import("node:test");
const Strength = await import("../../../dist/Strength/Surface.js");
const { createLocalEventStore } = await import("../../verification-system/tests/support/local-event-store.mjs");

const sha256 = (text) => createHash('sha256').update(text).digest('hex')
const STREAM = 'strength/decision-1'
const FRAME_MATERIAL = new TextEncoder().encode(JSON.stringify({ digest: 'frame-digest-old-1', byteLength: 123 }))
const envelope = (overrides) => ({ id: 'evt', stream: STREAM, parents: [], payload: {}, payloadRefs: [], ...overrides })

const legacyEnvelopes = async (local) => {
  const ref = (await Strength.storeWritePayload(local.store, FRAME_MATERIAL)).value
  const prepared = envelope({
    id: 'evt-prepared-1',
    type: 'StrengthCandidatePrepared',
    payload: { decision_id: 'decision-1', budget: 'K1', target_provider_run: 'run-old-1', frame_digest: 'frame-digest-old-1', byte_length: 123 },
    payloadRefs: [ref],
  })
  const promoted = envelope({
    id: 'evt-promoted-1',
    type: 'StrengthCandidatePromoted',
    payload: { decision_id: 'decision-1', target_provider_run: 'run-old-1', frame_digest: 'frame-digest-old-1' },
    payloadRefs: [ref],
  })
  const traced = envelope({
    id: 'evt-traced-1',
    parents: ['evt-promoted-1'],
    type: 'StrengthFramesTraced',
    payload: { decision_id: 'decision-1', start_inclusive: 20, end_exclusive: 24 },
  })
  const abandoned = envelope({
    id: 'evt-abandoned-1',
    type: 'StrengthCandidateAbandoned',
    payload: { decision_id: 'decision-1', target_provider_run: 'run-old-2' },
  })
  return { ref, prepared, promoted, traced, abandoned }
}

test('WHAT[speculative-investigation-015] STRENGTH_015_legacy_envelope_reader_returns_the_pre_protocol_view_or_null', async () => {
  const local = createLocalEventStore()
  try {
    const { ref, prepared, promoted, traced, abandoned } = await legacyEnvelopes(local)
    const readPrepared = Strength.migrationReadLegacyEnvelope(JSON.stringify(prepared))
    assert.equal(readPrepared.eventType, 'StrengthCandidatePrepared')
    assert.equal(readPrepared.decisionId, 'decision-1')
    assert.equal(readPrepared.sourceStreamId, STREAM)
    assert.equal(readPrepared.budgetEvidence, 'K1')
    assert.equal(readPrepared.targetProviderRun, 'run-old-1')
    assert.equal(readPrepared.frameDigest, 'frame-digest-old-1')
    assert.equal(readPrepared.byteLength, 123)
    assert.deepEqual(readPrepared.materialPayloads, [ref])
    assert.equal(readPrepared.tracedStartInclusive, null)

    const readPromoted = Strength.migrationReadLegacyEnvelope(JSON.stringify(promoted))
    assert.equal(readPromoted.budgetEvidence, null)
    const readTraced = Strength.migrationReadLegacyEnvelope(JSON.stringify(traced))
    assert.equal(String(readTraced.tracedStartInclusive), '20')
    assert.equal(String(readTraced.tracedEndExclusive), '24')
    const readAbandoned = Strength.migrationReadLegacyEnvelope(JSON.stringify(abandoned))
    assert.equal(readAbandoned.eventType, 'StrengthCandidateAbandoned')

    assert.equal(Strength.migrationReadLegacyEnvelope(JSON.stringify({ ...prepared, type: 'DelegationRequested' })), null)
    assert.equal(Strength.migrationReadLegacyEnvelope('{'), null)
  } finally { local.close() }
})
test('WHAT[speculative-investigation-015] STRENGTH_015_promoted_history_becomes_adopted_material_with_its_trace_coverage', async () => {
  const local = createLocalEventStore()
  try {
    const legacy = await legacyEnvelopes(local)
    const views = [legacy.prepared, legacy.promoted, legacy.traced].map((item) => Strength.migrationReadLegacyEnvelope(JSON.stringify(item)))
    const planned = Strength.migrationPlanDecision(sha256, 1, views)
    assert.equal(planned.ok, true, planned.error)
    const facts = planned.value
    assert.equal(facts.length, 3)
    assert.deepEqual(facts.map((fact) => fact.outcomeKind), ['adopted', 'adopted', 'adopted'])
    for (const fact of facts) {
      assert.equal(fact.oldBudgetEvidence, 'K1', 'the old tier budget rides only the evidence field')
      assert.equal(fact.targetProviderRun, 'run-old-1')
      assert.equal(fact.frameDigest, 'frame-digest-old-1')
      assert.equal(fact.byteLength, 123)
      assert.deepEqual(fact.materialPayloads, [legacy.ref])
      assert.equal(String(fact.tracedStartInclusive), '20')
      assert.equal(String(fact.tracedEndExclusive), '24')
      assert.equal(fact.relinquishReason, null)
      for (const forbidden of ['budget', 'requestedRounds', 'tier', 'rolloutMode']) {
        assert.equal(forbidden in fact, false)
      }
    }
    assert.equal(facts[2].sourceEventId, 'evt-traced-1')
  } finally { local.close() }
})
test('WHAT[speculative-investigation-015] STRENGTH_015_unconsumed_prepared_and_abandoned_decisions_are_relinquished_with_reasons', async () => {
  const local = createLocalEventStore()
  try {
    const legacy = await legacyEnvelopes(local)
    const onlyPrepared = Strength.migrationPlanDecision(sha256, 1, [Strength.migrationReadLegacyEnvelope(JSON.stringify(legacy.prepared))])
    assert.equal(onlyPrepared.ok, true)
    assert.equal(onlyPrepared.value.length, 1)
    assert.equal(onlyPrepared.value[0].outcomeKind, 'relinquished')
    assert.equal(onlyPrepared.value[0].relinquishReason, 'prepared-without-promotion')
    assert.equal(onlyPrepared.value[0].oldBudgetEvidence, 'K1')
    assert.equal(onlyPrepared.value[0].targetProviderRun, 'run-old-1')

    const abandonedOnly = Strength.migrationPlanDecision(sha256, 1, [Strength.migrationReadLegacyEnvelope(JSON.stringify(legacy.abandoned))])
    assert.equal(abandonedOnly.ok, true)
    assert.equal(abandonedOnly.value[0].outcomeKind, 'relinquished')
    assert.equal(abandonedOnly.value[0].relinquishReason, 'abandoned-before-promotion')
    assert.equal(abandonedOnly.value[0].oldBudgetEvidence, null)
  } finally { local.close() }
})
test('WHAT[speculative-investigation-015] STRENGTH_015_traced_material_without_its_promotion_fails_the_plan_closed', async () => {
  const local = createLocalEventStore()
  try {
    const legacy = await legacyEnvelopes(local)
    const planned = Strength.migrationPlanDecision(sha256, 1, [Strength.migrationReadLegacyEnvelope(JSON.stringify(legacy.traced))])
    assert.equal(planned.ok, false)
    assert.match(planned.error, /FramesTraced without its Promoted material/)
  } finally { local.close() }
})
test('WHAT[speculative-investigation-015] STRENGTH_015_import_fact_mints_only_a_history_import_never_an_authorization', async () => {
  const local = createLocalEventStore()
  try {
    const legacy = await legacyEnvelopes(local)
    const views = [legacy.prepared, legacy.promoted, legacy.traced].map((item) => Strength.migrationReadLegacyEnvelope(JSON.stringify(item)))
    const fact = Strength.migrationPlanDecision(sha256, 1, views).value[1]
    const imported = Strength.migrationImportEvent(sha256, fact)
    assert.equal(imported.ok, true, imported.error)
    const event = imported.value
    assert.equal(event.type, 'DelegationHistoryImported')
    assert.equal(event.stream, STREAM)
    assert.deepEqual(event.parents, [])
    assert.deepEqual(event.payloadRefs, [])
    const payload = event.payload
    assert.equal(payload.decision_id, 'decision-1')
    assert.equal(payload.source_stream_id, STREAM)
    assert.equal(payload.source_event_id, 'evt-promoted-1')
    assert.equal(payload.old_budget_evidence, 'K1')
    assert.equal(payload.outcome.kind, 'adopted')
    assert.equal(payload.outcome.target_provider_run, 'run-old-1')
    assert.equal(payload.outcome.frame_digest, 'frame-digest-old-1')
    assert.equal(payload.outcome.byte_length, 123)
    assert.deepEqual(payload.outcome.payload_refs, [legacy.ref])
    assert.equal(String(payload.outcome.traced_start_inclusive), '20')
    for (const forbidden of ['budget', 'requested_rounds', 'tier', 'billing', 'owner_session_id', 'source_tool_call_ids', 'logical_run_id']) {
      assert.equal(forbidden in payload, false, `the import must not mint ${forbidden}`)
      assert.equal(forbidden in payload.outcome, false)
    }

    // The import identity is derived from the source event and the contract
    // revision, never from the wall clock.
    const again = Strength.migrationImportEvent(sha256, fact)
    assert.equal(again.value.id, event.id)
  } finally { local.close() }
})
test('WHAT[speculative-investigation-015] STRENGTH_015_a_changed_contract_revision_derives_a_different_import_identity', async () => {
  const local = createLocalEventStore()
  try {
    const legacy = await legacyEnvelopes(local)
    const view = Strength.migrationReadLegacyEnvelope(JSON.stringify(legacy.promoted))
    const first = Strength.migrationPlanDecision(sha256, 1, [view]).value[0]
    const second = Strength.migrationPlanDecision(sha256, 2, [view]).value[0]
    assert.notEqual(first.importId, second.importId)
    assert.notEqual(Strength.migrationImportEvent(sha256, first).value.id, Strength.migrationImportEvent(sha256, second).value.id)
    assert.equal(first.oldBudgetEvidence, null)
  } finally { local.close() }
})
}

{
const { default: assert } = await import("node:assert/strict");
const { createHash } = await import("node:crypto");
const { default: test } = await import("node:test");
const Strength = await import("../../../dist/Strength/Surface.js");
const EventStore = await import("../../../dist/Persistence/EventStore/Surface.js");
const { createLocalEventStore } = await import("../../verification-system/tests/support/local-event-store.mjs");

const sha256 = (text) => createHash('sha256').update(text).digest('hex')
const STREAM = 'strength/decision-1'
const FRAME_MATERIAL = new TextEncoder().encode(JSON.stringify({ digest: 'frame-digest-old-1', byteLength: 123 }))

// End-to-end on a temporary EventStore copy: legacy envelopes are classified,
// planned and imported; the import is appended once, idempotent on re-run, and
// cold replay reads every fact back byte-identically.
test('WHAT[speculative-investigation-015] STRENGTH_015_imported_history_folds_as_evidence_and_never_as_an_admission', async () => {
  const local = createLocalEventStore()
  try {
    const ref = (await Strength.storeWritePayload(local.store, FRAME_MATERIAL)).value
    const envelope = (id, type, payload, parents = []) => ({ id, stream: STREAM, parents, type, payload, payloadRefs: [ref] })
    const legacy = [
      envelope('evt-prepared-1', 'StrengthCandidatePrepared', { decision_id: 'decision-1', budget: 'K1', target_provider_run: 'run-old-1', frame_digest: 'frame-digest-old-1', byte_length: 123 }),
      envelope('evt-promoted-1', 'StrengthCandidatePromoted', { decision_id: 'decision-1', target_provider_run: 'run-old-1', frame_digest: 'frame-digest-old-1' }),
      envelope('evt-traced-1', 'StrengthFramesTraced', { decision_id: 'decision-1', start_inclusive: 20, end_exclusive: 24 }, ['evt-promoted-1']),
    ]
    const views = legacy.map((item) => Strength.migrationReadLegacyEnvelope(JSON.stringify(item)))
    assert.deepEqual(views.map((view) => view.budgetEvidence), ['K1', null, null])
    const planned = Strength.migrationPlanDecision(sha256, 1, views)
    assert.equal(planned.ok, true, planned.error)
    const events = planned.value.map((fact) => Strength.migrationImportEvent(sha256, fact))
    for (const imported of events) assert.equal(imported.ok, true, imported.error)

    for (const { value } of events) {
      const appended = await EventStore.append(local.store, [value])
      assert.equal(appended.ok, true, JSON.stringify(appended.error))
      assert.deepEqual(appended.cuts, [])
    }

    // Every envelope in the strength stream is current protocol: nothing
    // legacy survives, and nothing was rewritten in place.
    for (const streamId of EventStore.streams(local.store)) {
      assert.equal(streamId, STREAM)
      for (const eventId of EventStore.heads(local.store, streamId)) {
        const stored = EventStore.read(local.store, eventId)
        assert.equal(Strength.migrationClassifyEnvelope(stored.type, JSON.stringify(stored.payload)).kind, 'current')
      }
    }

    // Imported history is evidence only: it mints no admission, binds no
    // target, and starts no replica lifecycle.
    const projection = Strength.storeCurrent(local.store)
    assert.equal(Strength.projectionDecisionForTarget('run-old-1', projection), null)
    assert.equal(Strength.projectionCandidate('decision-1', projection), null)
    assert.equal(Strength.projectionRequestedRounds('decision-1', projection), null)
    assert.equal(Strength.projectionIsPromoted('decision-1', projection), false)

    // Imported history is also positively observable through the fold: every
    // import identity reads its evidence back from the projection, and the
    // causal position, the digest and the trace coverage survive the fold
    // (WHAT[015]).
    const importIds = planned.value.map((fact) => fact.importId)
    assert.equal(new Set(importIds).size, events.length)
    for (const { value: event } of events) {
      const folded = Strength.projectionImported(event.payload.import_id, projection)
      assert.notEqual(folded, null)
      assert.equal(folded.decisionId, event.payload.decision_id)
      assert.equal(folded.sourceStreamId, event.payload.source_stream_id)
      assert.equal(folded.sourceEventId, event.payload.source_event_id)
      assert.equal(folded.oldBudgetEvidence ?? null, event.payload.old_budget_evidence ?? null)
      assert.equal(folded.outcome.kind, event.payload.outcome.kind)
      if (event.payload.outcome.reason != null) {
        assert.equal(folded.outcome.reason, event.payload.outcome.reason)
      }
      if (event.payload.outcome.target_provider_run != null) {
        assert.equal(folded.outcome.targetProviderRun, event.payload.outcome.target_provider_run)
      }
      if (event.payload.outcome.frame_digest != null) {
        assert.equal(folded.outcome.frameDigest, event.payload.outcome.frame_digest)
        assert.equal(folded.outcome.byteLength, event.payload.outcome.byte_length)
        assert.deepEqual(folded.outcome.materialPayloads, event.payload.outcome.payload_refs)
      }
      if (event.payload.outcome.traced_start_inclusive != null) {
        assert.equal(String(folded.outcome.tracedStartInclusive), String(event.payload.outcome.traced_start_inclusive))
        assert.equal(String(folded.outcome.tracedEndExclusive), String(event.payload.outcome.traced_end_exclusive))
      }
    }
    // An identity that was never migrated reads null, and folding the same
    // import again stays idempotent.
    assert.equal(Strength.projectionImported('import-never-migrated', projection), null)
    const firstImportedView = Strength.projectionImported(events[0].value.payload.import_id, projection)
    const refolded = Strength.projectionApply(projection, Strength.eventHistoryImported(
      events[0].value.payload.decision_id,
      events[0].value.payload.source_stream_id,
      events[0].value.payload.source_event_id,
      events[0].value.payload.import_id,
      events[0].value.payload.old_budget_evidence ?? null,
      events[0].value.payload.outcome,
    ))
    assert.equal(refolded.ok, true, refolded.error)
    assert.deepEqual(Strength.projectionImported(events[0].value.payload.import_id, refolded.value), firstImportedView)

    // The legacy envelopes stay exactly as they were read: the planner never
    // rewrites the source material, it only records a reference to it.
    const beforePlanning = views.map((view) => JSON.stringify(view))
    Strength.migrationPlanDecision(sha256, 1, views)
    assert.deepEqual(views.map((view) => JSON.stringify(view)), beforePlanning)

    // Re-running the whole migration appends nothing new and changes nothing.
    const firstRead = planned.value.map((fact) => EventStore.read(local.store, Strength.migrationImportEvent(sha256, fact).value.id))
    const secondRun = planned.value.map((fact) => Strength.migrationImportEvent(sha256, fact))
    for (const { value } of secondRun) {
      const again = await EventStore.append(local.store, [value])
      assert.equal(again.ok, true)
    }
    const afterRerun = planned.value.map((fact) => EventStore.read(local.store, Strength.migrationImportEvent(sha256, fact).value.id))
    assert.equal(JSON.stringify(afterRerun), JSON.stringify(firstRead))
    const reopened = EventStore.create(local.commonDir, 'migrate-verify-1')
    try {
      const coldRead = planned.value.map((fact) => EventStore.read(reopened, Strength.migrationImportEvent(sha256, fact).value.id))
      assert.equal(JSON.stringify(coldRead), JSON.stringify(firstRead))
      assert.deepEqual(coldRead.map((item) => item.type), ['DelegationHistoryImported', 'DelegationHistoryImported', 'DelegationHistoryImported'])
      const reopenedProjection = Strength.storeCurrent(reopened)
      assert.equal(Strength.projectionCandidate('decision-1', reopenedProjection), null)
      // Cold replay folds the imported evidence back as well.
      assert.notEqual(Strength.projectionImported(importIds[0], reopenedProjection), null)
      assert.equal(Strength.projectionDecisionForTarget('run-old-1', reopenedProjection), null)
      assert.equal(Strength.projectionRequestedRounds('decision-1', reopenedProjection), null)
    } finally { EventStore.dispose(reopened) }
  } finally { local.close() }
})
}

{
const { default: assert } = await import("node:assert/strict");
const { spawnSync } = await import("node:child_process");
const { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { dirname, join, resolve } = await import("node:path");
const { fileURLToPath, pathToFileURL } = await import("node:url");
const { default: test } = await import("node:test");

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const STREAM = 'strength/decision-1'
const WRITER_ID = 'migrate-fixture-1'

// WHAT[015]: the offline tool's version parameters are registry-checked. The
// backup fixture is one legacy decision written as canonical NDJSON lines:
// keys sorted by code point, one self-contained record per line.
const sortValue = (value) => {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]))
  }
  return value
}
const canonicalLine = (envelope) => JSON.stringify(sortValue(envelope)) + '\n'

const copyBackupWithLegacyDecision = () => {
  const base = mkdtempSync(join(tmpdir(), 'wxs-migrate-backup-'))
  const commonDir = join(base, '.git')
  mkdirSync(join(commonDir, 'wanxiangshu', 'events'), { recursive: true })
  const envelopes = [
    { event_id: 'evt-prepared-1', stream_id: STREAM, parents: [], event_type: 'StrengthCandidatePrepared', payload: { decision_id: 'decision-1', budget: 'K1', target_provider_run: 'run-old-1', frame_digest: 'frame-digest-old-1', byte_length: 123 }, payload_refs: [] },
    { event_id: 'evt-promoted-1', stream_id: STREAM, parents: [], event_type: 'StrengthCandidatePromoted', payload: { decision_id: 'decision-1', target_provider_run: 'run-old-1', frame_digest: 'frame-digest-old-1' }, payload_refs: [] },
    { event_id: 'evt-traced-1', stream_id: STREAM, parents: ['evt-promoted-1'], event_type: 'StrengthFramesTraced', payload: { decision_id: 'decision-1', start_inclusive: 20, end_exclusive: 24 }, payload_refs: [] },
  ]
  writeFileSync(join(commonDir, 'wanxiangshu', 'events', WRITER_ID + '.ndjson'), envelopes.map(canonicalLine).join(''))
  return { base, commonDir }
}

const backupInventory = (directory, prefix = '') =>
  readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name)).flatMap(entry => {
    const path = join(directory, entry.name)
    const name = prefix + entry.name
    const mode = lstatSync(path).mode
    if (entry.isDirectory()) return [{ name, mode, kind: 'directory' }, ...backupInventory(path, name + '/')]
    assert.equal(entry.isFile(), true, 'the legacy backup fixture contains only ordinary files')
    return [{ name, mode, kind: 'file', bytes: readFileSync(path).toString('base64') }]
  })

const runMigration = (backup, reportPath, args, entry = resolve(repoRoot, 'scripts/migrate-delegation-history.mjs')) => {
  const receipt = reportPath + '.loads.ndjson'
  const before = backupInventory(backup)
  const launched = spawnSync(
    process.execPath,
    ['--import', fileURLToPath(new URL('./support/migration-load-observer.mjs', import.meta.url)),
      entry, '--backup', backup, '--report', reportPath, ...args],
    { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, WXS_MIGRATION_LOAD_RECEIPT: receipt } },
  )
  assert.equal(launched.error, undefined)
  assert.deepEqual(backupInventory(backup), before, 'all original backup bytes, entries and modes must remain')
  assert.equal(existsSync(receipt), true, 'a missing observer is not zero business loads')
  const observations = readFileSync(receipt, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(observations[0], { phase: 'ready', sequence: 0, pid: launched.pid, entry })
  assert.deepEqual(observations.at(-1), { phase: 'exit', sequence: observations.length - 1, pid: launched.pid, code: launched.status })
  assert.ok(observations.every((value, index) => value.pid === launched.pid && value.sequence === index))
  return { ...launched, loads: observations.filter(value => value.phase === 'actual-next-load-complete').map(value => value.url) }
}

test('WHAT[speculative-investigation-015] STRENGTH_015_the_migration_script_rejects_an_unregistered_input_version', async () => {
  const { base, commonDir } = copyBackupWithLegacyDecision()
  const report = join(base, 'report.json')
  try {
    const run = runMigration(commonDir, report, ['--input-version', 'pre-delegation-v0', '--contract-revision', '1'])
    assert.equal(run.status, 2)
    assert.equal(run.stderr, '--input-version 必须是已登记的值: pre-delegation；收到: pre-delegation-v0\n')
    assert.equal(existsSync(report), false, '拒绝后不得写报告')
    assert.deepEqual(run.loads, [], 'invalid input versions must not load either runtime front door')
  } finally { rmSync(base, { recursive: true, force: true }) }
})

test('WHAT[speculative-investigation-015] STRENGTH_015_the_migration_script_rejects_an_unregistered_contract_revision', async () => {
  const { base, commonDir } = copyBackupWithLegacyDecision()
  const report = join(base, 'report.json')
  try {
    const run = runMigration(commonDir, report, ['--input-version', 'pre-delegation', '--contract-revision', '2'])
    assert.equal(run.status, 2)
    assert.equal(run.stderr, '--contract-revision 必须是已登记的值: 1（运行时契约修订，见 src/Wanxiangshu/Strength/OpenCode/Delegate.fs:40 的 DelegationContractRevisions.create 1）；收到: 2\n')
    assert.equal(existsSync(report), false, '拒绝后不得写报告')
    assert.deepEqual(run.loads, [], 'invalid contract revisions must not load either runtime front door')
  } finally { rmSync(base, { recursive: true, force: true }) }
})

test('WHAT[speculative-investigation-015] STRENGTH_015_the_registered_version_path_still_dry_runs_the_full_plan', async () => {
  const { base, commonDir } = copyBackupWithLegacyDecision()
  const report = join(base, 'report.json')
  try {
    const run = runMigration(commonDir, report, ['--input-version', 'pre-delegation', '--contract-revision', '1'])
    assert.equal(run.status, 0, String(run.stderr))
    assert.deepEqual(run.loads, [
      pathToFileURL(resolve(repoRoot, 'dist/Persistence/EventStore/Surface.js')).href,
      pathToFileURL(resolve(repoRoot, 'dist/Strength/Surface.js')).href,
    ], 'the same actual observer must see both real runtime front doors on the valid path')
    const parsed = JSON.parse(readFileSync(report, 'utf8'))
    assert.equal(parsed.mode, 'dry-run')
    assert.equal(parsed.inputVersion, 'pre-delegation')
    assert.equal(parsed.contractRevision, 1)
    assert.equal(parsed.plan.importFacts, 3)
    assert.equal(parsed.plan.adopted, 3)
    assert.equal(parsed.plan.appended, 0)
    assert.equal(parsed.decisions.length, 1)
    for (const fact of parsed.decisions[0].facts) {
      assert.equal(fact.outcomeKind, 'adopted')
      assert.equal(fact.byteLength, 123)
      assert.equal(fact.oldBudgetEvidence, 'K1')
      assert.equal(String(fact.tracedStartInclusive), '20')
      assert.equal(String(fact.tracedEndExclusive), '24')
    }
  } finally { rmSync(base, { recursive: true, force: true }) }
})

test('WHAT[speculative-investigation-015] invalid version refusal precedes a missing dist runtime', () => {
  const { base, commonDir } = copyBackupWithLegacyDecision()
  const scripts = join(base, 'without-dist', 'scripts')
  mkdirSync(scripts, { recursive: true })
  const entry = join(scripts, 'migrate-delegation-history.mjs')
  copyFileSync(resolve(repoRoot, 'scripts/migrate-delegation-history.mjs'), entry)
  const report = join(base, 'report.json')
  try {
    const run = runMigration(commonDir, report, ['--input-version', 'pre-delegation-v0', '--contract-revision', '1'], entry)
    assert.equal(run.status, 2)
    assert.equal(run.stderr, '--input-version 必须是已登记的值: pre-delegation；收到: pre-delegation-v0\n')
    assert.equal(existsSync(report), false)
    assert.deepEqual(run.loads, [])
  } finally { rmSync(base, { recursive: true, force: true }) }
})

test('WHAT[speculative-investigation-015] STRENGTH_015_the_migration_registry_matches_the_runtime_contract', async () => {
  // WHAT[015]: the tool's registered input version and contract revision govern
  // offline historical migration, while the runtime contract revision is governed
  // by the code-level ProtocolRevision constant.
  // The guidance emitted by the runtime classifier directs operators to the
  // script's registered offline migration targets.
  const script = readFileSync(resolve(repoRoot, 'scripts/migrate-delegation-history.mjs'), 'utf8')
  const registryInputVersions = script.match(/const INPUT_VERSIONS = \[([^\]]*)\]/)
  const registryRevisions = script.match(/const CONTRACT_REVISIONS = \[([^\]]*)\]/)
  assert.notEqual(registryInputVersions, null, '迁移脚本必须以 INPUT_VERSIONS 登记输入版本')
  assert.notEqual(registryRevisions, null, '迁移脚本必须以 CONTRACT_REVISIONS 登记契约修订')
  const inputVersions = registryInputVersions[1]
    .split(',')
    .map((token) => token.trim().replace(/^['"]|['"]$/g, ''))
    .filter((token) => token.length > 0)
  const contractRevisions = registryRevisions[1]
    .split(',')
    .map((token) => Number(token.trim()))

  const classifierSource = readFileSync(resolve(repoRoot, 'src/Wanxiangshu/Strength/Migration/LegacyProtocolClassifier.fs'), 'utf8')
  const guidanceInputVersion = classifierSource.match(/--input-version ([\w.-]+)/)
  const guidanceRevision = classifierSource.match(/--contract-revision (\d+)/)
  assert.notEqual(guidanceInputVersion, null, '运行时拒绝指引必须写明 --input-version 取值')
  assert.notEqual(guidanceRevision, null, '运行时拒绝指引必须写明 --contract-revision 取值')
  assert.deepEqual(inputVersions, [guidanceInputVersion[1]], '迁移登记的输入版本必须等于运行时指引写给操作者的取值')
  assert.deepEqual(contractRevisions, [Number(guidanceRevision[1])], '迁移登记的契约修订必须等于运行时指引写给操作者的取值')
})
}
