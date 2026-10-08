#!/usr/bin/env node
// tests/unit/run.mjs — layers 1-3 entry point, and the causal-progress gate over them.
//
// Three responsibilities, in order:
//
//   1. Staleness gate. mjs tests import dist, so a stale build means the suite silently
//      describes yesterday's code. Fail closed rather than emit a green light for bytes nobody
//      asked about.
//   2. Supervise a child that runs node:test, with a silence window fed by test VERDICTS.
//   3. Own the authoritative counts, because the reporter's are wrong (see supervise helper).
//
// Discovery is *.test.mjs under requirements/<package>/tests/ (package-owned
// proof), excluding tests/e2e/ and tests/integration/ which own their own
// entrypoints and silence criteria.
//
//   node requirements/verification-system/tests/run.mjs
//   node requirements/verification-system/tests/run.mjs --skip-staleness-check   (build-tooling work only)
//
// Supervision lives in requirements/verification-system/tests/e2e/support/supervise-node-test.mjs
// so integration/package share the same verdict-silence criterion (verification-system-006).
// UNIT_VERDICT_SILENCE_MS remains the unit budget.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { UNIT_VERDICT_SILENCE_MS } from './e2e/support/time-budget.js'
import { superviseNodeTest } from './e2e/support/supervise-node-test.mjs'
import { checkBuildFreshness } from './support/build-freshness.mjs'
import { assertConcurrency } from '../../../scripts/lib/concurrency-cap.mjs'
import { walk } from '../../../scripts/lib/walk.mjs'

process.env.WANXIANGSHU_PROVIDER_LANGUAGE = 'en'

const REQUIREMENTS_ROOT = 'requirements'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

if (process.env.TESTS_MJS_FILES && process.env.TESTS_MJS_FILES.trim() !== '') {
  const fileCount = process.env.TESTS_MJS_FILES.split(',').map((f) => f.trim()).filter(Boolean).length
  console.error(`runner: scoped 使用 TESTS_MJS_FILES=${fileCount} files`)
}

const skipStaleness = process.argv.includes('--skip-staleness-check')
if (process.env.NODE_TEST_CONCURRENCY !== undefined) {
  assertConcurrency(process.env.NODE_TEST_CONCURRENCY)
}

// ── staleness gate ──────────────────────────────────────────────────────────

if (skipStaleness) {
  console.error('runner: staleness check SKIPPED by flag — results do not describe current sources')
} else {
  const freshness = checkBuildFreshness()
  if (!freshness.ok) {
    console.error(`runner: refusing to run.\n${freshness.reason}`)
    process.exit(1)
  }
  console.error(`runner: build is current (${freshness.sources} sources, ${freshness.artifacts} artifacts)`)
}

// ── discovery ───────────────────────────────────────────────────────────────

// `fixtures/` is excluded by construction, not by filter: its files are named `*.fixture.mjs`
// precisely so this walk cannot reach them. They exist to hang, and one swept into the real suite
// would hang it. `gate-unit-runner-cases.mjs` asserts that naming still holds.
//
// `TESTS_MJS_FILES` overrides discovery with an explicit list. It exists for the gate cases, which
// need to drive a hang fixture through the REAL supervisor while keeping that fixture undiscoverable
// — the two properties are otherwise in conflict. A test-only entry point in production code would
// be forbidden; this is the runner's own harness surface, and the override is announced on stderr so
// it cannot be used to quietly narrow a CI run.
const override = process.env.TESTS_MJS_FILES
function infrastructureFirst(files) {
  const infrastructure = []
  const remaining = []
  for (const file of files) {
    if (file.replace(/\\/g, '/').startsWith(REQUIREMENTS_ROOT + '/verification-system/tests/')) infrastructure.push(file)
    else remaining.push(file)
  }
  return [...infrastructure, ...remaining]
}

// Package-owned proof: every oracle lives under requirements/<package>/tests/.
// Long-stroke (tests/e2e/) and integration suites (tests/integration/) own
// their silence criterion and are excluded here — they run via their own
// entrypoints (verification-system e2e entry, integration orchestrator).
const files = override
  ? override
      .split(',')
      .map((file) => file.trim())
      .filter(Boolean)
  : infrastructureFirst(walk(REQUIREMENTS_ROOT, ['.test.mjs']).filter((file) => {
      const rel = file.replace(/\\/g, '/')
      return !rel.includes('/tests/e2e/') && !rel.includes('/tests/integration/')
    }))

if (override) console.error(`runner: discovery OVERRIDDEN by TESTS_MJS_FILES (${files.length} file(s))`)

if (files.length === 0) {
  console.error(`runner: no *.test.mjs found under ${REQUIREMENTS_ROOT}/`)
  process.exit(1)
}

// Same 3s dog as e2e (UNIT_VERDICT_SILENCE_MS === WATCHDOG_TIMEOUT_MS; gate injects the former).
await superviseNodeTest({
  files,
  label: 'tests/unit',
  silenceMs: Number(process.env.UNIT_VERDICT_SILENCE_MS || UNIT_VERDICT_SILENCE_MS),
  logPrefix: 'runner',
})
