#!/usr/bin/env node
// verify.mjs — the fixed verification pipeline. `format-build-test` is the developer
// entry; `verify:release` adds release-only proofs (compiler-boundary canary,
// repo-wide envelope oracle, Long Stroke, real package) after the shared
// format/check/build/unit phases.

import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { walk } from './lib/walk.mjs'
import { collectVerificationInputs, computeDigest, diffVerificationInputs } from './lib/build-state.mjs'
import { ensureNativeOpencode } from './lib/ensure-native-opencode.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// 确保在沙箱和 CI 容器中，WIREIT_PARALLEL 始终有合理的正整数基准值，防止 WorkerPool got 0
if (!process.env.WIREIT_PARALLEL || Number(process.env.WIREIT_PARALLEL) < 1) {
  process.env.WIREIT_PARALLEL = String(Math.max(1, os.cpus()?.length || 4))
}

export function getTestEnv({ verbose = false, hostEnv = process.env, extra = {} } = {}) {
  const { TESTS_MJS_FILES, NODE_TEST_VERBOSE, ...cleanEnv } = hostEnv
  return {
    ...cleanEnv,
    ...(verbose ? { NODE_TEST_VERBOSE: '1' } : {}),
    WXS_E2E_QUIET: '1',
    ...extra,
  }
}

export function verificationSteps({ root = ROOT, release = false, verbose = false, env: hostEnv = process.env } = {}) {
  const steps = [
    {
      label: 'format:check',
      cmd: 'npm',
      argv: ['run', 'format:check'],
      env: hostEnv,
    },
    {
      label: 'check',
      cmd: 'npm',
      argv: ['run', 'check'],
      env: hostEnv,
    },
    {
      label: 'build',
      cmd: process.execPath,
      argv: [path.join(root, 'scripts/build.mjs')],
      env: hostEnv,
    },
    {
      label: 'unit',
      cmd: process.execPath,
      argv: [path.join(root, 'requirements/verification-system/tests/run.mjs')],
      env: getTestEnv({
        verbose,
        hostEnv,
        extra: {
          ...(hostEnv.UNIT_VERDICT_SILENCE_MS ? { UNIT_VERDICT_SILENCE_MS: hostEnv.UNIT_VERDICT_SILENCE_MS } : {}),
          ...(hostEnv.SUITE_BACKSTOP_MS ? { SUITE_BACKSTOP_MS: hostEnv.SUITE_BACKSTOP_MS } : {}),
          ...(hostEnv.WXS_VERIFICATION_WORKER_DIAGNOSTICS ? { WXS_VERIFICATION_WORKER_DIAGNOSTICS: hostEnv.WXS_VERIFICATION_WORKER_DIAGNOSTICS } : {}),
          ...(hostEnv.NODE_TEST_CONCURRENCY ? { NODE_TEST_CONCURRENCY: hostEnv.NODE_TEST_CONCURRENCY } : {}),
          ...(hostEnv.WXS_ACCEPT_TODO ? { WXS_ACCEPT_TODO: hostEnv.WXS_ACCEPT_TODO } : {}),
        },
      }),
    },
    {
      label: 'integration',
      cmd: process.execPath,
      argv: [path.join(root, 'requirements/verification-system/tests/integration/run.mjs')],
      timeoutMs: release ? 1_200_000 : 600_000,
      env: getTestEnv({ verbose, hostEnv, extra: release ? { WXS_RELEASE: '1' } : {} }),
    },
  ]

  if (release) {
    steps.push(
      {
        label: 'e2e',
        cmd: process.execPath,
        argv: [path.join(root, 'requirements/verification-system/tests/014.test.mjs')],
        timeoutMs: 1_500_000,
        env: getTestEnv({ verbose, hostEnv, extra: { WXS_TIER_RELEASE: '1' } }),
      },
      {
        label: 'package',
        cmd: process.execPath,
        argv: [path.join(root, 'scripts/verify-package.mjs')],
        timeoutMs: 600_000,
        env: getTestEnv({ verbose, hostEnv }),
      },
    )
  }

  return steps
}

