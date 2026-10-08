import { execFileSync, spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { publishVerificationToolPhase } from './verification-tool-diagnostics.mjs'

const cleanupGraceMs = 1000
const diagnostics = process.env.WXS_VERIFICATION_TOOL_DIAGNOSTICS === '1'
const failures = []
let tool = null
let cleanup = null
let terminal = null
let resolveExit
const exited = new Promise(resolve => { resolveExit = resolve })

function cleanupFailure(message, cause) {
  return Object.assign(new Error(message, { cause }), { code: 'verification-tool-group-reclamation-failed' })
}

function liveGroupMembers(pgid, deadline) {
  const remaining = Math.ceil(deadline - performance.now())
  if (remaining <= 0) throw cleanupFailure('The selected tool group did not finish within its cleanup boundary')
  const output = execFileSync('/bin/ps', ['-eo', 'pid=,pgid=,stat='], { encoding: 'utf8', timeout: remaining })
  if (!output.trim()) throw cleanupFailure('The selected tool group inspection returned no records')
  return output.trim().split('\n').flatMap(line => {
    const fields = /^\s*(\d+)\s+(\d+)\s+(\S+)\s*$/.exec(line)
    if (!fields) throw cleanupFailure('The selected tool group inspection returned an invalid record')
    return Number(fields[2]) === pgid && !/^[ZX]/.test(fields[3]) ? [Number(fields[1])] : []
  })
}

function serializeFailure(error, seen = new Set(), depth = 0) {
  if (depth >= 4 || seen.has(error)) return {
    name: 'Error', message: 'The failure cause exceeded the monitor serialization boundary', code: 'verification-tool-monitor-failed',
  }
  seen.add(error)
  const value = { name: error.name, message: error.message }
  for (const key of ['code', 'errno', 'syscall', 'path']) {
    if (typeof error[key] === 'string' || typeof error[key] === 'number') value[key] = error[key]
  }
  if (error.cause instanceof Error) value.cause = serializeFailure(error.cause, seen, depth + 1)
  return value
}

function publishTerminal() {
  const message = {
    type: 'verification-tool-terminal', version: 1,
    exitCode: terminal?.exitCode ?? null, signal: terminal?.signal ?? null,
    failures: failures.map(error => serializeFailure(error)),
  }
  if (!process.connected) process.exit(0)
  try {
    process.send(message, error => process.exit(error ? 1 : 0))
  } catch {
    process.exit(1)
  }
}

async function reclaimTool() {
  const deadline = performance.now() + cleanupGraceMs
  if (tool?.pid) {
    try {
      if (process.platform === 'win32') tool.kill('SIGKILL')
      else process.kill(-tool.pid, 'SIGKILL')
    } catch (error) {
      if (error.code !== 'ESRCH') failures.push(cleanupFailure('The selected tool group could not be terminated', error))
    }
  }
  let exitTimer
  try {
    await Promise.race([exited, new Promise((_, reject) => {
      exitTimer = setTimeout(() => reject(cleanupFailure('The selected tool exit was not observed within its cleanup boundary')), cleanupGraceMs)
    })])
    if (tool?.pid && process.platform !== 'win32') {
      let members = liveGroupMembers(tool.pid, deadline)
      while (members.length > 0) {
        await delay(Math.min(20, Math.max(1, deadline - performance.now())))
        members = liveGroupMembers(tool.pid, deadline)
      }
    }
  } catch (error) {
    failures.push(error)
  } finally {
    clearTimeout(exitTimer)
  }
  publishVerificationToolPhase(diagnostics, failures.length === 0 ? 'group-drained' : 'group-drain-failed', { toolPid: tool?.pid })
  publishTerminal()
}

function stop() {
  cleanup ??= reclaimTool()
}

process.stdin.on('end', stop)
process.stdin.on('error', error => {
  failures.push(cleanupFailure('The selected tool lifeline failed', error))
  stop()
})
process.stdin.resume()

try {
  const env = { ...process.env }
  delete env.NODE_CHANNEL_FD
  delete env.NODE_CHANNEL_SERIALIZATION_MODE
  delete env.WXS_VERIFICATION_TOOL_DIAGNOSTICS
  tool = spawn(process.argv[2], process.argv.slice(3), {
    cwd: process.cwd(), env,
    detached: process.platform !== 'win32', stdio: ['ignore', 'inherit', 'inherit'],
  })
  tool.once('spawn', () => {
    publishVerificationToolPhase(diagnostics, 'tool-spawned', { toolPid: tool.pid, executable: process.argv[2] })
    try {
      if (!process.connected) throw cleanupFailure('The selected tool start has no owner channel')
      process.send({ type: 'verification-tool-started', version: 1, pid: tool.pid, monitorPid: process.pid }, error => {
        if (!error) return
        failures.push(error)
        stop()
      })
    } catch (error) {
      failures.push(error)
      stop()
    }
  })
  tool.once('exit', (exitCode, signal) => {
    publishVerificationToolPhase(diagnostics, 'tool-exited', { toolPid: tool.pid, exitCode, signal })
    terminal = { exitCode, signal }
    resolveExit()
    stop()
  })
  tool.once('error', error => {
    failures.push(error)
    resolveExit()
    stop()
  })
} catch (error) {
  failures.push(error)
  resolveExit()
  stop()
}
