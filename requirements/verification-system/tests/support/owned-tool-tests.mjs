import assert from 'node:assert/strict'
import { ChildProcess, execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { spawnOwnedVerificationTool } from '../../../../scripts/lib/verification-owned-tool.mjs'
import { runVerificationToolProbe } from '../../../../scripts/lib/verification-tool-probe.mjs'

function liveProcessRows() {
  return execFileSync('/bin/ps', ['-eo', 'pid=,ppid=,pgid=,stat='], { encoding: 'utf8', timeout: 1000 })
    .trim().split('\n').map(line => {
      const fields = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s*$/.exec(line)
      assert.ok(fields, `Invalid native process row: ${line}`)
      return { pid: Number(fields[1]), parentPid: Number(fields[2]), pgid: Number(fields[3]), state: fields[4] }
    }).filter(row => !/^[ZX]/.test(row.state))
}

function awaitMarker(marker) {
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
import fs from 'node:fs'
import path from 'node:path'
const marker = process.argv[1]
let settled = false
const watcher = fs.watch(path.dirname(marker), check)
const deadline = setTimeout(() => { watcher.close(); throw new Error('Actual tool did not publish its identity') }, 3000)
function check() {
  if (settled || !fs.existsSync(marker)) return
  const value = fs.readFileSync(marker, 'utf8')
  settled = true
  clearTimeout(deadline)
  watcher.close()
  process.stdout.write(value)
}
check()
`, marker], { encoding: 'utf8', timeout: 4000 }))
}

async function reclaimObservedProcesses(identities) {
  for (const identity of identities) {
    const rows = liveProcessRows()
    const current = rows.find(row => row.pid === identity.pid)
    if (current) {
      assert.equal(current.pgid, identity.pgid, 'Only the actual captured process group can be reclaimed')
      try { process.kill(-identity.pgid, 'SIGKILL') }
      catch (error) { if (error.code !== 'ESRCH') throw error }
    }
  }
  const deadline = Date.now() + 1000
  while (liveProcessRows().some(row => identities.some(identity => row.pgid === identity.pgid))) {
    if (Date.now() >= deadline) throw new Error('Captured native groups survived final cleanup')
    await delay(10)
  }
}

async function captureTool(executable, argv, options) {
  const owner = spawnOwnedVerificationTool(executable, argv, options)
  let stdout = ''
  let stderr = ''
  owner.child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
  owner.child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
  const started = await owner.started
  const outcome = await owner.completed
  return { ...outcome, started, stdout, stderr, monitorPid: owner.child.pid }
}

function registerProbeSetupFailureTest(failCleanup) {
  test(failCleanup
    ? 'WHAT[verification-system-006] probe consumer setup and native cleanup failure preserve both causes after actual owner settlement'
    : 'WHAT[verification-system-006] probe consumer setup failure settles its already running native owner before rejection', {
    skip: process.platform !== 'linux' && process.platform !== 'darwin',
  }, async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-tool-setup-'))
    const selectedMarker = path.join(directory, 'selected.json')
    const foreignMarker = path.join(directory, 'foreign.json')
    const cleanupMarker = path.join(directory, 'cleanup-error.json')
    const originalSetEncoding = Readable.prototype.setEncoding
    const originalEmit = ChildProcess.prototype.emit
    const setupError = new Error('Actual forwarded stream setup failed')
    const identities = []
    let foreign
    let foreignClosed
    let selected
    let monitor
    let monitorDrained
    let terminal
    let monitorClosed
    let forwarded = false
    try {
      const foreignDeadline = Date.now() + 3000
      foreign = spawn(process.execPath, ['--input-type=module', '-e', `
import fs from 'node:fs'
fs.watch(${JSON.stringify(directory)}, () => {})
fs.writeFileSync(${JSON.stringify(`${foreignMarker}.tmp`)}, JSON.stringify({ pid: process.pid }))
fs.renameSync(${JSON.stringify(`${foreignMarker}.tmp`)}, ${JSON.stringify(foreignMarker)})
process.send({ type: 'foreign-ready', pid: process.pid })
`], { detached: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
      foreignClosed = new Promise((resolve, reject) => {
        foreign.once('close', (code, signal) => resolve({ code, signal }))
        foreign.once('error', reject)
      })
      let foreignStderr = ''
      foreign.stderr.setEncoding('utf8').on('data', chunk => { foreignStderr += chunk })
      const foreignIdentity = await new Promise((resolve, reject) => {
        const finish = (error, identity) => {
          clearTimeout(timer)
          foreign.off('message', ready)
          foreign.off('error', failed)
          foreign.off('close', closed)
          if (error) reject(error)
          else resolve(identity)
        }
        const ready = message => {
          if (message?.type !== 'foreign-ready' || message.pid !== foreign.pid) {
            finish(new Error(`Foreign fixture supplied invalid readiness: ${JSON.stringify(message)}`))
          } else finish(null, { pid: message.pid })
        }
        const failed = error => finish(new Error(`Foreign fixture could not start: ${foreignStderr}`, { cause: error }))
        const closed = (code, signal) => finish(new Error(`Foreign fixture exited before readiness (${code ?? signal}): ${foreignStderr}`))
        const timer = setTimeout(() => finish(new Error(`Foreign fixture ${foreign.pid} did not report readiness within 3000ms: ${foreignStderr}`)), Math.max(0, foreignDeadline - Date.now()))
        foreign.once('message', ready)
        foreign.once('error', failed)
        foreign.once('close', closed)
      })
      assert.equal(foreignIdentity.pid, foreign.pid)
      assert.deepEqual(JSON.parse(fs.readFileSync(foreignMarker, 'utf8')), foreignIdentity, 'The original foreign child published its marker before readiness')
      const foreignRow = liveProcessRows().find(row => row.pid === foreign.pid)
      assert.ok(foreignRow)
      assert.equal(foreignRow.pgid, foreign.pid)
      identities.push(foreignRow)

      ChildProcess.prototype.emit = function (event, ...args) {
        if (event === 'spawn' && this.spawnargs[1] === fileURLToPath(new URL('../../../../scripts/lib/verification-tool-monitor.mjs', import.meta.url))) {
          monitor = this
          monitorDrained = new Promise(resolve => this.once('close', resolve))
        }
        if (this.pid === selected?.monitorPid) {
          if (event === 'message' && args[0]?.type === 'verification-tool-terminal') terminal = args[0]
          if (event === 'close') monitorClosed = { code: args[0], signal: args[1] }
        }
        return Reflect.apply(originalEmit, this, [event, ...args])
      }
      Readable.prototype.setEncoding = function (...args) {
        Reflect.apply(originalSetEncoding, this, args)
        Readable.prototype.setEncoding = originalSetEncoding
        forwarded = true
        selected = awaitMarker(selectedMarker)
        const rows = liveProcessRows()
        const tool = rows.find(row => row.pid === selected.pid && row.parentPid === selected.monitorPid)
        const monitorRow = rows.find(row => row.pid === selected.monitorPid && row.parentPid === process.pid)
        assert.ok(tool, 'The selected tool is actually running before setup throws')
        assert.ok(monitorRow, 'Its actual creation owner monitor is running before setup throws')
        assert.equal(tool.pgid, tool.pid)
        assert.equal(monitorRow.pgid, monitorRow.pid)
        assert.notEqual(tool.pgid, foreignRow.pgid)
        assert.notEqual(monitorRow.pgid, foreignRow.pgid)
        identities.push(tool, monitorRow)
        throw setupError
      }
      const program = `import fs from 'node:fs'
fs.watch(${JSON.stringify(directory)}, () => {})
fs.writeFileSync(${JSON.stringify(`${selectedMarker}.tmp`)}, JSON.stringify({ pid: process.pid, monitorPid: process.ppid }))
fs.renameSync(${JSON.stringify(`${selectedMarker}.tmp`)}, ${JSON.stringify(selectedMarker)})
`
      const env = { ...process.env }
      if (failCleanup) {
        const preload = path.join(directory, 'native-cleanup-failure.mjs')
        fs.writeFileSync(preload, `import fs from 'node:fs'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
const nativeExec = childProcess.execFileSync
childProcess.execFileSync = function (executable, argv, options) {
  if (executable !== '/bin/ps' || argv.join(' ') !== '-eo pid=,pgid=,stat=') return Reflect.apply(nativeExec, this, [executable, argv, options])
  try {
    return Reflect.apply(nativeExec, this, [executable, ['-eo', 'invalid_setup_cleanup_column='], options])
  } catch (error) {
    fs.writeFileSync(${JSON.stringify(cleanupMarker)}, JSON.stringify({ name: error.name, message: error.message, pid: error.pid, status: error.status }))
    throw error
  }
}
syncBuiltinESMExports()
`)
        env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ''} --import=${preload}`.trim()
      }
      let rejected
      try {
        await runVerificationToolProbe(process.execPath, ['--input-type=module', '-e', program], { cwd: directory, env })
      } catch (error) {
        rejected = error
      }
      assert.equal(forwarded, true)
      let terminalFailures = []
      if (failCleanup) {
        const nativeFailure = JSON.parse(fs.readFileSync(cleanupMarker, 'utf8'))
        assert.ok(nativeFailure.pid > 0, 'Cleanup reached an actual native ps process')
        assert.equal(nativeFailure.status, 1)
        assert.match(nativeFailure.message, /invalid_setup_cleanup_column/)
        assert.ok(rejected instanceof AggregateError)
        assert.equal(rejected.cause, setupError)
        assert.equal(rejected.errors.length, 2)
        assert.equal(rejected.errors[0], setupError)
        assert.notEqual(rejected.errors[1], setupError)
        assert.equal(rejected.errors[1].name, nativeFailure.name)
        assert.equal(rejected.errors[1].message, nativeFailure.message)
        terminalFailures = [{ name: nativeFailure.name, message: nativeFailure.message }]
      } else {
        assert.equal(rejected, setupError, 'The original synchronous setup Error remains the public rejection')
      }
      const rows = liveProcessRows()
      assert.ok(rows.some(row => row.pid === foreign.pid && row.pgid === foreignRow.pgid), 'The unrelated caller-owned process remains alive')
      const groups = identities.filter(identity => identity.pid !== foreign.pid).map(identity => identity.pgid)
      assert.deepEqual(rows.filter(row => groups.includes(row.pgid)), [], 'Owned tool and monitor groups must already be empty at rejection')
      assert.deepEqual(terminal, { type: 'verification-tool-terminal', version: 1, exitCode: null, signal: 'SIGKILL', failures: terminalFailures })
      assert.deepEqual(monitorClosed, { code: 0, signal: null })
    } finally {
      Readable.prototype.setEncoding = originalSetEncoding
      ChildProcess.prototype.emit = originalEmit
      if (monitor && monitor.exitCode === null && monitor.signalCode === null) monitor.stdin.destroy()
      if (foreign && foreign.exitCode === null && foreign.signalCode === null && !identities.some(identity => identity.pid === foreign.pid)) foreign.kill('SIGKILL')
      await reclaimObservedProcesses(identities)
      if (monitorDrained) await monitorDrained
      if (foreignClosed) await foreignClosed
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
}