export function focusedSuiteFiles(root, suites) {
  const requested = Array.isArray(suites) ? suites : typeof suites === 'string' ? suites.split(',') : []
  if (requested.length === 0) throw new Error('focused verify: --suites requires at least one package name')
  const suiteList = [...new Set(requested.map((value) => {
    const suite = typeof value === 'string' ? value.trim() : ''
    if (!suite || suite === '.' || suite === '..' || /[\\/,\0]/.test(suite)) {
      throw new Error(`focused verify: invalid package name: ${JSON.stringify(value)}`)
    }
    return suite
  }))]
  const allFiles = []
  for (const suite of suiteList) {
    const suiteRoot = path.join(root, 'requirements', suite)
    if (!fs.lstatSync(suiteRoot, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`focused verify: package directory is missing or not a real directory: ${suite}`)
    }
    const suiteDir = path.join(suiteRoot, 'tests')
    const files = walk(suiteDir, ['.test.mjs'])
      .map((f) => path.relative(root, f).replace(/\\/g, '/'))
      .filter((f) => !f.includes('/tests/e2e/') && !f.includes('/tests/integration/'))
    if (files.length === 0) throw new Error(`focused verify: no unit *.test.mjs found for suite: ${suite}`)
    allFiles.push(...files)
  }
  return { suites: suiteList, files: [...new Set(allFiles)].sort() }
}

export function focusedVerificationSteps({ root = ROOT, suites, verbose = false, env: hostEnv = process.env } = {}) {
  const { suites: suiteList, files } = focusedSuiteFiles(root, suites)
  return [
    {
      label: 'unit',
      cmd: process.execPath,
      argv: [path.join(root, 'requirements/verification-system/tests/run.mjs')],
      env: getTestEnv({ verbose, hostEnv, extra: {
        TESTS_MJS_FILES: files.join(','),
        WXS_TIER_INTEGRATION: '0',
        WXS_TIER_RELEASE: '0',
        WXS_RELEASE: '0',
      } }),
      focusedFiles: files,
      focusedSuites: suiteList,
    },
  ]
}

function defaultRunStepFactory(root, verbose, output) {
  return async function defaultRunStep({
    label,
    cmd = process.execPath,
    argv,
    env,
    timeoutMs = 600_000,
    logDir,
    cwd = root,
    focusedFiles,
  }) {
    const startedAt = Date.now()
    const stepLog = path.join(logDir, `${label.replace(/:/g, '-')}.log`)
    const logStream = fs.createWriteStream(stepLog, { flags: 'w' })

    let killed = false
    const timer = setTimeout(() => {
      killed = true
      child.kill('SIGKILL')
    }, timeoutMs)
    timer.unref()

    let child
    let unitResult = null
    let unitResultError = null
    try {
      const childEnv = env ? { ...env } : (() => {
        const { TESTS_MJS_FILES, ...cleanEnv } = process.env
        return cleanEnv
      })()
      if (childEnv.WXS_RELEASE === undefined) {
        childEnv.WXS_RELEASE = '0'
      }
      if (!childEnv.WIREIT_PARALLEL || Number(childEnv.WIREIT_PARALLEL) < 1) {
        childEnv.WIREIT_PARALLEL = String(Math.max(1, os.cpus()?.length || 4))
      }
      child = spawn(cmd, argv, {
        cwd,
        stdio: label === 'unit' ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
        env: childEnv,
      })
    } catch (spawnError) {
      clearTimeout(timer)
      logStream.end()
      return {
        label,
        exitCode: 1,
        signal: null,
        killed: false,
        durationMs: Date.now() - startedAt,
        logPath: path.relative(root, stepLog),
        ok: false,
        error: spawnError,
      }
    }

    if (label === 'unit') child.on('message', (message) => {
      try {
        if (unitResult || unitResultError || message?.type !== 'verification:unit-result') {
          throw new Error('unit result channel received an unexpected or repeated message')
        }
        unitResult = validateUnitResult(message.data, root, focusedFiles)
      } catch (error) {
        unitResult = null
        unitResultError = error
      }
    })

    child.stdout.on('data', (chunk) => {
      logStream.write(chunk)
      if (verbose) output.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      logStream.write(chunk)
      process.stderr.write(chunk)
    })

    const exit = await new Promise((resolveExit) => {
      child.on('error', (error) => resolveExit({ code: 1, signal: null, error }))
      child.on('close', (code, signal) => resolveExit({ code: code ?? 1, signal }))
    })

    clearTimeout(timer)
    logStream.end()

    if (label === 'unit' && !unitResult && !unitResultError) unitResultError = new Error('unit result was not received')
    const ok = exit.code === 0 && !exit.signal && !killed && !unitResultError &&
      (label !== 'unit' || unitResult.outcome === 'pass')

    if (!ok) {
      if (unitResultError) process.stderr.write(`[${label}] ${unitResultError.message}\n`)
      // 无论 verbose 与否，失败时自动 Dump 诊断日志尾部到控制台，消除 CI 无控制台输出的信息黑洞
      try {
        const content = fs.readFileSync(stepLog, 'utf8')
        const lines = content.trim().split('\n')
        const tailLines = lines.slice(-60).join('\n')
        if (tailLines) {
          process.stderr.write(`\n--- [${label}] 错误诊断日志转储 (最后 ${Math.min(60, lines.length)} 行) ---\n`)
          process.stderr.write(tailLines + '\n')
          process.stderr.write(`--- [${label}] 完整日志见: ${path.relative(root, stepLog)} ---\n\n`)
        }
      } catch {}
    }

    return {
      label,
      exitCode: ok ? 0 : exit.code || 1,
      signal: exit.signal,
      killed,
      durationMs: Date.now() - startedAt,
      logPath: path.relative(root, stepLog),
      ok,
      ...(unitResult ? { verification: unitResult } : {}),
      ...(unitResultError || exit.error ? { error: unitResultError ?? exit.error } : {}),
    }
  }
}

