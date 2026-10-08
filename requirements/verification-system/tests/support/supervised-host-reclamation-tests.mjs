import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { integrationTest } from './tier-gate.mjs'
import { PROCESS_TREE_TIMEOUT_MS, SIGKILL_GRACE_MS } from '../e2e/support/time-budget.js'

function processRows() {
  return execFileSync('/bin/ps', ['-eo', 'pid=,ppid=,pgid=,stat='], {
    encoding: 'utf8', timeout: PROCESS_TREE_TIMEOUT_MS,
  }).trim().split('\n').map(line => {
    const fields = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s*$/.exec(line)
    if (!fields) throw new Error(`Invalid actual process record: ${line}`)
    return { pid: Number(fields[1]), parentPid: Number(fields[2]), pgid: Number(fields[3]), state: fields[4] }
  }).filter(row => !/^[ZX]/.test(row.state))
}

async function reclaimCapturedGroup(identity) {
  const leader = processRows().find(row => row.pid === identity.pid)
  if (!leader) {
    assert.deepEqual(processRows().filter(row => row.pgid === identity.pgid), [], 'A missing leader does not excuse a remaining group')
    return
  }
  assert.equal(leader.pgid, identity.pgid, 'Only the exact captured group can be reclaimed')
  try { process.kill(-identity.pgid, 'SIGKILL') }
  catch (error) { if (error.code !== 'ESRCH') throw error }
  const deadline = Date.now() + SIGKILL_GRACE_MS
  while (processRows().some(row => row.pgid === identity.pgid)) {
    if (Date.now() >= deadline) throw new Error(`Captured fixture group ${identity.pgid} survived cleanup`)
    await delay(10)
  }
}

