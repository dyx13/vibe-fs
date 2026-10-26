import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { focusedVerificationSteps, verify, verificationSteps } from '../../../scripts/verify.mjs'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { discoverIntegrationTests, discoverRepositoryIntegrationTests } from './support/discover-suite-tests.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

// These cases test orchestration. Input-set correctness has its own 016 probes;
// repeatedly hashing the whole developer checkout obscures this boundary.
function inputFixture(directory) {
  const root = join(directory, 'inputs')
  for (const name of ['src', 'scripts', 'requirements', 'resources']) {
    mkdirSync(join(root, name), { recursive: true })
  }
  writeFileSync(join(root, 'src/Input.fs'), 'module Input\nlet value = 1\n')
  execFileSync('git', ['init', '--quiet', root])
  return root
}

function assertRealEntry(fixtureRoot, command) {
  assert.ok(existsSync(resolve(ROOT, relative(fixtureRoot, command))), `real entry missing: ${command}`)
}

test('WHAT[verification-system-017] repository and package entries own distinct real integration suites', () => {
  const repositoryFiles = discoverRepositoryIntegrationTests(ROOT)
  const packageFiles = discoverIntegrationTests(join(ROOT, 'requirements/distribution/tests'))
  const files = [...repositoryFiles, ...packageFiles]
  assert.ok(repositoryFiles.length > 0)
  assert.ok(packageFiles.length > 0)
  assert.equal(new Set(files).size, files.length)
  assert.ok(files.every((file) => existsSync(file)))
  assert.ok(repositoryFiles.every((file) => !file.startsWith(join(ROOT, 'requirements/distribution/'))))
})

function createMemorySink() {
  let buf = ''
  return {
    write(chunk) {
      buf += chunk
    },
    get output() {
      return buf
    },
  }
}

function writeSuiteFixture(root, suite, source) {
  const directory = join(root, 'requirements', suite, 'tests')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, '001.test.mjs'), source)
}