function validateUnitResult(value, root, focusedFiles) {
  const countKeys = ['passed', 'failed', 'skipped', 'todo', 'cancelled', 'containerFailures']
  const validFiles = files => Array.isArray(files) && new Set(files).size === files.length &&
    files.every(file => typeof file === 'string' && path.isAbsolute(file))
  if (!value || value.version !== 1 || !['pass', 'fail'].includes(value.outcome) ||
      !validFiles(value.plannedFiles) || value.plannedFiles.length === 0 ||
      value.completedFiles !== null && (!validFiles(value.completedFiles) ||
        value.completedFiles.some(file => !value.plannedFiles.includes(file))) ||
      value.counts !== null && (!value.counts || countKeys.some(key => !Number.isSafeInteger(value.counts[key]) || value.counts[key] < 0)) ||
      value.outcome === 'pass' && (!value.counts || value.counts.failed > 0 || value.counts.cancelled > 0 ||
        value.counts.containerFailures > 0 || value.completedFiles?.length !== value.plannedFiles.length)) {
    throw new Error('unit result has an invalid scope or verdict')
  }
  const realRoot = fs.realpathSync(root)
  const relativeFiles = files => files.map(file => path.relative(realRoot, file).replace(/\\/g, '/')).sort()
  const plannedFiles = relativeFiles(value.plannedFiles)
  if (focusedFiles && JSON.stringify(plannedFiles) !== JSON.stringify([...focusedFiles].sort())) {
    throw new Error('unit result differs from the focused file plan')
  }
  return { ...value, plannedFiles, completedFiles: value.completedFiles === null ? null : relativeFiles(value.completedFiles) }
}

function allocateRunLogDir(baseLogDir) {
  fs.mkdirSync(baseLogDir, { recursive: true })
  const baseStamp = new Date().toISOString().replace(/[:.]/g, '-')
  let stamp = baseStamp
  let seq = 1
  while (fs.existsSync(path.join(baseLogDir, stamp))) {
    stamp = `${baseStamp}-${seq++}`
  }
  const runLogDir = path.join(baseLogDir, stamp)
  fs.mkdirSync(runLogDir, { recursive: true })

  const latestLink = path.join(baseLogDir, 'latest')
  try {
    fs.unlinkSync(latestLink)
  } catch {}
  try {
    fs.symlinkSync(stamp, latestLink, 'dir')
  } catch {}

  return runLogDir
}