export function registerOwnedToolTests() {
  for (const failCleanup of [false, true]) registerProbeSetupFailureTest(failCleanup)
  test('WHAT[verification-system-006] owned tool monitoring preserves actual terminals and rejects missing control evidence', {
    skip: process.platform !== 'linux' && process.platform !== 'darwin',
  }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-tool-protocol-'))
    const env = { HOME: directory, PATH: '', SELECTED_TOOL_PROOF: 'original selected environment', LANG: 'C', LC_ALL: 'C' }
    if (process.platform === 'darwin') env.__CF_USER_TEXT_ENCODING = `0x${process.getuid().toString(16)}:0x0:0x0`
    try {
      await t.test('WHAT[verification-system-006] empty PATH preserves exact selected environment and actual independent process group', async () => {
        const outcome = await captureTool(process.execPath, ['--input-type=module', '-e', `
import { execFileSync } from 'node:child_process'
console.log(JSON.stringify({ env: process.env, pid: process.pid, pgid: Number(execFileSync('/bin/ps', ['-o', 'pgid=', '-p', String(process.pid)], { encoding: 'utf8' })), ipc: typeof process.send }))
process.stderr.write('actual selected stderr\\n')
`], { cwd: directory, env })
        assert.equal(outcome.failure, null)
        assert.equal(outcome.exitCode, 0)
        assert.equal(outcome.signal, null)
        const selected = JSON.parse(outcome.stdout)
        assert.deepEqual(outcome.started, { pid: selected.pid, failure: null })
        assert.deepEqual(selected.env, env)
        assert.equal(selected.ipc, 'undefined')
        assert.equal(selected.pgid, selected.pid)
        assert.notEqual(selected.pid, outcome.monitorPid)
        assert.equal(outcome.stderr, 'actual selected stderr\n')
      })

      await t.test('WHAT[verification-system-006] a selected nonzero exit is preserved instead of the monitor exit', async () => {
        const outcome = await captureTool(process.execPath, ['-e', "process.stdout.write('selected result\\n'); process.exitCode = 23"], { cwd: directory, env })
        assert.equal(outcome.failure, null)
        assert.equal(outcome.exitCode, 23)
        assert.equal(outcome.signal, null)
        assert.equal(outcome.stdout, 'selected result\n')
        assert.equal(outcome.stderr, '')
      })

      await t.test('WHAT[verification-system-006] a selected process signal is preserved instead of the monitor exit', async () => {
        const outcome = await captureTool(process.execPath, ['-e', "process.kill(process.pid, 'SIGTERM')"], { cwd: directory, env })
        assert.equal(outcome.failure, null)
        assert.equal(outcome.exitCode, null)
        assert.equal(outcome.signal, 'SIGTERM')
      })

      await t.test('WHAT[verification-system-006] a real selected executable spawn failure retains its OS cause', async () => {
        const executable = path.join(directory, 'absent-selected-tool')
        const outcome = await captureTool(executable, [], { cwd: directory, env })
        assert.equal(outcome.exitCode, null)
        assert.equal(outcome.signal, null)
        assert.ok(outcome.failure instanceof Error)
        assert.equal(outcome.failure.code, 'ENOENT')
        assert.equal(outcome.failure.path, executable)
        assert.match(outcome.failure.syscall, /spawn/)
        assert.equal(outcome.started.pid, null)
        assert.equal(outcome.started.failure, outcome.failure)
      })

      for (const kind of ['missing', 'malformed', 'duplicate']) {
        await t.test(`WHAT[verification-system-006] ${kind} monitor terminal before selected spawn rejects acceptance`, async () => {
          const preload = path.join(directory, `${kind}-preload.mjs`)
          const monitorMarker = path.join(directory, `${kind}-monitor-started`)
          const selectedMarker = path.join(directory, `${kind}-selected-started`)
          const terminal = { type: 'verification-tool-terminal', version: 1, exitCode: 0, signal: null, failures: [] }
          const messages = kind === 'missing' ? [] : kind === 'malformed' ? [{ type: 'invalid-terminal' }] : [terminal, terminal]
          fs.writeFileSync(preload, `import fs from 'node:fs'
fs.writeFileSync(${JSON.stringify(monitorMarker)}, 'actual Node bootstrap executed')
for (const message of ${JSON.stringify(messages)}) {
  await new Promise((resolve, reject) => process.send(message, error => error ? reject(error) : resolve()))
}
process.exit(0)
`)
          const outcome = await captureTool(process.execPath, ['-e', `require('node:fs').writeFileSync(${JSON.stringify(selectedMarker)}, 'selected tool ran')`], {
            cwd: directory, env: { ...env, NODE_OPTIONS: `--import=${preload}` },
          })
          assert.equal(fs.readFileSync(monitorMarker, 'utf8'), 'actual Node bootstrap executed')
          assert.equal(fs.existsSync(selectedMarker), false, 'This protocol rejection precedes selected spawn; it does not prove recovery from a running monitor crash')
          assert.ok(outcome.failure instanceof Error)
          assert.match(outcome.failure.message, /terminal record|tool or its monitor failed/)
        })
      }
      for (const kind of ['missing', 'malformed', 'duplicate']) {
        await t.test(`WHAT[verification-system-006] ${kind} actual tool start evidence rejects acceptance and drains its group`, async () => {
          const preload = path.join(directory, `${kind}-start-preload.mjs`)
          const selectedMarker = path.join(directory, `${kind}-actual-tool.json`)
          fs.writeFileSync(preload, `import fs from 'node:fs'
import { ChildProcess, execFileSync } from 'node:child_process'
if (typeof process.send === 'function' && process.argv[1]?.endsWith('verification-tool-monitor.mjs')) {
  const emit = ChildProcess.prototype.emit
  ChildProcess.prototype.emit = function (event, ...args) {
    if (event === 'spawn') {
      ChildProcess.prototype.emit = emit
      fs.writeFileSync(${JSON.stringify(selectedMarker)}, JSON.stringify({ pid: this.pid,
        pgid: Number(execFileSync('/bin/ps', ['-o', 'pgid=', '-p', String(this.pid)], { encoding: 'utf8' })) }))
    }
    return Reflect.apply(emit, this, [event, ...args])
  }
  const send = process.send.bind(process)
  process.send = (message, callback) => {
    if (message.type !== 'verification-tool-started') return send(message, callback)
    if (${JSON.stringify(kind)} === 'missing') { callback?.(null); return true }
    if (${JSON.stringify(kind)} === 'malformed') return send({ ...message, pid: message.monitorPid }, callback)
    send(message, () => {})
    return send(message, callback)
  }
}
`)
          const outcome = await captureTool(process.execPath, ['-e', 'process.stdout.write("selected tool ran")'], {
            cwd: directory, env: { ...env, NODE_OPTIONS: `--import=${preload}` },
          })
          const selected = JSON.parse(fs.readFileSync(selectedMarker, 'utf8'))
          assert.equal(selected.pgid, selected.pid, 'The actual selected process established its own group')
          assert.notEqual(selected.pid, outcome.monitorPid)
          assert.ok(outcome.failure instanceof Error)
          assert.match(outcome.failure.message, /start record|tool or its monitor failed/)
          if (kind === 'duplicate') assert.deepEqual(outcome.started, { pid: selected.pid, failure: null })
          else assert.deepEqual(outcome.started, { pid: null, failure: outcome.failure })
          assert.deepEqual(liveProcessRows().filter(row => row.pgid === selected.pgid || row.pgid === outcome.monitorPid), [],
            'Both owned groups must drain before the invalid protocol outcome is returned')
        })
      }
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
}
