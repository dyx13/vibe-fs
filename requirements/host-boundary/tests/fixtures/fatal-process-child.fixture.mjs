// The *.fixture.mjs suffix is load-bearing: the unit runner discovers
// *.test.mjs, so this file is invisible to the real suite. A parent test
// (requirements/host-boundary/tests/029.test.mjs) spawns it
// as a real child process to prove the production FatalProcess contract:
// console/report + kill is the single physical exit. See F32.
//
// Modes (via argv[2]):
//   trip            — call the real FatalProcess.trip owner path, then print
//                     an after-marker that must NEVER appear on stdout.
//   diagnostic      — call the real Diagnostic.fatal owner path (same bar).
//   console-throw   — break console.error, then trip: the fuse must still kill.
//   double-trip     — trip twice: the incident must be reported once, then die.
//   pipe-close      — close stdout/stderr fds, then trip: the fuse must still kill.
//   persist         — commit through the production store, then die without disposing it.
//
// The parent deletes WANXIANGSHU_NO_FATAL_EXIT for fatal modes so the real
// SIGKILL-or-exit(1) path fires, and asserts per-platform semantics itself
// (signal SIGKILL where the platform delivers it, else exit code 1).

const mode = process.argv[2] ?? 'trip'

delete process.env.WANXIANGSHU_NO_FATAL_EXIT

if (mode === 'console-throw' || mode === 'diagnostic-console-throw') {
  process.once('uncaughtException', () => {
    process.stdout.write('renderer-exception-escaped\n')
    process.exit(23)
  })
  console.error = () => { throw new Error('renderer exploded') }
}

if (mode === 'persist') {
  const journal = await import('../../../../dist/Persistence/Journal/Surface.js')
  const boot = await journal.JournalSurface_boot(process.argv[3], 'rt-fatal-exit', 4242, '2026-09-14T00:00:00Z')
  if (!boot.ok) throw new Error(boot.error)
  const written = await journal.JournalSurface_writePayload(boot.journal, 'committed-before-fuse')
  if (!written.ok) throw new Error(written.error)
  // durable-events-012: the ndjson event line is the only payload carrier, so a
  // payload survives exactly when a committed fact embeds it. Commit that fact.
  const appended = await journal.JournalSurface_appendManagerLifecycle(
    boot.journal,
    { kind: 'Session', session: 'ses-fatal-exit' },
    {
      case: 'LifeOpened',
      payload: {
        SessionId: 'ses-fatal-exit',
        LifeId: 'life-fatal-exit',
        OpeningUserMessageId: 'msg-fatal-exit',
        OpeningTextRef: written.blobRef,
        OpeningTextDigest: written.blobDigest,
        OpeningCursorSequence: 1,
      },
    },
  )
  if (!appended.ok) throw new Error(appended.error)
  console.log(JSON.stringify({ committedBlob: written.blobRef }))
}

if (mode === 'pipe-close') {
  try { process.stdout.destroy() } catch {}
  try { process.stderr.destroy() } catch {}
}

if (mode === 'diagnostic' || mode === 'diagnostic-console-throw') {
  const { fatal } = await import('../../../../dist/OpenCode/Host/Diagnostic.js')
  console.log('before-fatal')
  fatal('fixture-fatal-diagnostic', [['result', 'fatal must terminate through the diagnostic owner path']])
  console.log('after-fatal')
} else if (mode === 'double-trip') {
  const { trip } = await import('../../../../dist/Foundation/FatalProcess.js')
  console.log('before-fatal')
  trip('fixture-fatal', 'first incident')
  trip('fixture-fatal', 'second incident must never report')
  console.log('after-fatal')
} else {
  const { trip } = await import('../../../../dist/Foundation/FatalProcess.js')
  console.log('before-fatal')
  trip('fixture-fatal', `fatal must terminate even when NODE_TEST_CONTEXT is inherited (mode=${mode})`)
  console.log('after-fatal')
}