export async function verify({
  root = ROOT,
  release = false,
  suites = null,
  verbose = false,
  profile = false,
  runStep: runStepOverride,
  output = process.stdout,
  logDirectory,
  env: hostEnv = process.env,
} = {}) {
  const resolvedRoot = path.resolve(root)
  let plannedSteps
  let mode
  let focusedInfo = null
  if (suites !== null) {
    try {
      if (release) throw new Error('focused verify: --release cannot be combined with --suites')
      plannedSteps = focusedVerificationSteps({ root: resolvedRoot, suites, verbose, env: hostEnv })
      focusedInfo = { suites: plannedSteps[0].focusedSuites, files: plannedSteps[0].focusedFiles }
      mode = `focused (${focusedInfo.suites.join(', ')})`
    } catch (err) {
      output.write(`FAIL: ${err.message}\n`)
      return {
        mode: 'focused',
        outcome: 'fail',
        failureReason: err.message,
        exitCode: 1,
      }
    }
  } else {
    plannedSteps = verificationSteps({ root: resolvedRoot, release, verbose, env: hostEnv })
    mode = release ? 'release' : 'daily'
  }
  ensureNativeOpencode({ root: resolvedRoot })
  const baseLogDir = logDirectory ? path.resolve(logDirectory) : path.join(resolvedRoot, '.fable-build', 'verify-logs')
  const runLogDir = allocateRunLogDir(baseLogDir)
  const stepRunner = runStepOverride ?? defaultRunStepFactory(resolvedRoot, verbose, output)
  const runStart = Date.now()
  const finish = (result) => {
    if (focusedInfo) {
      const unit = result.steps.find(step => step.label === 'unit')
      const excluded = label => ({ label, status: 'not-run', reason: 'outside-focused-unit-scope' })
      result.steps = [
        ...['format:check', 'check', 'build'].map(excluded),
        ...result.steps,
        ...['integration', 'e2e', 'package'].map(excluded),
      ]
      result.scope = {
        requestedSuites: focusedInfo.suites,
        plannedFiles: focusedInfo.files,
        completedFiles: unit?.verification?.completedFiles ?? null,
        counts: unit?.verification?.counts ?? null,
      }
      output.write('Scope: unit only; format:check, check, build, integration, e2e, package not-run.\n')
      output.write(`Completed files: ${result.scope.completedFiles?.length ?? 'unknown'}/${focusedInfo.files.length}; report: ${path.join(runLogDir, 'report.json')}\n`)
    }
    fs.writeFileSync(path.join(runLogDir, 'report.json'), JSON.stringify(result, null, 2) + '\n')
    return result
  }

  let beforeInputs
  try {
    beforeInputs = collectVerificationInputs(resolvedRoot)
  } catch (err) {
    const wallMs = Date.now() - runStart
    output.write(`\n=== verify: ${mode}  inputs=error ===\n`)
    output.write(`FAIL: input collection error: ${err.message}\n`)
    return finish({
      mode,
      steps: plannedSteps.map((p) => ({ label: p.label, status: 'not-run' })),
      outcome: 'fail',
      failureReason: `input-collection-failed: ${err.message}`,
      wallMs,
      logDirectory: runLogDir,
      exitCode: 1,
    })
  }

  const fullDigest = computeDigest(beforeInputs)
  const initialDigest = fullDigest.slice(0, 16)
  if (focusedInfo) {
    output.write(`\n=== verify: ${mode}  inputs=${initialDigest}  files=${focusedInfo.files.length} ===\n`)
  } else {
    output.write(`\n=== verify: ${mode}  inputs=${initialDigest} ===\n`)
  }

  const stepResults = []
  let pipelineFailed = false
  let failureReason
  let inputChanges

  for (let i = 0; i < plannedSteps.length; i++) {
    const stepPlan = plannedSteps[i]
    if (pipelineFailed) {
      stepResults.push({ label: stepPlan.label, status: 'not-run' })
      continue
    }

    let res
    try {
      res = await stepRunner({
        ...stepPlan,
        logDir: runLogDir,
        cwd: resolvedRoot,
      })
    } catch (err) {
      res = {
        label: stepPlan.label,
        ok: false,
        exitCode: 1,
        signal: null,
        durationMs: 0,
        error: err,
      }
    }

    const durationMs = res.durationMs ?? 0
    if (res.ok) {
      stepResults.push({
        label: res.label ?? stepPlan.label,
        stage: res.label ?? stepPlan.label,
        status: 'ok',
        exitCode: res.exitCode ?? 0,
        signal: res.signal ?? null,
        durationMs,
        wallMs: durationMs,
        ...(res.verification ? { verification: res.verification } : {}),
      })
      output.write(`  ${stepPlan.label.padEnd(14)} OK  ${(durationMs / 1000).toFixed(1)}s\n`)

      try {
        const currentInputs = collectVerificationInputs(resolvedRoot)
        const diff = diffVerificationInputs(beforeInputs, currentInputs)
        if (!diff.equal) {
          pipelineFailed = true
          inputChanges = diff
          failureReason = `inputs-changed:${diff.reason}`
        }
      } catch (err) {
        pipelineFailed = true
        failureReason = `after-input-collection-failed: ${err.message}`
      }
    } else {
      pipelineFailed = true
      failureReason = `step-failed:${stepPlan.label}`
      stepResults.push({
        label: res.label ?? stepPlan.label,
        stage: res.label ?? stepPlan.label,
        status: 'failed',
        exitCode: res.exitCode ?? 1,
        signal: res.signal ?? null,
        durationMs,
        wallMs: durationMs,
        ...(res.verification ? { verification: res.verification } : {}),
        ...(res.error ? { error: res.error.message ?? String(res.error) } : {}),
      })
      output.write(`  ${stepPlan.label.padEnd(14)} FAIL(${res.exitCode ?? 1})  ${(durationMs / 1000).toFixed(1)}s\n`)
    }
  }

  let afterInputs
  if (!inputChanges) {
    try {
      afterInputs = collectVerificationInputs(resolvedRoot)
      const diff = diffVerificationInputs(beforeInputs, afterInputs)
      if (!diff.equal) {
        inputChanges = diff
        if (!pipelineFailed) {
          pipelineFailed = true
          failureReason = `inputs-changed:${diff.reason}`
        }
      }
    } catch (err) {
      if (!pipelineFailed) {
        pipelineFailed = true
        failureReason = `after-input-collection-failed: ${err.message}`
      }
    }
  }

  const wallMs = Date.now() - runStart
  if (pipelineFailed) {
    if (inputChanges) {
      output.write(`FAIL: inputs changed mid-run (${inputChanges.reason}) — subsequent results do not apply to initial inputs (${initialDigest})\n`)
    }
    output.write(`FAIL  verify ${mode}  ${(wallMs / 1000).toFixed(1)}s\n`)
    if (profile) {
      output.write(`\nFAIL verify ${mode} · 各阶段耗时:\n`)
      for (const s of stepResults) {
        output.write(`  ${s.label.padEnd(14)} ${s.wallMs ?? 0}ms\n`)
      }
      output.write(`  ${JSON.stringify(stepResults.map((s) => ({ stage: s.label, wallMs: s.wallMs ?? 0 })))}\n`)
    }
    return finish({
      mode,
      steps: stepResults,
      outcome: 'fail',
      candidateDigest: fullDigest,
      ...(failureReason ? { failureReason } : {}),
      ...(inputChanges ? { inputChanges } : {}),
      wallMs,
      logDirectory: runLogDir,
      exitCode: 1,
      profile: stepResults.map((s) => ({ stage: s.label, wallMs: s.wallMs ?? 0 })),
    })
  }

  output.write(`PASS  verify ${mode}  ${(wallMs / 1000).toFixed(1)}s\n`)
  if (profile) {
    output.write(`\nPASS verify ${mode} · 各阶段耗时:\n`)
    for (const s of stepResults) {
      output.write(`  ${s.label.padEnd(14)} ${s.wallMs ?? 0}ms\n`)
    }
    output.write(`  ${JSON.stringify(stepResults.map((s) => ({ stage: s.label, wallMs: s.wallMs ?? 0 })))}\n`)
  }
  return finish({
    mode,
    steps: stepResults,
    outcome: 'pass',
    candidateDigest: fullDigest,
    wallMs,
    logDirectory: runLogDir,
    exitCode: 0,
    profile: stepResults.map((s) => ({ stage: s.label, wallMs: s.wallMs ?? 0 })),
  })
}

async function main() {
  const argv = process.argv.slice(2)
  let release = false
  let verbose = false
  let profile = false
  let suites = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--release') {
      release = true
    } else if (arg.startsWith('--suites=')) {
      suites = arg.slice('--suites='.length)
    } else if (arg === '--suites') {
      if (!argv[i + 1] || argv[i + 1].startsWith('-')) {
        process.stderr.write('focused verify: --suites requires a package list\n')
        process.exitCode = 2
        return
      }
      suites = argv[++i]
    } else if (arg === '--verbose') {
      verbose = true
    } else if (arg === '--profile') {
      profile = true
    } else if (arg === '-h' || arg === '--help') {
      process.stdout.write('Usage: node scripts/verify.mjs [--release] [--verbose] [--profile] [--suites <pkg,...>]\n')
      process.stdout.write('--suites runs unit tests for the named packages after an explicit build; it cannot be combined with --release.\n')
      process.exit(0)
    } else {
      process.stderr.write(`Unknown option: ${arg}\n`)
      process.exit(2)
    }
  }

  const result = await verify({ release, suites, verbose, profile, env: process.env })
  process.exitCode = result.exitCode
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
