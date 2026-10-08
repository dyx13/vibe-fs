import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { assertBuildFresh, collectVerificationInputs, computeDigest } from '/Users/yuanxi/Workwork/vibe-fs/scripts/lib/build-state.mjs'
import { superviseNodeTest } from '/Users/yuanxi/Workwork/vibe-fs/requirements/verification-system/tests/e2e/support/supervise-node-test.mjs'
import { PROJECT_CHECK_TIMEOUT_MS, WATCHDOG_TIMEOUT_MS } from '/Users/yuanxi/Workwork/vibe-fs/requirements/verification-system/tests/e2e/support/time-budget.js'

const root = '/Users/yuanxi/Workwork/vibe-fs'
const directory = '/private/tmp/vibe-fs-oct8-alias-release'
const file = process.argv[2]
const allowed = ['requirements/verification-system/tests/016.test.mjs', 'requirements/structured-workflow/tests/012.test.mjs']
if (!allowed.includes(file)) throw new Error('Unknown incomplete integration file')
const label = file.includes('verification-system') ? 'verification016' : 'structured012'
const frozen = JSON.parse(fs.readFileSync(`${directory}/frozen-input.json`))
const digest = computeDigest(collectVerificationInputs(root))
const build = assertBuildFresh({ root })
if (digest !== frozen.digest) throw new Error('Verification inputs changed before supplemental scope')
delete process.env.TESTS_MJS_FILES
delete process.env.NODE_TEST_CONTEXT
const env = { ...process.env, WXS_RELEASE: '1', WXS_TIER_INTEGRATION: '1', WXS_E2E_QUIET: '1', PER_TEST_TIMEOUT_MS: String(PROJECT_CHECK_TIMEOUT_MS) }
delete env.WXS_TIER_RELEASE
const startedAt = new Date().toISOString()
const start = performance.now()
let exitCode = 0
let failure = null
try {
  await superviseNodeTest({ files: [path.join(root, file)], label: `supplemental/${label}`,
    silenceMs: Math.max(WATCHDOG_TIMEOUT_MS, PROJECT_CHECK_TIMEOUT_MS + 5_000),
    logPrefix: `supplemental:${label}`, env, throwOnFailure: true })
} catch (error) {
  exitCode = 1
  failure = String(error.stack ?? error)
  process.stderr.write(failure + '\n')
}
const afterDigest = computeDigest(collectVerificationInputs(root))
const currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const receipt = { scope: [file], completeIntegrationStage: false, startedAt,
  durationMs: performance.now() - start, inputCommit: frozen.commit, currentCommit, digest, afterDigest,
  inputsEqual: digest === afterDigest, build, declaredConcurrency: env.NODE_TEST_CONCURRENCY,
  release: env.WXS_RELEASE, tier: env.WXS_TIER_INTEGRATION,
  perTestTimeoutMs: PROJECT_CHECK_TIMEOUT_MS, silenceMs: Math.max(WATCHDOG_TIMEOUT_MS, PROJECT_CHECK_TIMEOUT_MS + 5_000),
  originalInnerBackstopMs: 300000, exitCode, failure }
fs.writeFileSync(`${directory}/supplemental-${label}.json`, JSON.stringify(receipt, null, 2), { flag: 'wx' })
process.exitCode = exitCode || (receipt.inputsEqual && currentCommit === frozen.commit ? 0 : 1)