test('WHAT[verification-system-017] focused selection reaches the real unit runner without enabling other tiers', () => {
  const root = mkdtempSync(join(tmpdir(), 'focused-selection-'))
  const { NODE_TEST_CONTEXT, ...hostEnv } = process.env
  try {
    writeSuiteFixture(root, 'selected', `import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import test from 'node:test'
test('selected proof', () => {
  appendFileSync('selected-ran', 'selected\\n')
  assert.equal(process.env.WXS_TIER_INTEGRATION, '0')
  assert.equal(process.env.WXS_TIER_RELEASE, '0')
  assert.equal(process.env.WXS_RELEASE, '0')
})
`)
    writeSuiteFixture(root, 'unselected', `import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import test from 'node:test'
test('unselected failure', () => {
  writeFileSync('unselected-ran', 'ran')
  assert.fail('selected failure must propagate')
})
`)
    const run = (suites) => {
      const [step] = focusedVerificationSteps({ root, suites, env: {
        ...hostEnv,
        NODE_TEST_CONCURRENCY: '1',
        TESTS_MJS_FILES: 'requirements/unselected/tests/001.test.mjs',
        WXS_TIER_INTEGRATION: '1',
        WXS_TIER_RELEASE: '1',
        WXS_RELEASE: '1',
      } })
      assertRealEntry(root, step.argv[0])
      // These runner fixtures import no generated product output.
      return spawnSync(step.cmd, [resolve(ROOT, relative(root, step.argv[0])), '--skip-staleness-check'], {
        cwd: root,
        env: step.env,
        encoding: 'utf8',
      })
    }

    const selected = run(' selected,selected ')
    assert.ifError(selected.error)
    assert.equal(selected.signal, null, selected.stderr)
    assert.equal(selected.status, 0, selected.stderr + selected.stdout)
    assert.equal(readFileSync(join(root, 'selected-ran'), 'utf8'), 'selected\n')
    assert.equal(existsSync(join(root, 'unselected-ran')), false)

    const failed = run('unselected')
    assert.ifError(failed.error)
    assert.equal(failed.signal, null, failed.stderr)
    assert.equal(failed.status, 1, failed.stderr + failed.stdout)
    assert.equal(readFileSync(join(root, 'unselected-ran'), 'utf8'), 'ran')
    assert.equal(readFileSync(join(root, 'selected-ran'), 'utf8'), 'selected\n')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('WHAT[verification-system-017] invalid focused suites fail before creating a run or starting a stage', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'focused-invalid-'))
  const root = inputFixture(directory)
  const logDirectory = join(directory, 'logs')
  try {
    writeSuiteFixture(root, 'selected', '')
    mkdirSync(join(root, 'requirements/empty/tests'), { recursive: true })
    mkdirSync(join(root, 'requirements/blocked'), { recursive: true })
    writeFileSync(join(root, 'requirements/blocked/tests'), 'not a directory')
    symlinkSync(join(root, 'requirements/selected'), join(root, 'requirements/linked'), 'dir')
    for (const suites of ['', ' ', [], [''], 'selected,', 'selected,missing', 'selected,empty',
      '..', '../selected', 'selected\\tests', 'blocked', 'linked']) {
      const calls = []
      const result = await verify({ root, suites, logDirectory, output: createMemorySink(),
        runStep: async ({ label }) => {
          calls.push(label)
          return { label, ok: true, exitCode: 0 }
        },
      })
      assert.equal(result.exitCode, 1, JSON.stringify(suites))
      assert.equal(result.outcome, 'fail')
      assert.ok(result.failureReason)
      assert.deepEqual(calls, [])
      assert.equal(existsSync(logDirectory), false)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('WHAT[verification-system-017] release cannot silently become focused unit verification', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'focused-release-'))
  try {
    const calls = []
    const result = await verify({ root: directory, release: true, suites: 'selected',
      logDirectory: join(directory, 'logs'), output: createMemorySink(),
      runStep: async ({ label }) => {
        calls.push(label)
        return { label, ok: true, exitCode: 0 }
      },
    })
    assert.equal(result.exitCode, 1)
    assert.match(result.failureReason, /--release cannot be combined with --suites/)
    assert.deepEqual(calls, [])
    assert.equal(existsSync(join(directory, 'logs')), false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('WHAT[verification-system-017] a missing suite value cannot consume another CLI option', () => {
  const { NODE_TEST_CONTEXT, ...env } = process.env
  for (const option of ['--verbose', '--release']) {
    const result = spawnSync(process.execPath, [join(ROOT, 'scripts/verify.mjs'), '--suites', option, '--help'], {
      env,
      encoding: 'utf8',
    })
    assert.ifError(result.error)
    assert.equal(result.signal, null)
    assert.equal(result.status, 2, result.stderr + result.stdout)
    assert.match(result.stderr, /--suites requires a package list/)
  }
})

test('WHAT[verification-system-017] release adds one Long Stroke and package proof after a clean build', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'release-order-'))
  const root = inputFixture(directory)
  const calls = []
  try {
    const result = await verify({ root, release: true, logDirectory: directory, output: createMemorySink(),
      runStep: async ({ label, argv }) => {
        calls.push({ label, argv })
        return { label, ok: true, exitCode: 0, signal: null, durationMs: 0 }
      },
    })
    assert.equal(result.exitCode, 0)
    assert.deepEqual(calls.map(({ label }) => label), ['format:check', 'check', 'build', 'unit', 'integration', 'e2e', 'package'])
    assert.deepEqual(calls.find(({ label }) => label === 'build').argv, [join(root, 'scripts/build.mjs')])
    for (const label of ['e2e', 'package']) assertRealEntry(root, calls.find((call) => call.label === label).argv[0])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('WHAT[verification-system-017] a failed stage stops the ladder without retry or a success result', async () => {
  for (const failed of ['unit', 'integration', 'e2e', 'package']) {
    const directory = mkdtempSync(join(tmpdir(), 'release-failure-'))
    const root = inputFixture(directory)
    const calls = []
    try {
      const result = await verify({ root, release: true, logDirectory: directory, output: createMemorySink(),
        runStep: async ({ label }) => {
          calls.push(label)
          return { label, ok: label !== failed, exitCode: label === failed ? 1 : 0, signal: null, durationMs: 0 }
        },
      })
      assert.equal(result.exitCode, 1)
      assert.equal(result.outcome, 'fail')
      const order = ['format:check', 'check', 'build', 'unit', 'integration', 'e2e', 'package']
      assert.deepEqual(calls, order.slice(0, order.indexOf(failed) + 1))
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
})

test('WHAT[verification-system-017] daily verification executes each stage in order', async () => {
  const { scripts } = JSON.parse(read('package.json'))
  const command = scripts['format-build-test']
  assert.equal(typeof command, 'string', 'package.json scripts.format-build-test must exist')
  assert.equal(command, 'node scripts/verify.mjs', 'daily pipeline must dispatch to verify.mjs')

  const tmpLogDir = mkdtempSync(join(tmpdir(), 'proof-ladder-logs-'))
  const root = inputFixture(tmpLogDir)
  const sink = createMemorySink()
  const spawned = []
  const fakeRunStep = async ({ label, argv }) => {
    spawned.push({ label, argv: argv.map((arg) => String(arg)) })
    return { label, ok: true, exitCode: 0, signal: null, durationMs: 0 }
  }

  try {
    const defaultLatest = join(ROOT, '.fable-build/verify-logs/latest')
    const beforeLink = existsSync(defaultLatest) ? readlinkSync(defaultLatest) : null

    const result = await verify({
      root,
      release: false,
      runStep: fakeRunStep,
      output: sink,
      logDirectory: tmpLogDir,
})
    assert.equal(result.exitCode, 0, 'daily verify under a green step spy must succeed')
    assert.equal(result.outcome, 'pass')
    assert.ok(result.steps.every((s) => s.status === 'ok'))

  const labels = spawned.map((entry) => entry.label)
  assert.deepEqual(labels, [
    'format:check',
    'check',
    'build',
    'unit',
    'integration',
  ])

    const buildArgs = spawned.find((s) => s.label === 'build').argv
    assert.ok(buildArgs.some((a) => a.includes('scripts/build.mjs')), 'build must dispatch to build.mjs')
    assertRealEntry(root, buildArgs[0])
  const unitArgs = spawned.find((s) => s.label === 'unit').argv
  assert.ok(unitArgs.some((a) => a.includes('requirements/verification-system/tests/run.mjs')))
    assertRealEntry(root, unitArgs[0])
  const integrationArgs = spawned.find((s) => s.label === 'integration').argv
  assert.ok(integrationArgs.some((a) => a.includes('tests/integration/run.mjs')))
    assertRealEntry(root, integrationArgs[0])

    assert.match(sink.output, /PASS  verify daily/)
    const afterLink = existsSync(defaultLatest) ? readlinkSync(defaultLatest) : null
    assert.equal(afterLink, beforeLink, 'default verify-logs/latest must not be modified')
  } finally {
    rmSync(tmpLogDir, { recursive: true, force: true })
  }
})

test('WHAT[verification-system-017] formal verification cannot inherit a narrowed test selection', () => {
  const hostEnvWithOverride = {
    ...process.env,
    NODE_TEST_VERBOSE: '1',
    TESTS_MJS_FILES: 'requirements/verification-system/tests/fake.test.mjs',
  }

  const dailyStepsVerbose = verificationSteps({
    root: ROOT,
    release: false,
    verbose: true,
    env: hostEnvWithOverride,
  })
  const unitVerbose = dailyStepsVerbose.find((s) => s.label === 'unit')
  const integrationVerbose = dailyStepsVerbose.find((s) => s.label === 'integration')

  assert.ok(unitVerbose, 'unit step must exist')
  assert.ok(integrationVerbose, 'integration step must exist')
  assert.equal('TESTS_MJS_FILES' in unitVerbose.env, false, 'unit step env must not contain TESTS_MJS_FILES')
  assert.equal('TESTS_MJS_FILES' in integrationVerbose.env, false, 'integration step env must not contain TESTS_MJS_FILES')
  assert.equal(unitVerbose.env.NODE_TEST_VERBOSE, '1', 'unit step env must receive NODE_TEST_VERBOSE=1 when verbose=true')
  assert.equal(integrationVerbose.env.NODE_TEST_VERBOSE, '1', 'integration step env must receive NODE_TEST_VERBOSE=1 when verbose=true')
  assert.equal(unitVerbose.env.WXS_E2E_QUIET, '1', 'unit step env must keep WXS_E2E_QUIET')
  assert.equal(integrationVerbose.env.WXS_E2E_QUIET, '1', 'integration step env must keep WXS_E2E_QUIET')

  const dailyStepsNonVerbose = verificationSteps({
    root: ROOT,
    release: false,
    verbose: false,
    env: hostEnvWithOverride,
  })
  const unitNonVerbose = dailyStepsNonVerbose.find((s) => s.label === 'unit')
  assert.equal('NODE_TEST_VERBOSE' in unitNonVerbose.env, false, 'unit step env must not set NODE_TEST_VERBOSE when verbose=false')

  const releaseSteps = verificationSteps({
    root: ROOT,
    release: true,
    verbose: true,
    env: hostEnvWithOverride,
  })
  const e2e = releaseSteps.find((s) => s.label === 'e2e')
  const pkg = releaseSteps.find((s) => s.label === 'package')
  assert.ok(e2e && pkg)
  assert.equal('TESTS_MJS_FILES' in e2e.env, false, 'e2e step env must not contain TESTS_MJS_FILES')
  assert.equal('TESTS_MJS_FILES' in pkg.env, false, 'package step env must not contain TESTS_MJS_FILES')
})

test('WHAT[verification-system-017] profiled verification reports the stages actually executed', async () => {
  const tmpLogDir = mkdtempSync(join(tmpdir(), 'proof-ladder-profile-'))
  const root = inputFixture(tmpLogDir)
  const sink = createMemorySink()
  const fakeRunStep = async ({ label }) => ({
    label,
    ok: true,
    exitCode: 0,
    signal: null,
    durationMs: 25,
  })

  try {
    const result = await verify({
      root,
      release: false,
      verbose: false,
      profile: true,
      runStep: fakeRunStep,
      output: sink,
      logDirectory: tmpLogDir,
    })

    assert.equal(result.exitCode, 0)
    assert.ok(Array.isArray(result.profile), 'verify result must contain profile array')
    assert.equal(result.profile.length, 5)
    assert.deepEqual(
      result.profile.map((p) => p.stage),
      ['format:check', 'check', 'build', 'unit', 'integration'],
    )
    assert.ok(result.steps.every((s) => typeof s.wallMs === 'number'), 'each step must have wallMs')
    assert.match(sink.output, /PASS verify daily · 各阶段耗时:/)
    assert.match(sink.output, /format:check\s+25ms/)
  } finally {
    rmSync(tmpLogDir, { recursive: true, force: true })
  }
})
