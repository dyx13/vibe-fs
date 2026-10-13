import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import * as eventStore from '../../../dist/Persistence/EventStore/Surface.js'
import * as retention from '../../../dist/Persistence/EventStore/RetentionSurface.js'

const DAY = 24 * 60 * 60 * 1000

const A = 'a'.repeat(40)

const B = 'b'.repeat(40)

const make = (id, stream, parents = []) => ({ id, stream, type: 'JobRequested', parents, payload: {}, payloadRefs: [] })

const canonicalLine = (event) => JSON.stringify({
  event_id: event.id,
  event_type: event.type,
  parents: [...event.parents].sort(),
  payload: event.payload,
  payload_refs: [...event.payloadRefs].sort(),
  stream_id: event.stream,
}) + '\n'

const writeCanonicalEvents = (commonDir, writerId, events) => {
  const directory = join(commonDir, 'wanxiangshu', 'events')
  mkdirSync(directory, { recursive: true })
  const path = join(directory, `${writerId}.ndjson`)
  writeFileSync(path, events.map(canonicalLine).join(''))
  return path
}

const withRepo = async (fn) => {
  const root = mkdtempSync(join(tmpdir(), 'wxs-writer-retention-'))
  execFileSync('git', ['init', '-q', root])
  const commonDir = join(root, '.git')
  try {
    await fn(root, commonDir)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const writeEvent = async (commonDir, writerId, event) => {
  const handle = eventStore.create(commonDir, writerId)
  try {
    const result = await eventStore.append(handle, [event])
    assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.error))
  } finally {
    eventStore.dispose(handle)
  }
  return join(commonDir, 'wanxiangshu', 'events', `${writerId}-0000.ndjson`)
}

