import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { PROCESS_TREE_TIMEOUT_MS, SIGKILL_GRACE_MS } from '../e2e/support/time-budget.js'

function processRows() {
  const output = execFileSync('ps', ['-eo', 'pid=,pgid=,stat='], {
    encoding: 'utf8', timeout: PROCESS_TREE_TIMEOUT_MS,
  })
  return output.trim().split('\n').map(line => {
    const fields = /^\s*(\d+)\s+(\d+)\s+(\S+)\s*$/.exec(line)
    if (!fields) throw new Error(`Invalid actual process record: ${line}`)
    return { pid: Number(fields[1]), pgid: Number(fields[2]), state: fields[3] }
  })
}

async function reclaimCapturedGroup(identity) {
  const rows = processRows()
  const leader = rows.find(row => row.pid === identity.pid)
  if (leader && leader.pgid !== identity.pgid) throw new Error('Captured leader PID no longer belongs to its captured group')
  const descendant = rows.find(row => row.pid === identity.childPid)
  if (descendant && descendant.pgid !== identity.pgid) throw new Error('Captured descendant no longer belongs to its captured group')
  if (!leader && !descendant) return
  try {
    process.kill(-identity.pgid, 'SIGKILL')
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
  const deadline = Date.now() + SIGKILL_GRACE_MS
  while (processRows().some(row => row.pgid === identity.pgid && !/^[ZX]/.test(row.state))) {
    if (Date.now() >= deadline) throw new Error('Captured process group survived its cleanup deadline')
    await delay(20)
  }
}

export function registerSupervisedToolReclamationTests() {
  const scenarios = [
    { phase: null, title: 'silence termination reclaims an actual detached tool and its descendant while preserving the caller\'s foreign group' },
    { phase: 'initial-capture', title: 'native initial inspection failure preserves its cause and drains actual frozen descendants before rejection' },
    { phase: 'initial-capture', captureFailure: 'inspection', title: 'native initial and frozen inspection failures preserve both causes without claiming complete inventory' },
    { phase: 'initial-capture', captureFailure: 'missing-root', title: 'native incomplete snapshot cannot certify a missing root as fully captured' },
    { phase: 'freeze-confirmation', title: 'native freeze inspection failure preserves its original cause and drains known owned resources while retaining a foreign group' },
    { phase: 'descendant-drain', title: 'native drain inspection failure preserves its original cause and drains captured owned resources while retaining a foreign group' },
    { phase: 'freeze-confirmation', cleanupFailure: true, title: 'native double inspection failure preserves both original causes and reports incomplete owned cleanup' },
  ]
  for (const scenario of scenarios) registerReclamationTest(scenario)
}

function registerReclamationTest(scenario) {
  test(`WHAT[verification-system-006] ${scenario.title}`, {
    skip: !['linux', 'darwin'].includes(process.platform),
  }, async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'supervised-tool-reclamation-'))
    const ownershipPath = path.join(directory, 'tool-ownership.json')
    const foreignOwnershipPath = path.join(directory, 'foreign-ownership.json')
    const caughtPath = path.join(directory, 'caught.json')
    const cleanupPath = path.join(directory, 'foreign-cleanup.json')
    const toolPath = path.join(directory, 'held-tool.mjs')
    const foreignPath = path.join(directory, 'foreign.mjs')
    const heldPath = path.join(directory, 'held.fixture.mjs')
    const launcherPath = path.join(directory, 'supervise.mjs')
    let launcher
    let launcherDrained
    let failure
    const cleanupErrors = []
    try {
      fs.writeFileSync(toolPath, `import fs from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
const child = spawn(process.execPath, ['-e', ${JSON.stringify(`require('node:fs').watch(${JSON.stringify(directory)}, () => {}); process.stdout.write('ready\\n')`)}], { stdio: ['ignore', 'pipe', 'inherit'] })
child.stdout.once('data', () => {
  const pgid = Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(process.pid)], { encoding: 'utf8' }).trim())
  const childPgid = Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(child.pid)], { encoding: 'utf8' }).trim())
  const monitorPgid = Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(process.ppid)], { encoding: 'utf8' }).trim())
  const identity = { pid: process.pid, pgid, childPid: child.pid, childPgid, monitorPid: process.ppid, monitorPgid }
  fs.writeFileSync(${JSON.stringify(`${ownershipPath}.tmp`)}, JSON.stringify(identity))
  fs.renameSync(${JSON.stringify(`${ownershipPath}.tmp`)}, ${JSON.stringify(ownershipPath)})
})
`)
      fs.writeFileSync(foreignPath, `import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
fs.watch(${JSON.stringify(directory)}, () => {})
const pgid = Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(process.pid)], { encoding: 'utf8' }).trim())
const identity = { pid: process.pid, pgid }
fs.writeFileSync(${JSON.stringify(foreignOwnershipPath)}, JSON.stringify(identity))
process.stdout.write(JSON.stringify(identity) + '\\n')
`)
      const probeUrl = new URL('../../../../scripts/lib/verification-tool-probe.mjs', import.meta.url).href
      fs.writeFileSync(heldPath, `import fs from 'node:fs'
import test from 'node:test'
import { runVerificationToolProbe } from ${JSON.stringify(probeUrl)}
test('actual detached selected tool remains unfinished', async () => {
  fs.writeFileSync(${JSON.stringify(path.join(directory, 'suite.json'))}, JSON.stringify({ innerPid: process.ppid, home: process.env.HOME }))
  await runVerificationToolProbe(process.execPath, [${JSON.stringify(toolPath)}], { cwd: ${JSON.stringify(directory)}, env: process.env })
})
`)
      const supervisorUrl = new URL('../e2e/support/supervise-node-test.mjs', import.meta.url).href
      fs.writeFileSync(launcherPath, `import fs from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { superviseNodeTest } from ${JSON.stringify(supervisorUrl)}
${processRows.toString()}
const PROCESS_TREE_TIMEOUT_MS = ${PROCESS_TREE_TIMEOUT_MS}
const failingPhase = ${JSON.stringify(scenario.phase)}
const failCleanupInspection = ${scenario.cleanupFailure === true}
const captureFailure = ${JSON.stringify(scenario.captureFailure ?? null)}
const inspections = []
let inspectionFailure
let cleanupInspectionFailure
let heldMonitor
function parseRows(output) {
  return output.trim().split('\\n').map(line => {
    const fields = /^\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\S+)\\s*$/.exec(line)
    if (!fields) throw new Error('Invalid actual process record during the inspection fixture')
    return { pid: Number(fields[1]), parent: Number(fields[2]), pgid: Number(fields[3]), state: fields[4] }
  })
}
function inspectProcessTree({ phase, timeout }) {
  const inspectionDeadline = Date.now() + timeout
  if (phase === failingPhase && phase !== 'initial-capture' && !inspectionFailure) {
    try {
      return execFileSync('/bin/ps', ['-eo', 'invalid_verification_column='], { encoding: 'utf8', timeout })
    } catch (error) {
      inspectionFailure = error
      inspections.push({ phase, failed: true, status: error.status, pid: error.pid })
      throw error
    }
  }
  if ((phase === 'failure-drain' && failCleanupInspection || phase === 'freeze-confirmation' && captureFailure === 'inspection') && !cleanupInspectionFailure) {
    try {
      return execFileSync('/bin/ps', ['-eo', 'invalid_cleanup_column='], { encoding: 'utf8', timeout })
    } catch (error) {
      cleanupInspectionFailure = error
      inspections.push({ phase, failed: true, status: error.status, pid: error.pid })
      throw error
    }
  }
  const output = execFileSync('/bin/ps', ['-eo', 'pid=,ppid=,pgid=,stat='], { encoding: 'utf8', timeout })
  const tool = JSON.parse(fs.readFileSync(${JSON.stringify(ownershipPath)}, 'utf8'))
  const rows = parseRows(output)
  const observation = { phase, failed: false, rows: rows.filter(row => [tool.pid, tool.childPid, tool.monitorPid].includes(row.pid)) }
  if (phase === 'initial-capture' || phase === 'freeze-confirmation' && failingPhase === 'initial-capture') {
    const suite = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(directory, 'suite.json'))}, 'utf8'))
    const monitor = rows.find(row => row.pid === tool.monitorPid && row.pgid === tool.monitorPgid)
    const ownedTool = rows.find(row => row.pid === tool.pid && row.parent === tool.monitorPid && row.pgid === tool.pgid)
    if (!monitor || !ownedTool) throw new Error('Cannot hold a monitor without its current owned tool lineage')
    const lineage = []
    let ancestor = monitor
    while (ancestor && !lineage.includes(ancestor.pid)) {
      lineage.push(ancestor.pid)
      if (ancestor.pid === suite.innerPid) break
      ancestor = rows.find(row => row.pid === ancestor.parent)
    }
    if (lineage.at(-1) !== suite.innerPid) throw new Error('The monitor is not descended from the actual owned inner runner')
    observation.rootRows = rows.filter(row => row.pgid === suite.innerPid && !/^[ZX]/.test(row.state))
    observation.lineage = lineage
    if (phase === 'freeze-confirmation' && captureFailure === 'missing-root') {
      if (observation.rootRows.length === 0 || !observation.rootRows.every(row => /^[Tt]/.test(row.state))) {
        throw new Error('The full native positive control did not observe the actual root frozen')
      }
      const remaining = inspectionDeadline - Date.now()
      if (remaining <= 0) throw new Error('The incomplete native query exhausted the original observation timeout')
      const partial = execFileSync('/bin/ps', ['-p', [tool.pid, tool.childPid, tool.monitorPid].join(','), '-o', 'pid=,ppid=,pgid=,stat='], { encoding: 'utf8', timeout: remaining })
      observation.deliveredRows = parseRows(partial)
      observation.incompleteSnapshot = true
      inspections.push(observation)
      return partial
    }
    if (phase === 'initial-capture') {
      process.kill(monitor.pid, 'SIGSTOP')
      heldMonitor = { pid: monitor.pid, pgid: monitor.pgid, innerPid: suite.innerPid, lineage }
      if (failingPhase === 'initial-capture') {
        inspections.push({ ...observation, deliveredToSupervisor: false })
        const remaining = inspectionDeadline - Date.now()
        if (remaining <= 0) throw new Error('The initial native fault exhausted the original observation timeout')
        try {
          return execFileSync('/bin/ps', ['-eo', 'invalid_initial_capture_column='], { encoding: 'utf8', timeout: remaining })
        } catch (error) {
          inspectionFailure = error
          inspections.push({ phase, failed: true, status: error.status, pid: error.pid })
          throw error
        }
      }
    }
  }
  if (phase === 'failure-drain' && heldMonitor) {
    const monitor = rows.find(row => row.pid === heldMonitor.pid && row.pgid === heldMonitor.pgid)
    if (!monitor || !/^[Tt]/.test(monitor.state)) throw new Error('The owned monitor was not observed paused at recovery admission')
    observation.resumedMonitor = { ...monitor }
    process.kill(monitor.pid, 'SIGCONT')
    heldMonitor = null
  }
  inspections.push(observation)
  return output
}
function containsFailure(error, target, seen = new Set()) {
  if (error === target) return true
  if (!error || seen.has(error)) return false
  seen.add(error)
  return containsFailure(error.cause, target, seen) ||
    error instanceof AggregateError && error.errors.some(value => containsFailure(value, target, seen))
}
function failureRecords(error, seen = new Set()) {
  if (!error || typeof error !== 'object' || seen.has(error)) return []
  seen.add(error)
  return [{ message: error.message, code: error.code, syscall: error.syscall },
    ...failureRecords(error.cause, seen),
    ...(error instanceof AggregateError ? error.errors.flatMap(value => failureRecords(value, seen)) : [])]
}
const foreign = spawn(process.execPath, [${JSON.stringify(foreignPath)}], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
const foreignDrained = new Promise((resolve, reject) => {
  foreign.once('error', reject)
  foreign.once('close', (code, signal) => resolve({ code, signal }))
})
const foreignSettled = Promise.allSettled([foreignDrained])
let originalFailure
const cleanupErrors = []
try {
  const identity = await new Promise((resolve, reject) => {
    let output = ''
    foreign.stdout.setEncoding('utf8').on('data', chunk => {
      output += chunk
      if (!output.endsWith('\\n')) return
      try {
        resolve(JSON.parse(output))
      } catch (error) {
        reject(error)
      }
    })
    foreign.once('error', reject)
    foreign.once('close', () => reject(new Error('Foreign group exited before its ready observation')))
    foreign.stderr.resume()
  })
  try {
    await superviseNodeTest({ files: [${JSON.stringify(heldPath)}], label: 'detached-tool-reclamation', silenceMs: 1000, throwOnFailure: true,
      ...(failingPhase === null ? {} : { inspectProcessTree }),
    })
    throw new Error('Held tool unexpectedly completed')
  } catch (error) {
    originalFailure = { error }
    const tool = JSON.parse(fs.readFileSync(${JSON.stringify(ownershipPath)}, 'utf8'))
    const suite = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(directory, 'suite.json'))}, 'utf8'))
    const rows = processRows()
    fs.writeFileSync(${JSON.stringify(caughtPath)}, JSON.stringify({
      failure: { name: error?.name, message: error?.message },
      failureRecords: failureRecords(error),
      nativeFailures: [inspectionFailure, cleanupInspectionFailure].filter(Boolean).map(error => ({
        message: error.message, code: error.code, syscall: error.syscall, status: error.status,
      })),
      inspections,
      nativeErrorPreserved: inspectionFailure ? containsFailure(error, inspectionFailure) : null,
      nativeCleanupErrorPreserved: cleanupInspectionFailure ? containsFailure(error, cleanupInspectionFailure) : null,
      nativeErrorsDistinct: cleanupInspectionFailure ? inspectionFailure !== cleanupInspectionFailure : null,
      tool, foreign: identity,
      toolMembers: rows.filter(row => row.pgid === tool.pgid && !/^[ZX]/.test(row.state)),
      monitorMembers: rows.filter(row => row.pgid === tool.monitorPgid && !/^[ZX]/.test(row.state)),
      foreignMembers: rows.filter(row => row.pgid === identity.pgid && !/^[ZX]/.test(row.state)),
      homeExists: fs.existsSync(suite.home),
    }))
  }
} catch (error) {
  if (originalFailure) cleanupErrors.push(error)
  else originalFailure = { error }
} finally {
  try {
    if (foreign.pid) process.kill(-foreign.pid, 'SIGKILL')
  } catch (error) {
    if (error.code !== 'ESRCH') cleanupErrors.push(error)
  }
  const [outcome] = await foreignSettled
  if (outcome.status === 'rejected') cleanupErrors.push(outcome.reason)
  try {
    fs.writeFileSync(${JSON.stringify(cleanupPath)}, JSON.stringify({ pid: foreign.pid, live: processRows().filter(row => row.pgid === foreign.pid && !/^[ZX]/.test(row.state)) }))
  } catch (error) {
    cleanupErrors.push(error)
  }
}
if (cleanupErrors.length > 0) {
  throw new AggregateError([...(originalFailure ? [originalFailure.error] : []), ...cleanupErrors], 'Supervisor observation or foreign cleanup failed', { cause: originalFailure?.error })
}
if (originalFailure) {
  console.error(originalFailure.error.message)
  process.exitCode = 1
}
`)
      const env = { ...process.env, NODE_TEST_CONCURRENCY: '1', TMPDIR: directory }
      delete env.NODE_TEST_CONTEXT
      launcher = spawn(process.execPath, [launcherPath], { env, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      launcher.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
      launcher.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
      launcherDrained = Promise.allSettled([new Promise((resolve, reject) => {
        launcher.once('error', reject)
        launcher.once('close', (code, signal) => resolve({ code, signal }))
      })])
      const [outcome] = await launcherDrained
      const output = stdout + stderr
      assert.equal(outcome.status, 'fulfilled')
      assert.deepEqual(outcome.value, { code: 1, signal: null }, output)
      assert.match(output, /WATCHDOG: 'detached-tool-reclamation' silent for/)
      assert.ok(fs.existsSync(caughtPath), `The caller did not record its caught failure\n${output}`)
      const caught = JSON.parse(fs.readFileSync(caughtPath, 'utf8'))
      assert.match(caught.failure.message, /supervised suite failed/)
      assert.equal(caught.tool.pid, caught.tool.pgid, 'The actual tool is an independent detached group leader')
      assert.equal(caught.tool.childPgid, caught.tool.pgid, 'The actual descendant was observed in its tool owner\'s group before termination')
      assert.notEqual(caught.tool.pgid, caught.foreign.pgid)
      assert.ok(caught.foreignMembers.some(row => row.pid === caught.foreign.pid), 'The unrelated caller-owned group remains alive when silence is caught')
      assert.equal(caught.homeExists, false, 'The exact inner HOME was reclaimed before its caller caught failure')
      if (scenario.phase !== null) {
        const initial = caught.inspections.find(inspection => inspection.phase === 'initial-capture' && !inspection.failed)
        assert.ok(initial, 'The real initial process snapshot was obtained before the native failure')
        assert.ok(initial.rows.some(row => row.pid === caught.tool.pid && row.parent === caught.tool.monitorPid && row.pgid === caught.tool.pgid), 'The initial native snapshot contains the actual tool and monitor lineage')
        assert.ok(initial.rows.some(row => row.pid === caught.tool.monitorPid && row.pgid === caught.tool.monitorPgid), 'The initial native snapshot contains the actual monitor group')
        const failedInspection = caught.inspections.find(inspection => inspection.phase === scenario.phase && inspection.failed)
        assert.ok(failedInspection, 'The chosen phase reached a real failing native ps invocation')
        assert.equal(failedInspection.status, 1)
        assert.ok(failedInspection.pid > 0)
        if (scenario.phase === 'descendant-drain') {
          assert.ok(caught.inspections.some(inspection => inspection.phase === 'freeze-confirmation' && !inspection.failed), 'Capture completed its real frozen-group inspection before the drain failure')
        }
      }
      if (scenario.cleanupFailure || scenario.captureFailure) {
        if (scenario.captureFailure === 'missing-root') {
          assert.equal(caught.nativeErrorPreserved, true)
          assert.ok(caught.failureRecords.some(error => error.message === 'The owned inner group was absent from the frozen descendant snapshot'), 'A native snapshot without the root is an incomplete capture')
          const initial = caught.inspections.find(inspection => inspection.phase === 'initial-capture' && !inspection.failed)
          const incomplete = caught.inspections.find(inspection => inspection.incompleteSnapshot)
          assert.ok(incomplete)
          assert.ok(incomplete.rootRows.length > 0 && incomplete.rootRows.every(row => /^[Tt]/.test(row.state)), 'The independent full native snapshot observed the actual root frozen')
          assert.deepEqual(incomplete.lineage, initial.lineage)
          assert.deepEqual(incomplete.deliveredRows.map(row => row.pid).sort((a, b) => a - b), [caught.tool.pid, caught.tool.childPid, caught.tool.monitorPid].sort((a, b) => a - b), 'The deliberately incomplete frame is actual native output for only the registered tool and monitor identities')
          assert.equal(incomplete.deliveredRows.some(row => incomplete.rootRows.some(root => root.pgid === row.pgid)), false)
        } else {
          const failedCleanup = caught.inspections.find(inspection => inspection.phase === (scenario.captureFailure ? 'freeze-confirmation' : 'failure-drain') && inspection.failed)
          assert.ok(failedCleanup, 'Cleanup reached a second actual failing native ps invocation')
          assert.equal(failedCleanup.status, 1)
          assert.ok(failedCleanup.pid > 0)
          assert.deepEqual({
            primaryPreserved: caught.nativeErrorPreserved,
            cleanupPreserved: caught.nativeCleanupErrorPreserved,
            distinctOriginals: caught.nativeErrorsDistinct,
          }, { primaryPreserved: true, cleanupPreserved: true, distinctOriginals: true }, output)
          if (scenario.cleanupFailure) {
            assert.equal(caught.nativeFailures.length, 2)
            const normalizedStderr = stderr.replace(/\s+/g, ' ').trim()
            for (const nativeFailure of caught.nativeFailures) {
              assert.ok(normalizedStderr.includes(nativeFailure.message.replace(/\s+/g, ' ').trim()),
                `Supervisor stderr must retain each actual native failure message\n${stderr}`)
              for (const key of ['code', 'syscall', 'status']) {
                if (nativeFailure[key] === undefined) continue
                const value = typeof nativeFailure[key] === 'string' ? `'${nativeFailure[key]}'` : String(nativeFailure[key])
                assert.ok(stderr.includes(`${key}: ${value}`), `Supervisor stderr must retain native ${key}\n${stderr}`)
              }
            }
          }
        }
        assert.ok(caught.monitorMembers.some(row => row.pid === caught.tool.monitorPid && row.pgid === caught.tool.monitorPgid && /^[Tt]/.test(row.state)), 'The observed monitor remains paused; cleanup is explicitly incomplete at caller rejection')
        assert.deepEqual(caught.toolMembers.map(row => row.pid).sort((a, b) => a - b), [caught.tool.pid, caught.tool.childPid].sort((a, b) => a - b), 'The known tool and descendant remain live while their owned monitor is paused')
        assert.equal(caught.inspections.some(inspection => inspection.resumedMonitor), false)
        if (scenario.captureFailure === 'inspection') {
          assert.equal(caught.inspections.find(inspection => inspection.phase === 'initial-capture' && !inspection.failed).deliveredToSupervisor, false)
          assert.equal(caught.inspections.some(inspection => inspection.phase === 'freeze-confirmation' && !inspection.failed), false, 'Neither native capture supplied a successful snapshot to the supervisor')
        }
      } else if (scenario.phase !== null) {
        assert.deepEqual({
          nativeErrorPreserved: caught.nativeErrorPreserved,
          toolMembers: caught.toolMembers,
          monitorMembers: caught.monitorMembers,
        }, { nativeErrorPreserved: true, toolMembers: [], monitorMembers: [] }, output)
        const released = caught.inspections.find(inspection => inspection.phase === 'failure-drain' && inspection.resumedMonitor)
        assert.ok(released, 'Recovery observed the held owned monitor before allowing its natural cleanup')
        assert.equal(released.resumedMonitor.pid, caught.tool.monitorPid)
        assert.equal(released.resumedMonitor.pgid, caught.tool.monitorPgid)
        assert.match(released.resumedMonitor.state, /^[Tt]/)
        if (scenario.phase === 'initial-capture') {
          const initial = caught.inspections.find(inspection => inspection.phase === 'initial-capture' && !inspection.failed)
          assert.equal(initial.deliveredToSupervisor, false, 'The independent initial identity oracle was never supplied to the supervisor')
          const recovered = caught.inspections.find(inspection => inspection.phase === 'freeze-confirmation' && !inspection.failed &&
            inspection.rootRows.length > 0 && inspection.rootRows.every(row => /^[Tt]/.test(row.state)))
          assert.ok(recovered, 'Recovery observed the actual root group frozen before killing its parent chain')
          assert.deepEqual(recovered.lineage, initial.lineage, 'The successful native recovery snapshot retained the actual original ancestry')
          assert.ok(recovered.rows.some(row => row.pid === caught.tool.pid && row.parent === caught.tool.monitorPid && row.pgid === caught.tool.pgid))
          assert.ok(recovered.rows.some(row => row.pid === caught.tool.monitorPid && row.pgid === caught.tool.monitorPgid && /^[Tt]/.test(row.state)))
        }
      }
      if (!scenario.cleanupFailure && !scenario.captureFailure) assert.deepEqual(caught.toolMembers, [], `The actual detached tool group must already be empty when its caller catches failure\n${output}`)
      assert.deepEqual(JSON.parse(fs.readFileSync(cleanupPath, 'utf8')).live, [])
    } catch (error) {
      failure = { error }
    } finally {
      if (launcher && launcher.exitCode === null && launcher.signalCode === null) {
        try {
          launcher.kill('SIGKILL')
        } catch (error) {
          cleanupErrors.push(error)
        }
      }
      if (launcherDrained) {
        const [outcome] = await launcherDrained
        if (outcome.status === 'rejected') cleanupErrors.push(outcome.reason)
      }
      for (const markerPath of [ownershipPath, foreignOwnershipPath]) {
        if (!fs.existsSync(markerPath)) continue
        try {
          const identity = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
          await reclaimCapturedGroup(identity)
          if (identity.monitorPid) await reclaimCapturedGroup({ pid: identity.monitorPid, pgid: identity.monitorPgid })
          assert.deepEqual(processRows().filter(row => [identity.pgid, identity.monitorPgid].includes(row.pgid) && !/^[ZX]/.test(row.state)), [], 'Final fixture cleanup must drain the exact captured owned groups')
        } catch (error) {
          cleanupErrors.push(error)
        }
      }
      if (cleanupErrors.length === 0) {
        try {
          fs.rmSync(directory, { recursive: true, force: true })
        } catch (error) {
          cleanupErrors.push(error)
        }
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError([...(failure ? [failure.error] : []), ...cleanupErrors], `Detached tool verification and cleanup failed; retained ownership evidence: ${directory}`, { cause: failure?.error })
    }
    if (failure) throw failure.error
  })
}
