import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js'

const [binding, commonDir, writerId, scenario, requestJson] = process.argv.slice(2)
assert.ok(['wire', 'mcp'].includes(binding))
const request = JSON.parse(requestJson)
const root = path.dirname(commonDir)
const fatal = scenario === 'malformed-release'
const childPath = fileURLToPath(new URL('./sphinx-physical-binding-child.mjs', import.meta.url))
const env = { ...process.env }
delete env.NODE_TEST_CONTEXT
delete env.NODE_OPTIONS
delete env.WANXIANGSHU_NO_FATAL_EXIT
const fatalFile = path.join(root, 'fatal-report.ndjson')
const fatalFd = fs.openSync(fatalFile, 'wx')
const native = spawn(process.execPath, [childPath, binding, commonDir, writerId, scenario, requestJson], {
  cwd: root, env, stdio: [binding === 'mcp' ? 'pipe' : 'ignore', 'pipe', fatalFd],
})
fs.closeSync(fatalFd)
const pending = new Map()
const frames = []
const readBuffer = new ReadBuffer()
let sequence = 0
let processFailure
let protocolFailure
let terminal
let closed = false
let cleanupRequested = false
native.once('error', error => { processFailure = error })
native.once('exit', (exitCode, signal) => { terminal = { exitCode, signal } })
const close = new Promise(resolve => native.once('close', (exitCode, signal) => {
  closed = true
  for (const waiter of pending.values()) waiter.reject(new Error(`Native ${binding} closed before its reply`))
  pending.clear()
  resolve({ exitCode, signal })
}))
native.stdout.on('data', chunk => {
  try {
    readBuffer.append(chunk)
    for (let frame = readBuffer.readMessage(); frame !== null; frame = readBuffer.readMessage()) {
      frames.push(frame)
      if (!Object.hasOwn(frame, 'id')) continue
      const waiter = pending.get(frame.id)
      assert.ok(waiter, 'a response belongs to one outstanding protocol request')
      pending.delete(frame.id)
      if (Object.hasOwn(frame, 'error')) waiter.reject(new Error(JSON.stringify(frame.error)))
      else waiter.resolve(frame.result)
    }
  } catch (error) {
    protocolFailure = error
    for (const waiter of pending.values()) waiter.reject(error)
    pending.clear()
  }
})
native.stdout.once('error', error => { processFailure ??= error })
native.stdin?.on('error', error => { processFailure ??= error })
const send = message => native.stdin.write(serializeMessage(message))
const rpc = (method, params) => {
  sequence += 1
  const id = sequence
  const reply = new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  send({ jsonrpc: '2.0', id, method, params })
  return { id, reply }
}
const business = result => {
  assert.equal(result.content.length, 1)
  assert.equal(result.content[0].type, 'text')
  const payload = JSON.parse(result.content[0].text)
  assert.deepEqual(result.structuredContent, payload)
  assert.equal(payload.apiVersion, '2')
  return payload
}

try {
  let protocol = null
  if (binding === 'mcp') {
    const initialized = await rpc('initialize', { protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {}, clientInfo: { name: 'sphinx-physical-binding-contract', version: '1' } }).reply
    assert.equal(initialized.serverInfo.name, 'sphinx')
    send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    const listed = await rpc('tools/list', {}).reply
    const tools = listed.tools.map(tool => tool.name).sort()
    assert.deepEqual(tools, ['sphinx_inquiry_start', 'sphinx_work_next', 'sphinx_work_submit',
      'sphinx_inquiry_status', 'sphinx_inquiry_cancel', 'sphinx_inquiry_export', 'sphinx_goal_amend'].sort())
    const status = await rpc('tools/call', { name: 'sphinx_inquiry_status', arguments: { inquiryId: request.seed.inquiryId } }).reply
    const state = business(status)
    assert.equal(status.isError, false)
    assert.equal(state.outcome, 'read')
    assert.equal(state.inquiryId, request.seed.inquiryId)
    assert.equal(state.revision, '0')
    assert.equal(state.status, 'active')
    assert.equal(fs.existsSync(path.join(commonDir, 'wanxiangshu', 'events', `${writerId}.ndjson`)), false)
    assert.equal(fs.existsSync(path.join(root, 'settlement.json')), false)
    const command = { commandId: request.command.commandId, inquiryId: request.seed.inquiryId,
      reason: request.cancelReason }
    const invocation = rpc('tools/call', { name: 'sphinx_inquiry_cancel', arguments: command })
    let result
    const observedReply = invocation.reply.then(value => { result = value }, () => {})
    if (fatal) await Promise.race([
      close,
      invocation.reply.then(
        () => assert.fail('the original fatal binding must terminate before a tool reply'),
        error => {
          if (!closed) throw error
          return close
        },
      ),
    ])
    else {
      const reply = await invocation.reply
      const payload = business(reply)
      fs.writeFileSync(path.join(root, 'returned.json'), JSON.stringify(payload))
      native.stdin.end()
      await close
    }
    await observedReply
    const replies = frames.filter(frame => frame.id === invocation.id)
    assert.equal(replies.length, fatal ? 0 : 1, 'fatal cancellation cannot return a tool result or protocol error')
    if (!fatal) assert.equal(result.isError, scenario === 'valid-release')
    protocol = { tools, read: state, command, replies: replies.length }
  } else await close
  if (processFailure) throw processFailure
  if (protocolFailure) throw protocolFailure
  assert.equal(cleanupRequested, false)
  assert.deepEqual(terminal, fatal ? { exitCode: null, signal: 'SIGKILL' } : { exitCode: 0, signal: null })
  const reportLines = fs.readFileSync(fatalFile, 'utf8').split('\n').filter(line => line.length > 0)
  const reports = reportLines.map(JSON.parse)
  assert.equal(reports.length, fatal ? 1 : 0)
  const measured = JSON.parse(fs.readFileSync(path.join(root, 'settlement.json'), 'utf8'))
  assert.equal(measured.pid, native.pid)
  assert.equal(measured.parentPid, process.pid)
  const returned = fs.existsSync(path.join(root, 'returned.json'))
    ? JSON.parse(fs.readFileSync(path.join(root, 'returned.json'), 'utf8')) : null
  assert.equal(returned === null, fatal)
  fs.writeSync(1, JSON.stringify({ coordinatorPid: process.pid, pid: native.pid, ...terminal,
    cleanupRequested, reports, measured, returned, protocol }) + '\n')
} finally {
  if (!closed) {
    cleanupRequested = true
    native.kill('SIGKILL')
    await close
  }
}