export function registerSupervisedHostReclamationTests() {
  integrationTest('WHAT[verification-system-006] invalid lifecycle termination drains the actual detached installed Host before rejection and preserves a foreign group', {
    skip: !['linux', 'darwin'].includes(process.platform),
  }, async () => {
    const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'supervised-host-reclamation-')))
    const scenarioDir = path.join(directory, 'scenario')
    const ownershipPath = path.join(directory, 'host-ownership.json')
    const caughtPath = path.join(directory, 'caught.json')
    const innerPath = path.join(directory, 'inner.mjs')
    const launcherPath = path.join(directory, 'launcher.mjs')
    const plannedPath = path.join(directory, 'held.fixture.mjs')
    let launcher
    let launcherDrained
    let foreign
    let foreignDrained
    let failure
    const cleanupErrors = []
    try {
      const foreignReady = new Promise((resolve, reject) => {
        foreign = spawn(process.execPath, ['--input-type=module', '-e', `
import fs from 'node:fs'
fs.watch(${JSON.stringify(directory)}, () => {})
process.send({ type: 'foreign-ready', pid: process.pid })
`], { detached: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
        foreignDrained = Promise.allSettled([new Promise((done, failed) => {
          foreign.once('close', (code, signal) => done({ code, signal }))
          foreign.once('error', failed)
        })])
        foreign.stderr.resume()
        const timer = setTimeout(() => reject(new Error('Foreign fixture did not report readiness')), PROCESS_TREE_TIMEOUT_MS)
        foreign.once('error', error => { clearTimeout(timer); reject(error) })
        foreign.once('message', message => {
          clearTimeout(timer)
          if (message?.type !== 'foreign-ready' || message.pid !== foreign.pid) reject(new Error('Invalid foreign readiness'))
          else resolve(message)
        })
      })
      await foreignReady
      assert.equal(processRows().find(row => row.pid === foreign.pid)?.pgid, foreign.pid)
      fs.mkdirSync(scenarioDir)
      fs.writeFileSync(plannedPath, '')
      const hostUrl = new URL('../e2e/support/process-host.js', import.meta.url).href
      const utilsUrl = new URL('../e2e/support/process-host-utils.js', import.meta.url).href
      fs.writeFileSync(innerPath, `import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { ProcessHost } from ${JSON.stringify(hostUrl)}
import { initGitWorkspace } from ${JSON.stringify(utilsUrl)}
const PROCESS_TREE_TIMEOUT_MS = ${PROCESS_TREE_TIMEOUT_MS}
${processRows.toString()}
const host = new ProcessHost()
try {
  fs.mkdirSync(${JSON.stringify(path.join(scenarioDir, 'workspace'))}, { recursive: true })
  await initGitWorkspace(${JSON.stringify(path.join(scenarioDir, 'workspace'))})
  await host.start({ scenarioDir: ${JSON.stringify(scenarioDir)}, providerUrl: 'http://127.0.0.1:1/v1', pluginPaths: [] })
  const original = processRows().find(row => row.pid === host.pid)
  if (!original || original.pgid !== host.pid) throw new Error('The actual Host spawn did not establish its owned detached group')
  fs.writeFileSync(${JSON.stringify(ownershipPath)}, JSON.stringify({ ...original, innerPid: process.pid, root: ${JSON.stringify(scenarioDir)}, workDir: host.workDir, port: host.port, healthy: true }))
  const entryFile = process.argv[2]
  await new Promise((resolve, reject) => process.send({ type: 'runner:file-start', data: { entryFile } }, error => error ? reject(error) : resolve()))
  await new Promise((resolve, reject) => process.send({ type: 'runner:file-start', data: { entryFile } }, error => error ? reject(error) : resolve()))
  await new Promise(() => {})
} finally {
  await host.stop()
}
`)
      const supervisorUrl = new URL('../e2e/support/supervise-node-test.mjs', import.meta.url).href
      fs.writeFileSync(launcherPath, `import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import net from 'node:net'
import { superviseNodeTest } from ${JSON.stringify(supervisorUrl)}
const PROCESS_TREE_TIMEOUT_MS = ${PROCESS_TREE_TIMEOUT_MS}
${processRows.toString()}
try {
  await superviseNodeTest({ files: [${JSON.stringify(plannedPath)}], inner: ${JSON.stringify(innerPath)}, label: 'installed-host-reclamation', silenceMs: ${30000}, throwOnFailure: true })
  throw new Error('Invalid lifecycle unexpectedly passed')
} catch (error) {
  const identity = JSON.parse(fs.readFileSync(${JSON.stringify(ownershipPath)}, 'utf8'))
  const rows = processRows()
  const listening = await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: identity.port })
    socket.setTimeout(PROCESS_TREE_TIMEOUT_MS, () => { socket.destroy(); reject(new Error('Host port observation did not complete')) })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', cause => { socket.destroy(); cause.code === 'ECONNREFUSED' ? resolve(false) : reject(cause) })
  })
  fs.writeFileSync(${JSON.stringify(caughtPath)}, JSON.stringify({ message: error.message, identity, hostMembers: rows.filter(row => row.pgid === identity.pgid), listening, foreignMembers: rows.filter(row => row.pgid === ${foreign.pid}) }))
  console.error(error.message)
  process.exitCode = 1
}
`)
      const env = { ...process.env, TMPDIR: directory }
      delete env.NODE_TEST_CONTEXT
      launcher = spawn(process.execPath, [launcherPath], { env, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      launcher.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
      launcher.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
      launcherDrained = Promise.allSettled([new Promise((resolve, reject) => {
        launcher.once('close', (code, signal) => resolve({ code, signal }))
        launcher.once('error', reject)
      })])
      const [outcome] = await launcherDrained
      assert.equal(outcome.status, 'fulfilled', stdout + stderr)
      assert.deepEqual(outcome.value, { code: 1, signal: null }, stdout + stderr)
      assert.match(stderr, /invalid file lifecycle: .*runner:file-start.*active/)
      assert.doesNotMatch(stderr, /silent for|physical backstop/)
      const caught = JSON.parse(fs.readFileSync(caughtPath, 'utf8'))
      assert.equal(caught.identity.healthy, true, 'The real installed Host completed its health barrier before termination was requested')
      assert.equal(caught.identity.pid, caught.identity.pgid)
      assert.ok(caught.foreignMembers.some(row => row.pid === foreign.pid), 'The independent caller-owned group remains alive at rejection')
      assert.deepEqual(caught.hostMembers, [], 'The exact detached Host group must already be empty at caller rejection')
      assert.equal(caught.listening, false, 'The real Host listening port must be closed at caller rejection')
      assert.match(caught.message, /supervised suite failed/)
    } catch (error) {
      failure = { error }
    } finally {
      if (launcher && launcher.exitCode === null && launcher.signalCode === null) {
        try { launcher.kill('SIGKILL') } catch (error) { cleanupErrors.push(error) }
      }
      if (launcherDrained) await launcherDrained
      if (fs.existsSync(ownershipPath)) {
        try { await reclaimCapturedGroup(JSON.parse(fs.readFileSync(ownershipPath, 'utf8'))) }
        catch (error) { cleanupErrors.push(error) }
      }
      if (foreign?.pid) {
        try { await reclaimCapturedGroup({ pid: foreign.pid, pgid: foreign.pid }) }
        catch (error) { cleanupErrors.push(error) }
      }
      if (foreignDrained) await foreignDrained
      if (cleanupErrors.length === 0) fs.rmSync(directory, { recursive: true, force: true })
    }
    if (cleanupErrors.length > 0) throw new AggregateError([...(failure ? [failure.error] : []), ...cleanupErrors], `Host regression or exact fixture cleanup failed; evidence retained: ${directory}`, { cause: failure?.error })
    if (failure) throw failure.error
  })
}
