import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { assertBuildFresh, collectVerificationInputs, computeDigest } from '/Users/yuanxi/Workwork/vibe-fs/scripts/lib/build-state.mjs'
import { spawnOwnedVerificationTool } from '/Users/yuanxi/Workwork/vibe-fs/scripts/lib/verification-owned-tool.mjs'

const root = '/Users/yuanxi/Workwork/vibe-fs'
const directory = '/private/tmp/vibe-fs-oct8-alias-release'
const frozen = JSON.parse(fs.readFileSync(`${directory}/frozen-input.json`))
const digest = computeDigest(collectVerificationInputs(root))
const build = assertBuildFresh({ root })
if (digest !== frozen.digest) throw new Error('Physical scope input differs')
const scope = [
  'exact repository Git inputs install through a selected npm 11.12.1 bundle and real JavaScript consumers',
  'a complete selected SDK archive resolves the captured repository global.json and reclaims its owned roots',
  'selected complete SDK restores original repository local tools from explicitly identified NuGet archives',
  'selected complete Git source and SDK restore the original foundation identity project through a fresh-cache locked NuGet graph',
  'four selected input owners compile the original foundation identity project with Fable into isolated outputs',
  'mac readonly views protect actual original-project Fable inputs and restore all prepared owners',
]
const pattern = '^WHAT\\[verification-system-016\\] (' + scope.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')$'
const ownedHome = fs.realpathSync(fs.mkdtempSync('/private/tmp/vibe-fs-physical016-home-'))
const env = { ...process.env, WXS_RELEASE: '1', WXS_TIER_INTEGRATION: '1', WXS_E2E_QUIET: '1', PER_TEST_TIMEOUT_MS: '180000', WANXIANGSHU_NO_FATAL_EXIT: '1', HOME: ownedHome, USERPROFILE: ownedHome, DOTNET_CLI_HOME: process.env.DOTNET_CLI_HOME ?? process.env.HOME }
for (const name of ['TESTS_MJS_FILES', 'NODE_TEST_CONTEXT', 'WXS_TIER_RELEASE']) delete env[name]
const argv = ['--test', '--test-concurrency=1', '--test-timeout=180000', `--test-name-pattern=${pattern}`, 'requirements/verification-system/tests/016.test.mjs']
const startedAt = new Date().toISOString()
const start = performance.now()
const output = fs.createWriteStream(`${directory}/supplemental-physical016.log`, { flags: 'wx' })
let result
let cleanupError = null
let timedOut = false
let monitorPid
try {
  const owned = spawnOwnedVerificationTool(process.execPath, argv, { cwd: root, env })
  monitorPid = owned.child.pid
  for (const stream of [owned.child.stdout, owned.child.stderr]) stream.on('data', chunk => output.write(chunk))
  const timer = setTimeout(() => { timedOut = true; owned.stop() }, 300000)
  result = await owned.completed
  clearTimeout(timer)
} finally {
  await new Promise(resolve => output.end(resolve))
  try { fs.rmSync(ownedHome, { recursive: true }) } catch (error) { cleanupError = String(error.stack ?? error) }
}
let monitorObservation
try { process.kill(monitorPid, 0); monitorObservation = 'still-running' } catch (error) { monitorObservation = error.code }
const afterDigest = computeDigest(collectVerificationInputs(root))
const receipt = { completeIntegrationStage: false, scope, command: [process.execPath, ...argv], startedAt, durationMs: performance.now() - start,
  inputCommit: frozen.commit, currentCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), digest, afterDigest,
  inputsEqual: digest === afterDigest, build, originalBackstopMs: 300000, perTestTimeoutMs: 180000, declaredFileConcurrency: env.NODE_TEST_CONCURRENCY,
  timedOut, exitCode: result.exitCode, signal: result.signal, failure: result.failure ? String(result.failure) : null,
  monitorPid, monitorObservation, ownedHomeRemoved: !fs.existsSync(ownedHome), cleanupError }
fs.writeFileSync(`${directory}/supplemental-physical016.json`, JSON.stringify(receipt, null, 2), { flag: 'wx' })
process.stdout.write(JSON.stringify(receipt, null, 2) + '\n')
process.exitCode = result.exitCode || (timedOut || result.signal || result.failure || cleanupError || !receipt.inputsEqual ? 1 : 0)
