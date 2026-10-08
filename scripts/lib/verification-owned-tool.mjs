import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeVerificationToolPhase } from './verification-tool-diagnostics.mjs'

const monitorPath = fileURLToPath(new URL('./verification-tool-monitor.mjs', import.meta.url))

function monitorFailure(message, cause) {
  return Object.assign(new Error(message, { cause }), { code: 'verification-tool-monitor-failed' })
}

function decodeFailure(value, depth = 0) {
  if (depth > 4 || !value || typeof value !== 'object' || typeof value.name !== 'string' || typeof value.message !== 'string') {
    throw monitorFailure('The tool monitor supplied an invalid failure')
  }
  const error = new Error(value.message, value.cause === undefined ? undefined : { cause: decodeFailure(value.cause, depth + 1) })
  error.name = value.name
  for (const key of ['code', 'errno', 'syscall', 'path']) {
    if (value[key] === undefined) continue
    if (typeof value[key] !== 'string' && typeof value[key] !== 'number') {
      throw monitorFailure(`The tool monitor supplied an invalid failure ${key}`)
    }
    error[key] = value[key]
  }
  return error
}

function decodeTerminal(message) {
  if (!message || message.type !== 'verification-tool-terminal' || message.version !== 1 ||
      !Array.isArray(message.failures) || message.failures.length > 8 ||
      !(message.exitCode === null || Number.isInteger(message.exitCode) && message.exitCode >= 0 && message.exitCode <= 255) ||
      !(message.signal === null || typeof message.signal === 'string' && /^SIG[A-Z0-9]+$/.test(message.signal)) ||
      message.exitCode !== null && message.signal !== null ||
      message.exitCode === null && message.signal === null && message.failures.length === 0) {
    throw monitorFailure('The tool monitor supplied an invalid terminal record')
  }
  return { exitCode: message.exitCode, signal: message.signal, failures: message.failures.map(value => decodeFailure(value)) }
}

export function spawnOwnedVerificationTool(executable, argv, { cwd, env }) {
  if (typeof executable !== 'string' || executable.length === 0) throw new TypeError('The selected tool executable must be a non-empty string')
  if (!Array.isArray(argv)) throw new TypeError('The selected tool arguments must be an array')
  const diagnostics = process.env.WXS_VERIFICATION_TOOL_DIAGNOSTICS === '1'
  const monitorEnv = { ...(env ?? process.env) }
  delete monitorEnv.WXS_VERIFICATION_TOOL_DIAGNOSTICS
  if (diagnostics) monitorEnv.WXS_VERIFICATION_TOOL_DIAGNOSTICS = '1'
  const child = spawn(process.execPath, [monitorPath, executable, ...argv], {
    cwd, env: monitorEnv, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  })
  child.once('spawn', () => writeVerificationToolPhase(diagnostics, 'monitor-spawned', { monitorPid: child.pid, executable }))
  const failures = []
  let resolveStarted
  const started = new Promise(resolve => { resolveStarted = resolve })
  const stop = () => {
    try { child.stdin?.destroy() }
    catch (error) { failures.push(monitorFailure('The tool monitor lifeline could not be closed', error)) }
  }
  const completed = new Promise(resolve => {
    let terminal = null
    let toolPid = null
    const fail = error => {
      failures.push(error)
      stop()
    }
    child.once('error', error => fail(monitorFailure('The tool monitor could not start', error)))
    child.stdin?.on('error', error => fail(monitorFailure('The tool monitor lifeline failed', error)))
    child.on('message', message => {
      if (diagnostics && message?.type === 'verification-tool-phase') {
        if (['tool-spawned', 'tool-exited', 'group-drained', 'group-drain-failed'].includes(message.phase) &&
            message.data?.pid === child.pid && message.data?.parentPid === process.pid) {
          writeVerificationToolPhase(true, message.phase, message.data)
        }
        return
      }
      try {
        if (message?.type === 'verification-tool-started') {
          if (toolPid !== null || terminal !== null || message.version !== 1 || message.monitorPid !== child.pid ||
              !Number.isInteger(message.pid) || message.pid <= 0 || message.pid === child.pid) {
            throw monitorFailure('The tool monitor supplied an invalid or repeated start record')
          }
          toolPid = message.pid
          resolveStarted({ pid: toolPid, failure: null })
          return
        }
        if (terminal !== null) throw monitorFailure('The tool monitor supplied more than one terminal record')
        terminal = decodeTerminal(message)
      } catch (error) { fail(error) }
    })
    child.once('close', (exitCode, signal) => {
      writeVerificationToolPhase(diagnostics, 'monitor-closed', { monitorPid: child.pid, exitCode, signal })
      if (terminal === null) failures.push(monitorFailure('The tool monitor closed without a valid terminal record'))
      if (exitCode !== 0 || signal !== null) failures.push(monitorFailure(`The tool monitor exited unexpectedly (${exitCode ?? signal})`))
      if (toolPid === null && terminal?.failures.length === 0) failures.push(monitorFailure('The tool monitor closed without a valid start record'))
      const allFailures = [...(terminal?.failures ?? []), ...failures]
      const failure = allFailures.length === 0 ? null : allFailures.length === 1 ? allFailures[0]
        : new AggregateError(allFailures, 'The selected tool or its monitor failed', { cause: allFailures[0] })
      if (toolPid === null) resolveStarted({ pid: null, failure })
      resolve({
        exitCode: terminal?.exitCode ?? null,
        signal: terminal?.signal ?? null,
        failure,
      })
    })
  })
  return { child, stop, started, completed }
}