test('WHAT[durable-convergence-011] reverse tail read is exact across block boundaries', () => {
  const root = mkdtempSync(join(tmpdir(), 'wxs-writer-tail-'))
  const path = join(root, 'writer.ndjson')
  try {
    const first = JSON.stringify({ marker: 'first' })
    const tail = JSON.stringify({ marker: 'last', text: 'x'.repeat(9000) })
    writeFileSync(path, `${first}\n${tail}\n`)
    assert.equal(retention.readLastCompleteLine(path), tail)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('WHAT[durable-convergence-011] the UTC day boundary materializes the complete writer at the last retained millisecond and expires it at the next midnight', async () => {
  const lastActivity = Date.parse('2026-09-25T12:00:00Z')
  const retainedAt = Date.parse('2026-09-26T23:59:59.999Z')
  const expiredAt = Date.parse('2026-09-27T00:00:00Z')
  await withRepo(async (repo, commonDir) => {
    const old = { ...make(A, 'retention/boundary'), type: 'JournalEnvelope', payload: { ObservedAt: new Date(lastActivity - 9 * DAY).toISOString() } }
    const last = { ...make(B, 'retention/boundary', [A]), type: 'JournalEnvelope', payload: { ObservedAt: new Date(lastActivity).toISOString() } }
    const path = writeCanonicalEvents(commonDir, 'boundary', [old, last])
    const original = readFileSync(path, 'utf8')
    assert.deepEqual(retention.retainedWriterIdsAt(commonDir, retainedAt), ['boundary'])
    const snapshot = await retention.syncAt(repo, commonDir, null, retainedAt)
    assert.equal(snapshot.ok, true, JSON.stringify(snapshot.error))
    const blob = execFileSync('git', ['-C', repo, 'show', `${snapshot.root}:writers/boundary.ndjson`], { encoding: 'utf8' })
    assert.equal(blob, original)
    assert.equal(readFileSync(path, 'utf8'), original, 'the old fact inside the retained writer cannot be trimmed')
    assert.deepEqual(retention.retainedWriterIdsAt(commonDir, expiredAt), [])
  })
})

test('WHAT[durable-convergence-011] manifest v2 rejects duplicate extra malformed and mismatched bindings without changing local writer truth', async () => {
  await withRepo(async (repo, commonDir) => {
    const now = Date.now()
    const path = await writeEvent(commonDir, 'manifest-matrix', make(A, 'retention/manifest-matrix'))
    const before = readFileSync(path, 'utf8')
    const current = await retention.syncAt(repo, commonDir, null, now)
    assert.equal(current.ok, true, JSON.stringify(current.error))
    const git = (args, input) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', input }).trim()
    const manifest = git(['show', `${current.root}:writer-manifest`])
    const line = manifest.split('\n')[1]
    const [name, oid, activity] = line.split('\t')
    const cases = [
      ['missing', 'v2\n', /does not bind/],
      ['duplicate', `v2\n${line}\n${line}\n`, /duplicate entry/],
      ['extra', `v2\n${line}\nextra.ndjson\t${oid}\t${activity}\n`, /entries absent/],
      ['mismatched', `v2\n${name}\t${'0'.repeat(40)}\t${activity}\n`, /does not bind/],
      ['malformed', `v2\n${name}\t${oid}\tNaN\n`, /malformed entry/],
    ]
    for (const [label, text, error] of cases) {
      const manifestOid = git(['hash-object', '-w', '--stdin'], text)
      const entries = git(['ls-tree', current.root]).split('\n')
        .map(entry => entry.endsWith('\twriter-manifest') ? `100644 blob ${manifestOid}\twriter-manifest` : entry)
      const root = git(['mktree'], entries.join('\n') + '\n')
      const result = await retention.syncAt(repo, commonDir, root, now)
      assert.equal(result.ok, false, label)
      assert.match(String(result.error), error, label)
      assert.equal(readFileSync(path, 'utf8'), before, label)
    }
  })
})

test('WHAT[durable-convergence-011] durable Journal ObservedAt outranks refreshed writer mtime', () => {
  const root = mkdtempSync(join(tmpdir(), 'wxs-writer-observed-at-'))
  const commonDir = join(root, '.git')
  const now = Date.parse('2026-08-21T00:00:00Z')

  try {
    mkdirSync(commonDir, { recursive: true })

    const oldJournal = {
      id: A,
      stream: 'retention/journal-old',
      type: 'JournalEnvelope',
      parents: [],
      payload: { ObservedAt: '2026-08-19T00:00:00.000+00:00' },
      payloadRefs: [],
    }
    const cutTail = {
      id: B,
      stream: 'integrator/cut-tail/test',
      type: 'ProjectionCutTail',
      parents: [A],
      payload: {},
      payloadRefs: [],
    }
    const oldPath = writeCanonicalEvents(commonDir, 'writer-old-journal', [oldJournal, cutTail])
    utimesSync(oldPath, now / 1000, now / 1000)

    const freshJournal = {
      id: 'c'.repeat(40),
      stream: 'retention/journal-fresh',
      type: 'JournalEnvelope',
      parents: [],
      payload: { ObservedAt: '2026-08-20T23:59:00.000+00:00' },
      payloadRefs: [],
    }
    const freshPath = writeCanonicalEvents(commonDir, 'writer-fresh-journal', [freshJournal])
    utimesSync(freshPath, (now - 2 * DAY) / 1000, (now - 2 * DAY) / 1000)

    assert.deepEqual(
      retention.retainedWriterIdsAt(commonDir, now),
      ['writer-fresh-journal'],
      'Journal tail ObservedAt is durable activity truth; mtime is only a non-Journal fallback',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('WHAT[durable-convergence-011] UTC day-group expiry removes local writer and remote materialization', async () => {
  await withRepo(async (repo, commonDir) => {
    // EventStore boot deliberately applies retention against its physical current
    // time. Keep this proof relative to the same captured instant instead of
    // freezing a calendar date that eventually makes the "fresh" writer expire.
    const now = Date.now()
    const oldPath = await writeEvent(commonDir, 'writer-old', make(A, 'retention/old'))
    const freshPath = await writeEvent(commonDir, 'writer-fresh', make(B, 'retention/fresh', [A]))
    utimesSync(oldPath, (now - 2 * DAY) / 1000, (now - 2 * DAY) / 1000)
    utimesSync(freshPath, (now - 60_000) / 1000, (now - 60_000) / 1000)

    assert.deepEqual(retention.retainedWriterIdsAt(commonDir, now), ['writer-fresh'],
      'activation/replay must not read an expired writer even before physical GC')

    const reopened = eventStore.create(commonDir, 'writer-retained-replay')
    try {
      assert.deepEqual(eventStore.heads(reopened, 'retention/fresh'), [B],
        'retained replay treats a parent outside the window as an already-satisfied causal boundary')
    } finally {
      eventStore.dispose(reopened)
    }

    const result = await retention.syncAt(repo, commonDir, null, now)
    assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.error))
    assert.equal(existsSync(oldPath), false)
    assert.equal(existsSync(freshPath), true)

    const rootTree = execFileSync('git', ['-C', repo, 'ls-tree', result.root], { encoding: 'utf8' })
    assert.match(rootTree, /writer-manifest/)
    const writers = execFileSync('git', ['-C', repo, 'ls-tree', `${result.root}:writers`], { encoding: 'utf8' })
    assert.doesNotMatch(writers, /writer-old\.ndjson/)
    assert.match(writers, /writer-fresh-0000\.ndjson/)
  })
})

test('WHAT[durable-convergence-011] stale remote snapshot cannot revive writer after cache crosses expiry', async () => {
  await withRepo(async (repo, commonDir) => {
    const born = Date.parse('2026-08-20T00:00:00Z')
    const writerPath = await writeEvent(commonDir, 'writer-aging', make(A, 'retention/aging'))
    utimesSync(writerPath, born / 1000, born / 1000)

    const before = await retention.syncAt(repo, commonDir, null, born + 60_000)
    assert.equal(before.ok, true, before.ok ? '' : JSON.stringify(before.error))
    assert.equal(existsSync(writerPath), true)

    const after = await retention.syncAt(repo, commonDir, before.root, born + 2 * DAY + 60_000)
    assert.equal(after.ok, true, after.ok ? '' : JSON.stringify(after.error))
    assert.equal(existsSync(writerPath), false, 'time-aware cache must not preserve an expired local writer')
    const writers = execFileSync('git', ['-C', repo, 'ls-tree', `${after.root}:writers`], { encoding: 'utf8' })
    assert.doesNotMatch(writers, /writer-aging\.ndjson/, 'stale remote root must be filtered by its manifest')
  })
})

test('WHAT[durable-convergence-011] manifest-less legacy remote is ignored instead of refreshing writer activity', async () => {
  await withRepo(async (repo, commonDir) => {
    const born = Date.parse('2026-08-20T00:00:00Z')
    const writerPath = await writeEvent(commonDir, 'writer-legacy-remote', make(A, 'retention/legacy'))
    utimesSync(writerPath, born / 1000, born / 1000)

    const current = await retention.syncAt(repo, commonDir, null, born + 60_000)
    assert.equal(current.ok, true, current.ok ? '' : JSON.stringify(current.error))

    const rootEntries = execFileSync('git', ['-C', repo, 'ls-tree', current.root], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => line && !line.endsWith('\twriter-manifest'))
      .join('\n') + '\n'
    const legacyRoot = execFileSync('git', ['-C', repo, 'mktree'], {
      encoding: 'utf8',
      input: rootEntries,
    }).trim()

    const after = await retention.syncAt(repo, commonDir, legacyRoot, born + 2 * DAY + 60_000)
    assert.equal(after.ok, true, after.ok ? '' : JSON.stringify(after.error))
    assert.equal(existsSync(writerPath), false)
    const writers = execFileSync('git', ['-C', repo, 'ls-tree', `${after.root}:writers`], { encoding: 'utf8' })
    assert.doesNotMatch(writers, /writer-legacy-remote\.ndjson/)
  })
})

test('WHAT[durable-convergence-011] v1 mtime manifest is legacy and cannot resurrect an expired writer', async () => {
  await withRepo(async (repo, commonDir) => {
    const born = Date.parse('2026-08-20T00:00:00Z')
    const writerPath = await writeEvent(commonDir, 'writer-v1-remote', make(A, 'retention/v1'))
    utimesSync(writerPath, born / 1000, born / 1000)

    const current = await retention.syncAt(repo, commonDir, null, born + 60_000)
    assert.equal(current.ok, true, current.ok ? '' : JSON.stringify(current.error))

    const manifestText = execFileSync('git', ['-C', repo, 'show', `${current.root}:writer-manifest`], { encoding: 'utf8' })
    const legacyText = manifestText
      .replace(/^v\d+$/m, 'v1')
      .replace(/\t[-+]?\d+(?:\.\d+)?$/m, `\t${born + 10 * DAY}`)
    const legacyManifestOid = execFileSync('git', ['-C', repo, 'hash-object', '-w', '--stdin'], {
      encoding: 'utf8',
      input: legacyText,
    }).trim()
    const legacyRootEntries = execFileSync('git', ['-C', repo, 'ls-tree', current.root], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((line) => line.endsWith('\twriter-manifest')
        ? `100644 blob ${legacyManifestOid}\twriter-manifest`
        : line)
      .join('\n') + '\n'
    const legacyRoot = execFileSync('git', ['-C', repo, 'mktree'], {
      encoding: 'utf8',
      input: legacyRootEntries,
    }).trim()

    const after = await retention.syncAt(repo, commonDir, legacyRoot, born + 2 * DAY + 60_000)
    assert.equal(after.ok, true, after.ok ? '' : JSON.stringify(after.error))
    assert.equal(existsSync(writerPath), false)
    const writers = execFileSync('git', ['-C', repo, 'ls-tree', `${after.root}:writers`], { encoding: 'utf8' })
    assert.doesNotMatch(writers, /writer-v1-remote\.ndjson/)
  })
})

test('WHAT[durable-convergence-011] declared manifest must cover every remote writer blob exactly', async () => {
  await withRepo(async (repo, commonDir) => {
    const born = Date.parse('2026-08-20T00:00:00Z')
    const writerPath = await writeEvent(commonDir, 'writer-invalid-manifest', make(A, 'retention/invalid-manifest'))
    utimesSync(writerPath, born / 1000, born / 1000)

    const current = await retention.syncAt(repo, commonDir, null, born + 60_000)
    assert.equal(current.ok, true, current.ok ? '' : JSON.stringify(current.error))

    const emptyManifestOid = execFileSync('git', ['-C', repo, 'hash-object', '-w', '--stdin'], {
      encoding: 'utf8',
      input: 'v2\n',
    }).trim()
    const malformedRootEntries = execFileSync('git', ['-C', repo, 'ls-tree', current.root], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((line) => line.endsWith('\twriter-manifest')
        ? `100644 blob ${emptyManifestOid}\twriter-manifest`
        : line)
      .join('\n') + '\n'
    const malformedRoot = execFileSync('git', ['-C', repo, 'mktree'], {
      encoding: 'utf8',
      input: malformedRootEntries,
    }).trim()

    const result = await retention.syncAt(repo, commonDir, malformedRoot, born + 120_000)
    assert.equal(result.ok, false)
    assert.match(String(result.error), /writer manifest does not bind writer blob/i)
  })
})

test('WHAT[durable-convergence-011] writer lifecycle observes active, expiry, and reactivation without mtime resurrection', async () => {
  await withRepo(async (repo, commonDir) => {
    const HOUR = 60 * 60 * 1000
    const born = Date.parse('2026-08-20T00:00:00Z')
    const eventsDir = join(commonDir, 'wanxiangshu', 'events')
    const writerPath = join(eventsDir, 'writer-lifecycle.ndjson')

    const writeJournalLine = (event) => {
      mkdirSync(eventsDir, { recursive: true })
      const line = JSON.stringify({
        event_id: event.id,
        event_type: 'JournalEnvelope',
        parents: event.parents,
        payload: { ObservedAt: new Date(event.observedAt).toISOString() },
        payload_refs: [],
        stream_id: event.stream,
      }) + '\n'
      writeFileSync(writerPath, line, { flag: 'a' })
    }

    // 1. Initial event at born
    writeJournalLine({ id: A, stream: 'retention/lifecycle', parents: [], observedAt: born })

    // Active at born + 12h: retained and materialized in remote snapshot
    assert.deepEqual(retention.retainedWriterIdsAt(commonDir, born + 12 * HOUR), ['writer-lifecycle'])
    const snap1 = await retention.syncAt(repo, commonDir, null, born + 12 * HOUR)
    assert.equal(snap1.ok, true, snap1.ok ? '' : JSON.stringify(snap1.error))
    const writers1 = execFileSync('git', ['-C', repo, 'ls-tree', `${snap1.root}:writers`], { encoding: 'utf8' })
    assert.match(writers1, /writer-lifecycle\.ndjson/)

    // Expired at born + 49h: even if file mtime is artificially touched to "now", durable ObservedAt governs
    assert.deepEqual(retention.retainedWriterIdsAt(commonDir, born + 49 * HOUR), [])
    utimesSync(writerPath, (born + 49 * HOUR) / 1000, (born + 49 * HOUR) / 1000)
    assert.deepEqual(retention.retainedWriterIdsAt(commonDir, born + 49 * HOUR), [], 'refreshed mtime cannot revive expired journal writer')

    // Sync at born + 49h purges expired writer from local disk and new snapshot
    const snap2 = await retention.syncAt(repo, commonDir, snap1.root, born + 49 * HOUR)
    assert.equal(snap2.ok, true, snap2.ok ? '' : JSON.stringify(snap2.error))
    assert.equal(existsSync(writerPath), false, 'expired writer removed from disk')
    const writers2 = execFileSync('git', ['-C', repo, 'ls-tree', `${snap2.root}:writers`], { encoding: 'utf8' })
    assert.equal(writers2.trim(), '', 'expired writer removed from remote tree')

    // 2. Reactivation by writing a new event at born + 50h
    writeJournalLine({ id: B, stream: 'retention/lifecycle', parents: [A], observedAt: born + 50 * HOUR })
    assert.deepEqual(retention.retainedWriterIdsAt(commonDir, born + 51 * HOUR), ['writer-lifecycle'], 'reactivated writer is retained')
    const snap3 = await retention.syncAt(repo, commonDir, snap2.root, born + 51 * HOUR)
    assert.equal(snap3.ok, true, snap3.ok ? '' : JSON.stringify(snap3.error))
    const writers3 = execFileSync('git', ['-C', repo, 'ls-tree', `${snap3.root}:writers`], { encoding: 'utf8' })
    assert.match(writers3, /writer-lifecycle\.ndjson/, 'reactivated writer rematerialized in snapshot')
  })
})

test('WHAT[durable-convergence-011] today, yesterday, and the day before resolve as three distinct UTC day groups', async () => {
  const now = Date.parse('2026-08-21T00:30:00Z')
  await withRepo(async (repo, commonDir) => {
    const journal = (id, stream, observedAt) => ({ ...make(id, stream), type: 'JournalEnvelope', payload: { ObservedAt: new Date(observedAt).toISOString() } })
    const todayPath = writeCanonicalEvents(commonDir, 'writer-today', [journal(A, 'retention/day-groups/today', Date.parse('2026-08-21T00:10:00Z'))])
    const yesterdayPath = writeCanonicalEvents(commonDir, 'writer-yesterday', [journal(B, 'retention/day-groups/yesterday', Date.parse('2026-08-20T00:10:00Z'))])
    const beforePath = writeCanonicalEvents(commonDir, 'writer-before-yesterday', [journal('c'.repeat(40), 'retention/day-groups/before', Date.parse('2026-08-19T23:50:00Z'))])

    assert.deepEqual(
      retention.retainedWriterIdsAt(commonDir, now),
      ['writer-today', 'writer-yesterday'],
      'one UTC midnight boundary decides, not a rolling 24h window: yesterday is retained although its activity is over 24h old, the day before is collected although it is under 48h old',
    )

    const snapshot = await retention.syncAt(repo, commonDir, null, now)
    assert.equal(snapshot.ok, true, JSON.stringify(snapshot.error))
    assert.equal(existsSync(todayPath), true)
    assert.equal(existsSync(yesterdayPath), true)
    assert.equal(existsSync(beforePath), false, 'the day-before writer leaves local disk as a whole')
    const writers = execFileSync('git', ['-C', repo, 'ls-tree', `${snapshot.root}:writers`], { encoding: 'utf8' })
    assert.match(writers, /writer-today\.ndjson/)
    assert.match(writers, /writer-yesterday\.ndjson/)
    assert.doesNotMatch(writers, /writer-before-yesterday\.ndjson/)
  })
})

test('WHAT[durable-convergence-011] advancing a writer activity from yesterday to today pushes its expiry one UTC day later', async () => {
  const day0 = Date.parse('2026-08-21T00:00:00Z')
  await withRepo(async (repo, commonDir) => {
    const journal = (id, observedAt, parents = []) => ({ ...make(id, 'retention/moving', parents), type: 'JournalEnvelope', payload: { ObservedAt: new Date(observedAt).toISOString() } })
    const writerPath = writeCanonicalEvents(commonDir, 'writer-moving', [journal(A, Date.parse('2026-08-20T12:00:00Z'))])

    assert.deepEqual(retention.retainedWriterIdsAt(commonDir, day0 + DAY), [],
      'without movement, yesterday activity is collected once its UTC day is the day before yesterday')
    assert.equal(existsSync(writerPath), true, 'retainedWriterIdsAt filters; it never deletes bytes')

    writeFileSync(writerPath, canonicalLine(journal(B, Date.parse('2026-08-21T12:00:00Z'), [A])), { flag: 'a' })

    assert.deepEqual(retention.retainedWriterIdsAt(commonDir, day0 + DAY), ['writer-moving'],
      'the same expiry instant retains the writer because its activity moved to the previous UTC day')
    const retained = await retention.syncAt(repo, commonDir, null, day0 + DAY)
    assert.equal(retained.ok, true, JSON.stringify(retained.error))
    assert.equal(existsSync(writerPath), true, 'the moved writer survives the sync at its former expiry point')
    const retainedWriters = execFileSync('git', ['-C', repo, 'ls-tree', `${retained.root}:writers`], { encoding: 'utf8' })
    assert.match(retainedWriters, /writer-moving\.ndjson/)

    assert.deepEqual(retention.retainedWriterIdsAt(commonDir, day0 + 2 * DAY), [],
      'once the moved activity is two UTC days old, the writer expires as a whole')
    const expired = await retention.syncAt(repo, commonDir, retained.root, day0 + 2 * DAY)
    assert.equal(expired.ok, true, JSON.stringify(expired.error))
    assert.equal(existsSync(writerPath), false, 'expiry removes the local writer')
    const expiredWriters = execFileSync('git', ['-C', repo, 'ls-tree', `${expired.root}:writers`], { encoding: 'utf8' })
    assert.doesNotMatch(expiredWriters, /writer-moving\.ndjson/)
  })
})

{
// WHAT[durable-events-005] 段序列合同在 retention 边界的红测试：
// 旧实现把段文件当作独立 writer（<WriterId>-<seq>），retainedWriterIdsAt 的聚合断言
// 与「不得按段部分移除」断言因聚合语义缺失而红。
const journalEvent = (id, stream, parents, observedAt) => ({
  id, stream, type: 'JournalEnvelope', parents,
  payload: { ObservedAt: new Date(observedAt).toISOString() }, payloadRefs: [],
})
const writeCanonicalSegments = (commonDir, writerId, segments) => {
  const directory = join(commonDir, 'wanxiangshu', 'events')
  mkdirSync(directory, { recursive: true })
  segments.forEach((events, index) => {
    writeFileSync(join(directory, `${writerId}-${String(index).padStart(4, '0')}.ndjson`), events.map(canonicalLine).join(''))
  })
}

test('WHAT[durable-convergence-011] segment_series_is_retained_and_expired_as_one_writer_whose_activity_reads_the_highest_segment_tail', async () => {
  await withRepo(async (repo, commonDir) => {
    const now = Date.parse('2026-09-25T12:00:00Z')
    // 段 0 尾部 Journal 活动在三天前；段 1 尾部 Journal 活动在今天。
    // writer 活动时间取逻辑流尾部（最高段）；旧段的陈旧活动不得单独过期整组。
    const oldJournal = journalEvent(A, 'retention/segment-series', [], Date.parse('2026-09-22T12:00:00Z'))
    const freshJournal = journalEvent(B, 'retention/segment-series', [A], Date.parse('2026-09-25T10:00:00Z'))
    writeCanonicalSegments(commonDir, 'writer-segments', [[oldJournal], [freshJournal]])

    assert.deepEqual(retention.retainedWriterIdsAt(commonDir, now), ['writer-segments'],
      'a segment series is one writer whose activity is the highest segment tail')

    // 中间时刻：段 0 自身活动已过期、段 1 仍活跃——整组保留，不得按段部分移除。
    const mid = Date.parse('2026-09-26T12:00:00Z')
    assert.deepEqual(retention.retainedWriterIdsAt(commonDir, mid), ['writer-segments'])
    const retained = await retention.syncAt(repo, commonDir, null, mid)
    assert.equal(retained.ok, true, JSON.stringify(retained.error))
    const names = readdirSync(join(commonDir, 'wanxiangshu', 'events')).sort()
    assert.deepEqual(names, ['writer-segments-0000.ndjson', 'writer-segments-0001.ndjson'],
      'retention never removes a segment of a retained writer')
    const writers = execFileSync('git', ['-C', repo, 'ls-tree', `${retained.root}:writers`], { encoding: 'utf8' })
    assert.match(writers, /writer-segments-0000\.ndjson/)
    assert.match(writers, /writer-segments-0001\.ndjson/)

    // 最高段活动也过期后，整组一起退出。
    const later = Date.parse('2026-09-28T00:00:00Z')
    assert.deepEqual(retention.retainedWriterIdsAt(commonDir, later), [])
    const expired = await retention.syncAt(repo, commonDir, retained.root, later)
    assert.equal(expired.ok, true, JSON.stringify(expired.error))
    assert.deepEqual(readdirSync(join(commonDir, 'wanxiangshu', 'events')).sort(), [],
      'expiry removes every segment of the series')
    assert.equal(execFileSync('git', ['-C', repo, 'ls-tree', `${expired.root}:writers`], { encoding: 'utf8' }).trim(), '')
  })
})

test('WHAT[durable-convergence-011] manifest_binds_every_segment_blob_with_one_writer_activity', async () => {
  await withRepo(async (repo, commonDir) => {
    const now = Date.now()
    const j1 = journalEvent(A, 'retention/segment-manifest', [], now - 60_000)
    const j2 = journalEvent(B, 'retention/segment-manifest', [A], now - 30_000)
    writeCanonicalSegments(commonDir, 'writer-manifest-seg', [[j1], [j2]])

    const snap = await retention.syncAt(repo, commonDir, null, now)
    assert.equal(snap.ok, true, JSON.stringify(snap.error))
    const manifest = execFileSync('git', ['-C', repo, 'show', `${snap.root}:writer-manifest`], { encoding: 'utf8' })
    const entries = manifest.trim().split('\n').slice(1).map(line => line.split('\t'))
    assert.equal(entries.length, 2, 'one manifest entry per segment blob')

    const decode = (encoded) => Buffer.from(encoded, 'base64url').toString('utf8')
    assert.equal(decode(entries[0][0]), 'writer-manifest-seg-0000.ndjson')
    assert.equal(decode(entries[1][0]), 'writer-manifest-seg-0001.ndjson')
    assert.equal(entries[0][2], entries[1][2],
      'all segments of one writer carry the same writer-level activity')

    for (const [encoded, oid] of entries) {
      const treeOid = execFileSync('git', ['-C', repo, 'rev-parse', `${snap.root}:writers/${decode(encoded)}`], { encoding: 'utf8' }).trim()
      assert.equal(oid, treeOid, 'manifest OID must equal the writers tree entry')
    }
  })
})
}
