import test from 'node:test'

{
const { default: assert } = await import("node:assert/strict");
const { existsSync, readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
const { readFile } = await import("node:fs/promises");
const { default: path } = await import("node:path");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { default: test } = await import("node:test");
const eventStore = await import("../../../dist/Persistence/EventStore/Surface.js");
const journal = await import("../../../dist/Persistence/Journal/Surface.js");

const id = (n) => n.toString(16).padStart(40, '0')
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}
const canonicalEventLine = (event) => `${JSON.stringify(canonicalize(event))}\n`
const withTemp = (fn) => {
  const base = mkdtempSync(join(tmpdir(), 'wxs-event-store-append-'))
  return fn(base)
}
const event = (n, parents = [], type = 'JobRequested', payload = { n }) => ({
  id: id(n),
  stream: 'append/proof',
  type,
  parents: parents.map((p) => id(p)),
  payload,
  payloadRefs: [],
})

test('WHAT[durable-events-013] before-append directory failure leaves bytes event and structural Current unchanged', async () => {
  const dir = withTemp((base) => base)
  const store = eventStore.create(dir, 'append-failure-proof')
  try {
    const wanxiangDir = path.join(dir, 'wanxiangshu')
    mkdirSync(wanxiangDir, { recursive: true })
    const eventsPath = path.join(wanxiangDir, 'events')
    const beforeBytes = Buffer.from('not a directory', 'utf8')
    writeFileSync(eventsPath, beforeBytes)
    const incoming = event(3)

    const rejected = await eventStore.append(store, [incoming])

    assert.equal(rejected.ok, false)
    const { cause, ...failure } = rejected.error
    assert.deepEqual(failure, {
      code: 'AppendNotAttempted', phase: 'BeforePhysicalAppend', cleanupFailures: [],
      requested: [incoming], prepared: { durableEvents: [incoming], cuts: [] }, priorRejection: null,
    })
    assert.ok(cause instanceof Error)
    assert.equal(cause.code, 'EEXIST')
    assert.equal(cause.syscall, 'mkdir')
    assert.equal(cause.path, eventsPath)
    assert.deepEqual(readFileSync(eventsPath), beforeBytes, 'the blocking ordinary file must remain byte-identical')
    assert.equal(existsSync(path.join(eventsPath, 'append-failure-proof.ndjson')), false)
    assert.equal(existsSync(path.join(dir, 'wanxiangshu.lock')), false, 'the acquired physical gate is released')
    assert.equal(eventStore.read(store, id(3)), null, 'the unattempted append must not publish its prepared event')
    assert.equal(eventStore.head(store, 'append/proof'), null, 'the unattempted append must not advance Current')
    assert.deepEqual(eventStore.heads(store, 'append/proof'), [])
  } finally {
    eventStore.dispose(store)
    rmSync(dir, { recursive: true, force: true })
  }
})
}

{
const { default: assert } = await import("node:assert/strict");
const { execFileSync } = await import("node:child_process");
const { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { default: test } = await import("node:test");
const journal = await import("../../../dist/Persistence/Journal/Surface.js");

const CLOSED = {
  family: 'Companion',
  case: 'CompanionBloggerClosed',
  payload: { SessionId: 'ses_es_boot' },
}
const mustOk = (result, label) => {
  assert.equal(result.ok, true, `${label}: ${JSON.stringify(result.error)}`)
  return result
}
const withRepo = (fn) => {
  const repo = mkdtempSync(join(tmpdir(), 'wxs-journal-boot-'))
  execFileSync('git', ['init', '--quiet', repo])
  const commonDir = join(repo, '.git')
  return fn(commonDir)
    .finally(() => rmSync(repo, { recursive: true, force: true }))
}

test('WHAT[durable-events-013] restart_replays_prior_writer_files_then_fresh_runtime_starts_LocalSeq_at_1', async () => {
  await withRepo(async (commonDir) => {
    const first = mustOk(await journal.JournalSurface_bootWithWriterId(commonDir, 'boot-writer-a', 'rt_before', 4242, '2026-04-01T00:00:00Z'), 'first boot')

    assert.equal(Number(first.localSeq), 1)
    const firstAppend = mustOk(
      await journal.JournalSurface_appendAgent(first.journal, { kind: 'Session', session: 'ses_es_boot' }, null, CLOSED),
      'first append',
    )
    assert.ok(journal.JournalSurface_hasSession(first.journal, 'ses_es_boot'))
    journal.JournalSurface_dispose(first.journal)

    const restarted = mustOk(await journal.JournalSurface_bootWithWriterId(commonDir, 'boot-writer-b', 'rt_after', 5252, '2026-04-02T00:00:00Z'), 'reboot')
    assert.equal(Number(restarted.localSeq), 1, 'fresh RuntimeId owns a fresh LocalSeq domain')
    assert.ok(journal.JournalSurface_hasSession(restarted.journal, 'ses_es_boot'), 'prior journal fact is rebuilt only through Integrator boot replay')
    journal.JournalSurface_dispose(restarted.journal)
  })
})
test('WHAT[durable-events-013] boot_and_live_use_one_CanonicalIntegrator_program', async () => {
  const { readFile } = await import('node:fs/promises')
  const integrator = await readFile(new URL('../../../src/Wanxiangshu/Persistence/EventStore/IntegratorEngine.fs', import.meta.url), 'utf8')
  const writer = await readFile(new URL('../../../src/Wanxiangshu/Persistence/Journal/EventStoreJournalWriter.fs', import.meta.url), 'utf8')
  assert.match(integrator, /EventKWayMerge\.merge/)
  assert.match(integrator, /integrateOne/)
  assert.match(integrator, /prepareLive/)
  assert.doesNotMatch(writer, /readStreams|loadEvent|Fold\.apply|OpenSnapshot/)
})
}

{
const { default: assert } = await import("node:assert/strict");
const { execFileSync } = await import("node:child_process");
const { existsSync, mkdtempSync, readFileSync, rmSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { default: test } = await import("node:test");
const journal = await import("../../../dist/Persistence/Journal/Surface.js");

const CLOSED_AGENT = {
  family: 'Companion',
  case: 'CompanionBloggerClosed',
  payload: { SessionId: 'ses_es_writer' },
}
const mustOk = (result, label) => {
  assert.equal(result.ok, true, `${label}: ${JSON.stringify(result.error)}`)
  return result
}
const withRepo = (writerId, fn) => {
  const repo = mkdtempSync(join(tmpdir(), 'wxs-journal-'))
  execFileSync('git', ['init', '--quiet', repo])
  const commonDir = join(repo, '.git')
  return fn(commonDir)
    .finally(() => rmSync(repo, { recursive: true, force: true }))
}

test('WHAT[durable-events-013] journal_surface_does_not_mint_terminal_proof_from_forged_strings', () => {
  assert.equal(Object.hasOwn(journal, 'JournalSurface_recordTerminalCompletion'), false)
})
}

{
const { default: assert } = await import("node:assert/strict");
const { execFileSync } = await import("node:child_process");
const { mkdtempSync, rmSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { default: test } = await import("node:test");
const journal = await import("../../../dist/Persistence/Journal/Surface.js");
const revisions = await import("../../../dist/Persistence/Journal/RevisionSurface.js");
const observation = await import("../../../dist/Verification/JournalPortObservationSurface.js");

const lifeOpened = (session) => ({
  case: 'LifeOpened',
  payload: {
    SessionId: session,
    LifeId: `life-${session}`,
    OpeningUserMessageId: `msg-${session}`,
    OpeningTextRef: 'blobs/placeholder',
    OpeningTextDigest: 'sha-placeholder',
    OpeningCursorSequence: 1,
  },
})
const openJournal = async (writerId) => {
  const repo = mkdtempSync(join(tmpdir(), `wxs-jrev-${writerId}-`))
  execFileSync('git', ['init', '--quiet', repo])
  const commonDir = join(repo, '.git')
  const opened = await observation.openGated(commonDir, writerId)
  return {
    handle: opened.handle,
    gate: opened,
    close: () => {
      opened.release()
      journal.JournalSurface_dispose(opened.handle)
      rmSync(repo, { recursive: true, force: true })
    },
  }
}
const withJournal = async (writerId, fn) => {
  const opened = await openJournal(writerId)
  try {
    await fn(opened.handle, opened.gate)
  } finally {
    opened.close()
  }
}
const appendLife = (handle, session) =>
  journal.JournalSurface_appendManagerLifecycle(handle, { kind: 'Session', session }, lifeOpened(session))
const revisionOf = (handle) => Number(revisions.revision(handle))

test('WHAT[durable-events-013] EXEC_journal_revision_advances_only_on_successful_fold', async (context) => {
  const opened = await openJournal('revision-advance')
  context.after(opened.close)
  const before = Number(revisions.revision(opened.handle))
  assert.equal(before, 0, 'pure load writes no RuntimeStarted and starts at revision 0')

  const linked = await appendLife(opened.handle, 'ses_p')
  assert.equal(linked.ok, true, JSON.stringify(linked.error))

  const after = Number(revisions.revision(opened.handle))
  assert.equal(after, 2, 'first business append lazily writes RuntimeStarted#1 then publishes business#2')
})
test('WHAT[durable-events-013] EXEC_commit_before_registration_returns_the_committed_change', async () => {
  await withJournal('revision-prompt', async (handle) => {
    const from = revisionOf(handle)
    const linked = await appendLife(handle, 'ses_prompt')
    assert.equal(linked.ok, true, JSON.stringify(linked.error))
    const probe = revisions.observeWaits(handle)
    const waiting = probe.startWait(from, false)
    try {
      assert.equal(probe.activeWaiterCount(), 0, 'the retained change needs no new subscription')
      const change = await waiting.result
      assert.equal(change.kind, 'committed')
      assert.equal(change.revision, revisionOf(handle))
      assert.ok(change.revision > from)
      assert.equal(waiting.listenerCount(), 0)
    } finally {
      waiting.cancel()
      waiting.dispose()
    }
  })
})
for (const stage of ['before-append', 'append-entered']) {
test(`WHAT[durable-events-013] EXEC_wait_registration_${stage}_observes_one_real_commit`, async () => {
  await withJournal(`revision-${stage}`, async (handle, gate) => {
    assert.equal((await appendLife(handle, `ses_seed_${stage}`)).ok, true)
    const from = revisionOf(handle)
    const probe = revisions.observeWaits(handle)
    gate.arm()
    let waiting
    let append
    try {
      if (stage === 'before-append') waiting = probe.startWait(from, false)
      append = appendLife(handle, `ses_commit_${stage}`)
      await gate.entered
      if (stage === 'append-entered') waiting = probe.startWait(from, false)
      assert.equal(revisionOf(handle), from, 'the real store append entered but has not published Current')
      assert.equal(probe.activeWaiterCount(), 1)
      assert.equal(waiting.listenerCount(), 1)
      gate.release()
      const committed = await append
      assert.equal(committed.ok, true, JSON.stringify(committed.error))
      assert.equal(probe.activeWaiterCount(), 0)
      const change = await waiting.result
      assert.equal(change.kind, 'committed')
      assert.equal(change.revision, from + 1)
      assert.equal(change.revision, revisionOf(handle))
      assert.ok(change.envelope.includes(`ses_commit_${stage}`), 'the wake carries the parked business fact')
      assert.equal(waiting.listenerCount(), 0)
    } finally {
      gate.release()
      waiting?.cancel()
      waiting?.dispose()
      if (append) await append
    }
  })
})
}
test('WHAT[durable-events-013] EXEC_cancel_one_of_two_same_revision_waiters_preserves_the_other', async () => {
  await withJournal('revision-cancel', async (handle) => {
    assert.equal((await appendLife(handle, 'ses_cancel_seed')).ok, true)
    const from = revisionOf(handle)
    const probe = revisions.observeWaits(handle)
    const cancelled = probe.startWait(from, false)
    const survivor = probe.startWait(from, false)
    try {
      assert.equal(probe.activeWaiterCount(), 2)
      cancelled.cancel()
      assert.equal(probe.activeWaiterCount(), 1)
      assert.equal((await cancelled.result).kind, 'stopped')
      assert.equal(cancelled.listenerCount(), 0)
      assert.equal(survivor.listenerCount(), 1)
      assert.equal(revisionOf(handle), from, 'cancellation is not a durable fact')
      assert.equal((await appendLife(handle, 'ses_cancel_commit')).ok, true)
      assert.equal(probe.activeWaiterCount(), 0)
      const change = await survivor.result
      assert.equal(change.kind, 'committed')
      assert.equal(change.revision, from + 1)
      assert.equal(revisionOf(handle), from + 1)
      assert.equal(survivor.listenerCount(), 0)
    } finally {
      cancelled.cancel()
      survivor.cancel()
      cancelled.dispose()
      survivor.dispose()
    }
  })
})
test('WHAT[durable-events-013] EXEC_pre_cancelled_subscription_registers_no_waiter', async () => {
  await withJournal('revision-pre-cancel', async (handle) => {
    const from = revisionOf(handle)
    const probe = revisions.observeWaits(handle)
    const waiting = probe.startWait(from, true)
    try {
      assert.equal(probe.activeWaiterCount(), 0, 'an already cancelled token must not leave a pending waiter')
      assert.equal((await waiting.result).kind, 'stopped')
      assert.equal(waiting.listenerCount(), 0)
      assert.equal(revisionOf(handle), from)
    } finally {
      waiting.cancel()
      waiting.dispose()
    }
  })
})
test('WHAT[durable-events-013] EXEC_pre_cancellation_takes_priority_over_a_retained_change', async () => {
  await withJournal('revision-pre-cancel-retained', async (handle) => {
    const from = revisionOf(handle)
    assert.equal((await appendLife(handle, 'ses_retained_change')).ok, true)
    const committedRevision = revisionOf(handle)
    const probe = revisions.observeWaits(handle)
    const cancelled = probe.startWait(from, true)
    const observer = probe.startWait(from, false)
    try {
      assert.equal(probe.activeWaiterCount(), 0)
      assert.equal((await cancelled.result).kind, 'stopped')
      assert.equal(cancelled.listenerCount(), 0)
      const change = await observer.result
      assert.equal(change.kind, 'committed')
      assert.equal(change.revision, committedRevision, 'the cancelled caller must not consume the retained change')
      assert.equal(probe.revision(), committedRevision)
    } finally {
      cancelled.cancel()
      observer.cancel()
      cancelled.dispose()
      observer.dispose()
    }
  })
})
test('WHAT[durable-events-013] EXEC_cancellation_after_commit_does_not_replace_the_successful_wake', async () => {
  await withJournal('revision-cancel-after-commit', async (handle) => {
    assert.equal((await appendLife(handle, 'ses_commit_cancel_seed')).ok, true)
    const from = revisionOf(handle)
    const probe = revisions.observeWaits(handle)
    const waiting = probe.startWait(from, false)
    try {
      assert.equal(probe.activeWaiterCount(), 1)
      assert.equal((await appendLife(handle, 'ses_commit_cancel')).ok, true)
      assert.equal(probe.activeWaiterCount(), 0)
      waiting.cancel()
      const change = await waiting.result
      assert.equal(change.kind, 'committed')
      assert.equal(change.revision, from + 1)
      assert.equal(waiting.listenerCount(), 0)
    } finally {
      waiting.cancel()
      waiting.dispose()
    }
  })
})
for (const closeKind of ['close', 'closeAsync']) {
test(`WHAT[durable-events-013] EXEC_${closeKind}_settles_waiters_and_rejects_new_subscriptions`, async () => {
  await withJournal(`revision-${closeKind}`, async (handle) => {
    const stale = revisionOf(handle)
    assert.equal((await appendLife(handle, `ses_${closeKind}_seed`)).ok, true)
    const from = revisionOf(handle)
    const probe = revisions.observeWaits(handle)
    const first = probe.startWait(from, false)
    const second = probe.startWait(from, false)
    let afterClose
    try {
      assert.equal(probe.activeWaiterCount(), 2)
      await probe[closeKind]()
      assert.equal(probe.activeWaiterCount(), 0, 'Journal close itself must remove pending waiters')
      assert.equal((await first.result).kind, 'stopped')
      assert.equal((await second.result).kind, 'stopped')
      assert.equal(first.listenerCount(), 0)
      assert.equal(second.listenerCount(), 0)
      assert.equal(probe.revision(), from, 'closing must not publish a business revision')
      afterClose = probe.startWait(stale, false)
      assert.equal(probe.activeWaiterCount(), 0, 'a closed journal must not accept another waiter')
      assert.equal((await afterClose.result).kind, 'stopped')
      assert.equal(afterClose.listenerCount(), 0)
    } finally {
      first.cancel()
      second.cancel()
      afterClose?.cancel()
      first.dispose()
      second.dispose()
      afterClose?.dispose()
    }
  })
})
test(`WHAT[durable-events-013] EXEC_${closeKind}_cancels_uncancellable_waits_with_the_cancellation_exception`, async () => {
  await withJournal(`revision-uncancellable-${closeKind}`, async (handle) => {
    const from = revisionOf(handle)
    const probe = revisions.observeWaits(handle)
    const pending = revisions.awaitChangeFrom(from, handle)
    const isJournalCancellation = (error) => {
      assert.equal(probe.isCancellation(error), true, 'the actual Fable cancellation type must reach the caller')
      assert.equal(probe.isCancellation(new Error(error.message)), false, 'a matching message must not impersonate cancellation')
      return true
    }
    const rejected = assert.rejects(pending, isJournalCancellation)
    assert.equal(probe.activeWaiterCount(), 1)
    await probe[closeKind]()
    assert.equal(probe.activeWaiterCount(), 0)
    await rejected
    await assert.rejects(revisions.awaitChangeFrom(from, handle), isJournalCancellation)
    assert.equal(probe.activeWaiterCount(), 0)
    assert.equal(probe.revision(), from)
  })
})
}
}

{
const { default: assert } = await import('node:assert/strict')
const { execFileSync } = await import('node:child_process')
const { mkdtempSync, rmSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
const surface = await import('../../../dist/Verification/JournalPortObservationSurface.js')

const withJournalDir = async (tag, scenario) => {
  const dir = mkdtempSync(join(tmpdir(), `wxs-portobs-${tag}-`))
  execFileSync('git', ['init', '--quiet', dir])
  try {
    return await scenario(join(dir, '.git'), tag)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('WHAT[durable-events-013] EXEC_port_members_read_journal_at_call_time', () =>
  withJournalDir('live-read', (commonDir, tag) =>
    surface.liveReadScenario(commonDir, tag).then((result) => {
      assert.equal(result.folded, true, 'the seeded fact must fold')
      assert.equal(result.openedOk, true, 'the session-opening fact must fold')
      assert.equal(result.pendingBefore, 0, 'no deferred work before the append')
      assert.equal(result.pendingAfter, 1, 'a port built before the append must still read live')
      assert.equal(result.freshAfter, 1, 'a port built after the append reads the same live state')
      assert.equal(result.poisonedBefore, false)
      assert.equal(result.poisonedAfter, false, 'a healthy journal is never poisoned')
      assert.equal(result.stateBefore, false, 'no session state before the opening append')
      assert.equal(result.stateAfter, true, 'ReadView must observe the XTrace slice the opening wrote')
    }),
  ))
test('WHAT[durable-events-013] EXEC_one_commit_moves_every_related_view_together', () =>
  withJournalDir('same-commit', (commonDir, tag) =>
    surface.sameCommitViewScenario(commonDir, tag).then((result) => {
      assert.equal(result.outcome, 'Ok', `commit must succeed, got ${result.outcome}`)
      assert.equal(result.preMember, false)
      assert.equal(result.preLinked, false)
      assert.equal(result.preState, false)
      assert.equal(result.midMember, false, 'mid-commit member must not see the parked handle')
      assert.equal(result.midLinked, false, 'mid-commit view must not see the parked link')
      assert.equal(result.midState, false, 'mid-commit canonical handle state must stay absent')
      assert.equal(result.midCompanion, false)
      assert.equal(result.postMember, true, 'after release both handle slices are visible')
      assert.equal(result.postLinked, true)
      assert.equal(result.postState, true, 'the canonical parent handle state must appear with both derived views')
      assert.equal(result.advancedOnce, true, 'only the parked handle commit advances the accepted setup revision')
    }),
  ))
test('WHAT[durable-events-013] EXEC_revision_waiter_wakes_on_next_commit', { timeout: 8000 }, () =>
  withJournalDir('wait', (commonDir, tag) =>
    surface.revisionWaitScenario(commonDir, tag).then((result) => {
      assert.equal(result.committed, 'Ok')
      assert.equal(result.resolved, true, 'the registered waiter must resolve through the commit, not a poll')
      assert.ok(result.changeRevision > 0, 'the woken waiter must carry the new revision')
      assert.equal(result.changeRevision, result.currentRevision, 'the wake revision is the live revision')
      assert.equal(result.observedHandle, true, 'the member reads the committed state after the wake')
      assert.equal(result.advancedOnce, true, 'the waiter observes exactly the next commit after physical admission setup')
    }),
  ))
test('WHAT[durable-events-013] EXEC_cancelled_waiter_releases_without_stealing_a_commit', () =>
  withJournalDir('cancel', (commonDir, tag) =>
    surface.cancelWaiterScenario(commonDir, tag).then((result) => {
      assert.equal(result.cancelledToNone, true, 'a cancelled waiter resolves to None')
      assert.equal(result.committed, 'Ok')
      assert.equal(result.revisionAdvanced, true, 'the commit still lands and advances revision')
    }),
  ))
}

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");
const assoc = await import("../../../dist/Execution/Session/AssociationSurface.js");

const linked = (pairs, start = assoc.empty) =>
  pairs.reduce((current, pair) => {
    const result = assoc.link(pair, current)
    assert.equal(result.ok, true, result.ok ? '' : result.message)
    return result.value
  }, start)

test('WHAT[durable-events-013] PERSIST_008_both_directions_answer_from_one_map_without_a_scan', () => {
  // The reason both entries live in one map: `isCompanion` and `bloggerOf` are the
  // two questions the transform boundary asks on every request, and a reverse index
  // held separately could disagree with the forward one.
  const state = linked(
    Array.from({ length: 50 }, (_, n) => ({ main: `ses_x${n}`, blogger: `ses_y${n}` })),
  )

  assert.equal(assoc.ids(state).length, 100)
  assert.equal(assoc.bloggerOf('ses_x37', state), 'ses_y37')
  assert.equal(assoc.mainSessionOf('ses_y37', state), 'ses_x37')
  assert.equal(assoc.isCompanion('ses_y37', state), true)
  assert.equal(assoc.isCompanion('ses_x37', state), false)
})
}

{
const { default: assert } = await import("node:assert/strict");
const { readFileSync } = await import("node:fs");
const { default: test } = await import("node:test");
const { CANONICAL_EVENT_READER_OWNER_PATHS, DUAL_WRITE_ALLOWLIST, GIT_BYPASS_ALLOWLIST, NON_STORE_SCHEMA_VERSION_SITES, PHYSICAL_HISTORY_OBSERVER_PATHS, SCANNER_IDS, collectProductionEntries, scanCanonicalSharedProgram, scanDualWrite, scanFeatureHistoryLoop, scanFeatureRef, scanFiles, scanGitBypass, scanPrivateDurableSubstrate, scanSchemaVersionInStoreContext, scanText } = await import("../../../scripts/checks/unified-store-gate.mjs");

const readFixture = (name) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

test('WHAT[durable-events-013] canonical shape requires one-envelope rule and shared boot live program', () => {
  const kernelFile = 'src/Wanxiangshu/Persistence/EventStore/IntegrationKernel.fs'
  const canonicalFile = 'src/Wanxiangshu/Persistence/EventStore/IntegratorEngine.fs'
  const kernel = [
    'type IntegrationRule =',
    '    { Name: string',
    '      Integrate: obj -> EventEnvelope -> Result<obj, string> }',
    'type PreparedIntegration = { Commit: unit -> unit }',
  ].join('\n')
  const goodCanonical = [
    'let private integrateOne state envelope = Ok state',
    'let private replay streams =',
    '    integrateOne empty (List.head streams)',
    'let private fullReplayGate = obj ()',
    'let prepareLive state events =',
    '    integrateOne state (List.head events)',
    '{ new ICanonicalIntegrator with',
    '    member _.ReloadLocal(commonDir) = replay streams',
    '    member _.PrepareLive(events) = prepareLive state events',
    '    member _.IsEventTypeKnown(eventType) = true',
    '    member _.TryCurrent(key) = None }',
  ].join('\n')

  assert.deepEqual(
    scanCanonicalSharedProgram([
      { file: kernelFile, text: kernel },
      { file: canonicalFile, text: goodCanonical },
    ]),
    [],
  )

  const collectionRule = kernel.replace(
    'Integrate: obj -> EventEnvelope -> Result<obj, string>',
    'Integrate: obj -> EventEnvelope list -> Result<obj, string>',
  )
  const collectionHits = scanCanonicalSharedProgram([
    { file: kernelFile, text: collectionRule },
    { file: canonicalFile, text: goodCanonical },
  ])
  assert.deepEqual(
    collectionHits.map(({ file, line, token }) => ({ file, line, token })),
    [{ file: kernelFile, line: 1, token: 'IntegrationRule.Integrate(EventEnvelope)' }],
  )

  const missingSharedCalls = goodCanonical
    .replace('integrateOne empty (List.head streams)', 'Ok empty')
    .replace('integrateOne state (List.head events)', 'Ok state')
  const hits = scanCanonicalSharedProgram([
    { file: kernelFile, text: kernel },
    { file: canonicalFile, text: missingSharedCalls },
  ])
  assert.deepEqual(
    hits.map(({ file, line, token }) => ({ file, line, token })),
    [
      { file: canonicalFile, line: 2, token: 'replay->integrateOne' },
      { file: canonicalFile, line: 5, token: 'PrepareLive->integrateOne' },
    ],
  )

  const bypassCanonical = goodCanonical
    .replace('integrateOne empty (List.head streams)', 'alternateReplay empty streams\n    let _ = integrateOne')
    .replace('integrateOne state (List.head events)', 'alternateLive state events\n    let _ = integrateOne')
    .replace('member _.ReloadLocal(commonDir) = replay streams', 'member _.ReloadLocal(commonDir) = alternateReplay empty streams')
    .replace('member _.PrepareLive(events) = prepareLive state events', 'member _.PrepareLive(events) = alternateLive state events')
  const bypassHits = scanCanonicalSharedProgram([
    { file: kernelFile, text: kernel },
    { file: canonicalFile, text: bypassCanonical },
  ])
  assert.deepEqual(
    bypassHits.map(({ token }) => token),
    [
      'ReloadLocal->replay',
      'replay->integrateOne',
      'PrepareLive->integrateOne',
      'PrepareLive->integrateOne',
    ],
    'alternate reducers and unused integrateOne references must not satisfy any call-graph edge',
  )
})
test('WHAT[durable-events-013] production CanonicalIntegrator has the shared one-envelope program shape', () => {
  const entries = collectProductionEntries()
  const violations = scanCanonicalSharedProgram(entries)
  assert.deepEqual(
    violations,
    [],
    violations.map((v) => `[${v.id}] ${v.file}:${v.line} ${v.token} ${v.label}`).join('\n'),
  )
})
}

{
const { default: assert } = await import('node:assert/strict')
const { execFileSync } = await import('node:child_process')
const { mkdtempSync, rmSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
const observation = await import('../../../dist/Verification/JournalPortObservationSurface.js')

const withSnapshotJournal = async (tag, scenario) => {
  const directory = mkdtempSync(join(tmpdir(), `wxs-snapshot-${tag}-`))
  execFileSync('git', ['init', '--quiet', directory])
  try {
    return await scenario(join(directory, '.git'), tag)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('WHAT[durable-events-013] Wire retains one snapshot including AcceptedOrigin while later real acceptance becomes visible to a fresh view', async () => {
  const result = await withSnapshotJournal('wire', observation.wireSnapshotScenario)
  assert.equal(result.openingOutcome, 'Ok')
  assert.equal(result.accepted, true)
  assert.equal(result.emptyState, false)
  assert.equal(result.heldHasTrace, true)
  assert.equal(result.freshHasTrace, true)
  assert.equal(result.heldProfileRun, result.expectedProfileRun)
  assert.equal(result.freshProfileRun, result.expectedProfileRun)
  assert.equal(result.heldOriginBefore, 'None')
  assert.equal(result.midOrigin, 'None')
  assert.equal(result.parkedRevisionUnchanged, true)
  assert.equal(result.heldOriginAfter, 'None', 'the retained view must not read the later Accepted fact')
  assert.equal(result.freshOrigin, 'HumanRoot')
  assert.equal(result.advancedOnce, true)
  for (const field of ['emptyReads', 'heldReads', 'midReads', 'freshReads']) {
    assert.equal(result[field], 1, `${field}: ReadView must read canonical Current exactly once`)
  }
  for (const field of ['heldOriginBeforeReads', 'midOriginReads', 'heldOriginAfterReads', 'freshOriginReads']) {
    assert.equal(result[field], 0, `${field}: AcceptedOrigin must use the captured snapshot`)
  }
})

test('WHAT[durable-events-013] Change sweep reads live commits and each RecoveryView obtains jobs and handles from one Current read', async () => {
  const result = await withSnapshotJournal('recovery', observation.recoverySnapshotScenario)
  for (const field of ['createdOutcome', 'linkedOutcome', 'failedOutcome']) assert.equal(result[field], 'Ok')
  assert.deepEqual(result.emptyJobIds, [])
  assert.equal(result.emptyJobFound, false)
  assert.deepEqual(result.activeJobIds, ['job-port-recovery'])
  assert.equal(result.activeJobFound, true)
  assert.deepEqual(result.heldJobIds, ['job-port-recovery'])
  assert.deepEqual(result.heldChildren, [], 'the retained pre-link view must remain unchanged after commit')
  assert.deepEqual(result.midJobIds, ['job-port-recovery'])
  assert.deepEqual(result.midChildren, [])
  assert.equal(result.parkedRevisionUnchanged, true)
  assert.deepEqual(result.freshJobIds, ['job-port-recovery'])
  assert.deepEqual(result.freshChildren, ['ses-port-recovery-child'])
  assert.equal(result.advancedOnce, true)
  assert.deepEqual(result.terminalJobIds, [])
  assert.equal(result.terminalJobRetained, true)
  assert.equal(result.terminalJobIsClosed, true)
  assert.deepEqual(result.terminalViewJobIds, [])
  assert.deepEqual(result.terminalChildren, ['ses-port-recovery-child'])
  for (const field of [
    'emptyJobsReads', 'emptyJobReads', 'activeJobsReads', 'activeJobReads',
    'heldReads', 'midReads', 'freshReads', 'terminalJobsReads', 'terminalJobReads', 'terminalReads',
  ]) {
    assert.equal(result[field], 1, `${field}: each sweep member must read canonical Current exactly once`)
  }
})
}
