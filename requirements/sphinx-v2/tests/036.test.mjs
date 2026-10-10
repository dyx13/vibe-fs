import assert from 'node:assert/strict'
import test from 'node:test'
import {createHash, randomUUID} from 'node:crypto'
import {accessSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js'
import {ErrorCode, McpError} from '@modelcontextprotocol/sdk/types.js'
import {Watchdog} from '../../verification-system/tests/e2e/support/watchdog.js'
import {isTool} from '../../../dist/Sphinx/V2/Wire/Surface.js'
import * as Wire from '../../../dist/Sphinx/V2/Wire/Surface.js'
import {isOk, isError, errorValue} from '../../../dist/Sphinx/V2/Core/Surface.js'
import {
  Tool_decodeStart as decodeStart,
  Tool_decodeWorkNext as decodeWorkNext,
  Tool_decodeWorkSubmit as decodeWorkSubmit,
  Tool_decodeStatus as decodeStatus,
  Tool_decodeCancel as decodeCancel,
  Tool_decodeExport as decodeExport,
  Tool_decodeGoalAmend as decodeGoalAmend,
  Tool_refusalCode as refusalCode,
  Tool_refusalPath as refusalPath,
  Tool_refusalMessage as refusalMessage,
} from '../../../dist/Sphinx/V2/Hosts/Mcp/Tool.js'

const allowed = ['sphinx_inquiry_start', 'sphinx_work_next', 'sphinx_work_submit', 'sphinx_inquiry_status', 'sphinx_inquiry_cancel', 'sphinx_inquiry_export', 'sphinx_goal_amend']

const refusalOf = result => {
  assert.equal(isError(result), true, 'expected a refused decode')
  const refusal = errorValue(result)
  return {code: refusalCode(refusal), path: refusalPath(refusal), message: refusalMessage(refusal)}
}

test('WHAT[sphinx-v2-036] actual tool contract admits the v2 names and rejects retired stage aliases', () => {
  for (const name of allowed) assert.equal(isTool(name), true, name)
  for (const name of ['sphinx_assess', 'sphinx_propose', 'sphinx_investigate', 'sphinx_synthesize', 'sphinx', 'sphinx_inquiry_start_extra', 'SPHINX_WORK_NEXT']) {
    assert.equal(isTool(name), false, name)
  }
})

test('WHAT[sphinx-v2-036] every registered tool decodes its own arguments instead of ignoring them', () => {
  const argumentsOf = {
    sphinx_inquiry_start: {commandId: 'c', goalText: 'g', constraints: [], materialRefs: [], authorizationRef: 'u', profileRef: 'p'},
    sphinx_work_next: {commandId: 'c', inquiryId: 'i', limit: 1},
    sphinx_work_submit: {commandId: 'c', inquiryId: 'i', workId: 'w', attempt: 1, fence: 'f', canonicalResult: 'r', resultSchema: {id: 's', hash: 'h'}, clusterId: 'k'},
    sphinx_inquiry_status: {inquiryId: 'i'},
    sphinx_inquiry_cancel: {commandId: 'c', inquiryId: 'i', reason: 'r'},
    sphinx_inquiry_export: {inquiryId: 'i', mode: 'summary'},
    sphinx_goal_amend: {commandId: 'c', inquiryId: 'i', expectedRevision: '0', authorizedBy: 'u', addedConstraints: []},
  }

  const decoders = {
    sphinx_inquiry_start: decodeStart,
    sphinx_work_next: decodeWorkNext,
    sphinx_work_submit: decodeWorkSubmit,
    sphinx_inquiry_status: decodeStatus,
    sphinx_inquiry_cancel: decodeCancel,
    sphinx_inquiry_export: decodeExport,
    sphinx_goal_amend: decodeGoalAmend,
  }

  assert.deepEqual(Object.keys(decoders).sort(), [...allowed].sort())
  assert.deepEqual(Object.keys(argumentsOf).sort(), [...allowed].sort())

  for (const name of allowed) {
    // Each tool reads its own shape: the same valid arguments are accepted, and the
    // same empty ones are refused by the field that is missing.
    assert.equal(isOk(decoders[name](argumentsOf[name])), true, name)
    assert.equal(isError(decoders[name]({})), true, name)
  }
})

test('WHAT[sphinx-v2-036] invalid inquiry identities are refused by the real JS reader instead of escaping as exceptions', () => {
  const commonDir = mkdtempSync(join(tmpdir(), 'sphinx-invalid-read-id-'))
  const handle = Wire.create(commonDir, 'invalid-read-owner', null)
  try {
    const before = journalBytes(commonDir)
    for (const inquiryId of ['a b', 'inq\nx', 'inq\0x']) {
      for (const result of [
        Wire.status(handle, {inquiryId}),
        Wire.exportInquiry(handle, {inquiryId, mode: 'summary'}),
        Wire.exportInquiry(handle, {inquiryId, mode: 'full'}),
      ]) {
        assert.equal(result.outcome, 'refused')
        assert.equal(result.refusal.code, 'INVALID_SCHEMA')
        assert.equal(result.refusal.path, 'inquiryId')
        assert.notEqual(result.refusal.message.trim(), '')
      }
    }
    assert.deepEqual(journalBytes(commonDir), before)
  } finally {
    Wire.dispose(handle)
    rmSync(commonDir, {recursive: true, force: true})
  }
})

test('WHAT[sphinx-v2-036] read ingress refuses explicit additional commands and state mutations by field', () => {
  // 这里只证明 parser 拒绝夹带的写请求，不证明真实读取的副作用。
  // commandId、workId、attempt 等单独的身份字段不等于一次写动作；
  // 不用任意未知键测试发明封闭字段策略。
  const reads = [
    ['sphinx_inquiry_status', decodeStatus, {inquiryId: 'i'}],
    ['sphinx_inquiry_export', decodeExport, {inquiryId: 'i', mode: 'summary'}],
    ['sphinx_inquiry_export', decodeExport, {inquiryId: 'i', mode: 'full'}],
  ]
  const cancel = {tool: 'sphinx_inquiry_cancel', arguments: {commandId: 'c', inquiryId: 'i', reason: 'stop'}}
  const mutations = {
    command: cancel,
    commands: [cancel],
    certificatePatches: [{targetRef: 'n', expectedSlotRevision: '0'}],
    budgetDebit: {modelCalls: 1},
    events: [{tag: 'CancelRequested', payload: 'stop'}],
    goalRevision: '1',
    goalAmendment: {authorizedBy: 'u', addedConstraints: ['new constraint']},
  }

  for (const [name, decode, args] of reads) {
    assert.equal(isOk(decode(args)), true, name + '.valid-read')
    for (const [field, value] of Object.entries(mutations)) {
      const refusal = refusalOf(decode({...args, [field]: value}))
      assert.equal(refusal.code, 'INVALID_SCHEMA', name + '.' + field)
      assert.equal(refusal.path, field, name + '.' + field)
      assert.equal(typeof refusal.message, 'string')
      assert.notEqual(refusal.message.trim(), '', name + '.' + field)
    }
  }
})

test('WHAT[sphinx-v2-036] a goal amendment requires its own user authorizer and validates optional replacement text', () => {
  const args = {commandId: 'c', inquiryId: 'i', expectedRevision: '0', authorizedBy: 'u', addedConstraints: []}
  const {authorizedBy, ...withoutAuthorizer} = args
  for (const invalid of [withoutAuthorizer, {...args, authorizedBy: '  '}, {...args, authorizedBy: 1}]) {
    const refusal = refusalOf(decodeGoalAmend(invalid))
    assert.equal(refusal.code, 'INVALID_SCHEMA')
    assert.equal(refusal.path, 'authorizedBy')
  }
  assert.equal(isOk(decodeGoalAmend(args)), true)
  assert.equal(isOk(decodeGoalAmend({...args, replacementText: 'replacement'})), true)
  for (const replacementText of [null, '  ']) {
    const refusal = refusalOf(decodeGoalAmend({...args, replacementText}))
    assert.equal(refusal.code, 'INVALID_SCHEMA')
    assert.equal(refusal.path, 'replacementText')
  }
})

test('WHAT[sphinx-v2-036] goal amendment ingress requires its own checked revision precondition', () => {
  const args = {commandId: 'c', inquiryId: 'i', expectedRevision: '0', authorizedBy: 'u', addedConstraints: []}
  assert.equal(isOk(decodeGoalAmend(args)), true)
  const {expectedRevision, ...withoutRevision} = args
  for (const invalid of [withoutRevision, {...args, expectedRevision: null}, {...args, expectedRevision: 1}, {...args, expectedRevision: '-1'}, {...args, expectedRevision: 'not-a-revision'}]) {
    assert.equal(refusalOf(decodeGoalAmend(invalid)).path, 'expectedRevision')
  }
})

test('WHAT[sphinx-v2-036] an export mode outside summary and full, and a claim limit that could never admit work, are refused by field', () => {
  assert.equal(refusalOf(decodeExport({inquiryId: 'i', mode: 'everything'})).path, 'mode')
  assert.equal(refusalOf(decodeWorkNext({commandId: 'c', inquiryId: 'i', limit: 0})).path, 'limit')
  assert.equal(isOk(decodeExport({inquiryId: 'i', mode: 'full'})), true)
  assert.equal(isOk(decodeWorkNext({commandId: 'c', inquiryId: 'i', limit: 1})), true)
})


const serveEntry = fileURLToPath(new URL('../../../dist/Sphinx/V2/ServeEntry.js', import.meta.url))
const plainObject = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
const nativeJson = value => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(nativeJson)
  return plainObject(value) && Object.values(value).every(nativeJson)
}

function mcpRefusal(result, label) {
  const layout = 'MCP_RESPONSE_LAYOUT: ' + label
  assert.equal(plainObject(result) && nativeJson(result), true, layout + ' 必须返回原生 JSON 对象')
  assert.equal(result.isError, true, layout + ' 拒绝必须明确 isError=true')
  let payload
  if (Object.hasOwn(result, 'structuredContent')) {
    payload = result.structuredContent
  } else {
    assert.equal(Array.isArray(result.content), true, layout + ' 缺少 content')
    const text = result.content.filter(block => block.type === 'text')
    assert.equal(text.length, 1, layout + ' 必须有一份非空的可读 JSON 文本，空 content 不算拒绝')
    assert.equal(typeof text[0].text, 'string', layout + ' text 必须是字符串')
    assert.notEqual(text[0].text.trim(), '', layout + ' text 不得为空')
    try { payload = JSON.parse(text[0].text) }
    catch (cause) { throw new Error(layout + ' content 不是正式业务 JSON', {cause}) }
  }
  assert.equal(plainObject(payload) && nativeJson(payload), true, layout + ' 业务 payload 必须是原生对象')
  assert.equal(payload.apiVersion, '2', layout + ' Sphinx API 版本')
  assert.equal(payload.outcome, 'refused', layout + ' 不能把拒绝报告为业务成功')
  assert.equal(plainObject(payload.refusal), true, layout + ' 缺少具名 refusal')
  for (const field of ['code', 'path', 'message']) {
    assert.equal(typeof payload.refusal[field], 'string', layout + ' refusal.' + field)
    assert.notEqual(payload.refusal[field].trim(), '', layout + ' refusal.' + field + ' 不得为空')
  }
  return payload.refusal
}

async function expectMcpRefusal(session, name, args, code, path, label) {
  const result = await session.callTool(name, args, label)
  const refusal = mcpRefusal(result, label)
  const ingress = 'MCP_INGRESS_REFUSAL_MISMATCH: ' + label +
    '；若得到 unsupported/unknown 而非字段拒绝，检查完整 passthrough schema 是否保留字段到 Tool'
  assert.equal(refusal.code, code, ingress)
  assert.equal(refusal.path, path, ingress)
}

async function closeAndObserveExit(client, transport, exited, diagnostic) {
  let rejectSilence
  const silence = new Promise((_, reject) => { rejectSilence = reject })
  const watchdog = new Watchdog({
    label: 'sphinx-mcp cleanup',
    onTimeout: () => console.error(diagnostic('等待 SDK 子进程的真实 close 事件')),
    deps: {terminate: () => rejectSilence(new Error('MCP_SERVER_EXIT_UNOBSERVED: ' + diagnostic('未观察到真实退出')))},
  })
  // close() 可能在发送 SIGKILL 后先返回。唯有预先订阅的 onclose 证明实际退出。
  const cleanup = (async () => {
    const errors = []
    try { await client.close() } catch (error) { errors.push(error) }
    try { await transport.close() } catch (error) { errors.push(error) }
    await exited
    assert.equal(transport.pid, null, 'MCP_SERVER_EXIT_UNOBSERVED: close 后仍有 SDK 子进程')
    if (errors.length) throw new AggregateError(errors, 'MCP_CLIENT_CLEANUP_FAILED')
  })()
  try { await Promise.race([cleanup, silence]) }
  finally { watchdog.stop() }
}

async function withSphinxStdio(t, scenario, options = {}) {
  try { accessSync(serveEntry) }
  catch (cause) { throw new Error('MCP_ENTRY_UNAVAILABLE: 需要最终集成产物 ' + serveEntry, {cause}) }
  const ownsCommonDir = options.commonDir === undefined
  const commonDir = options.commonDir ?? mkdtempSync(join(tmpdir(), 'sphinx-mcp-contract-'))
  const entryPath = realpathSync(serveEntry)
  // SDK 默认安全环境加本次目录，不继承父测试的 fatal-disable 或 NODE_OPTIONS。
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [...(options.importModule === undefined ? [] : ['--import', options.importModule]), entryPath],
    cwd: commonDir,
    env: {
      SPHINX_COMMON_DIR: commonDir,
      ...(options.startConfig === undefined ? {} : {SPHINX_START_CONFIG: JSON.stringify(options.startConfig)}),
    },
    stderr: 'pipe',
  })
  const client = new Client({name: 'sphinx-stdio-contract', version: '1'}, {capabilities: {}})
  const controller = new AbortController()
  const signal = AbortSignal.any([t.signal, controller.signal])
  let stderr = ''
  let transportError = null
  let waiting = 'initialize'
  let lastProgress = '监测开始，尚无协议完成'
  let replyNumber = 0
  let startAttempted = false
  let closed = false
  let resolveExit
  const exited = new Promise(resolve => { resolveExit = resolve })
  // SDK 1.30.0 在 ChildProcess close 后调用它；Protocol.connect 会保存这个回调。
  transport.onclose = () => { closed = true; resolveExit() }
  transport.onerror = error => { transportError = error }
  const onStderr = chunk => { stderr = (stderr + chunk).slice(-4096) }
  transport.stderr.setEncoding('utf8')
  transport.stderr.on('data', onStderr)
  const diagnostic = wait => '目标=ServeEntry；等待=' + wait + '；最近进展=' + lastProgress +
    '；transport error=' + (transportError?.message ?? '无') + '；stderr尾部=' + (stderr || '无')
  const unexpectedExit = exited.then(() => {
    throw new Error('MCP_SERVER_EXITED: ' + diagnostic(waiting))
  })
  unexpectedExit.catch(() => {})
  const watchdog = new Watchdog({
    label: 'sphinx-mcp protocol',
    onTimeout: () => console.error(diagnostic(waiting)),
    deps: {terminate: () => controller.abort(new Error('MCP_CAUSAL_SILENCE: ' + diagnostic(waiting)))},
  })
  let interrupt
  const interrupted = new Promise((_, reject) => {
    interrupt = () => reject(signal.reason)
    signal.addEventListener('abort', interrupt, {once: true})
    if (signal.aborted) interrupt()
  })
  interrupted.catch(() => {})
  const step = async (label, action, failureCode) => {
    waiting = label
    signal.throwIfAborted()
    try {
      const result = await Promise.race([action(), unexpectedExit, interrupted])
      lastProgress = label + ' 已完成'
      watchdog.advance({reason: lastProgress, lane: 'mcp-protocol', expectationId: String(++replyNumber)})
      return result
    } catch (cause) {
      throw new Error(failureCode + ': ' + diagnostic(label), {cause})
    }
  }
  let failure
  try {
    await step('initialize/initialized', () => {
      startAttempted = true
      return client.connect(transport, {signal})
    }, 'MCP_BOOT_OR_REGISTRATION_FAILED')
    const session = {
      serverInfo: client.getServerVersion(),
      listTools: () => step('tools/list', () => client.listTools(undefined, {signal}), 'MCP_DISCOVERY_FAILED'),
      callTool: (name, args, label) => step(label, () => client.callTool({name, arguments: args}, undefined, {signal}), 'MCP_PROTOCOL_RESPONSE_FAILED'),
      commonDir,
    }
    await scenario(session)
  } catch (error) { failure = error }
  finally {
    watchdog.stop()
    try {
      if (startAttempted) await closeAndObserveExit(client, transport, exited, diagnostic)
      else { await client.close(); await transport.close() }
    } catch (error) {
      failure = failure ? new AggregateError([failure, error], 'MCP_CONTRACT_AND_CLEANUP_FAILED') : error
    }
    signal.removeEventListener('abort', interrupt)
    transport.stderr.off('data', onStderr)
    // 未见退出时保留目录作为失败材料，不能删除它并冒充资源已收束。
    if (closed || !startAttempted) {
      if (ownsCommonDir) rmSync(commonDir, {recursive: true, force: true})
    } else t.diagnostic('MCP_SERVER_EXIT_UNOBSERVED: 保留 ' + commonDir)
  }
  if (failure) throw failure
  assert.equal(closed, true, 'MCP_SERVER_EXIT_UNOBSERVED: fixture 未取得实际退出事件')
}

test('WHAT[sphinx-v2-036] the response oracle rejects bare empty content, false success and malformed refusal fields', () => {
  const payload = {apiVersion: '2', outcome: 'refused', refusal: {code: 'INVALID_SCHEMA', path: 'command', message: 'explicit write is refused'}}
  const result = {isError: true, structuredContent: payload, content: []}
  assert.deepEqual(mcpRefusal(result, 'structured positive control'), payload.refusal)
  assert.deepEqual(mcpRefusal({isError: true, content: [{type: 'text', text: JSON.stringify(payload)}]}, 'JSON positive control'), payload.refusal)
  for (const invalid of [
    {isError: true, content: []},
    {...result, isError: false},
    {isError: true, content: [{type: 'text', text: '   '}]},
    {isError: true, content: [{type: 'text', text: 'not JSON'}]},
    {...result, structuredContent: {}},
    {...result, structuredContent: {...payload, refusal: {...payload.refusal, message: ' '}}},
    {...result, structuredContent: {...payload, refusal: {...payload.refusal, path: null}}},
    {...result, structuredContent: {...payload, refusal: {...payload.refusal, code: ''}}},
  ]) assert.throws(() => mcpRefusal(invalid, 'negative control'), /MCP_RESPONSE_LAYOUT/)
})

test('WHAT[sphinx-v2-036] one real SDK stdio session registers seven tools and preserves named ingress refusals', async t => {
  await withSphinxStdio(t, async session => {
    assert.equal(session.serverInfo.name, 'sphinx', 'initialize must reach the production Sphinx server')
    const {tools} = await session.listTools()
    assert.equal(tools.length, 7, 'MCP_DISCOVERY_FAILED: exactly seven real registered tools')
    assert.deepEqual(tools.map(tool => tool.name).sort(), [...allowed].sort())
    await t.test('WHAT[sphinx-v2-036] public goal amendment advertises optional text and a strict revision precondition', () => {
      const amendmentSchema = tools.find(tool => tool.name === 'sphinx_goal_amend').inputSchema
      assert.equal(amendmentSchema.type, 'object', 'MCP_SCHEMA_CONTRACT_MISMATCH: object input schema')
      assert.equal(Array.isArray(amendmentSchema.required), true, 'MCP_SCHEMA_CONTRACT_MISMATCH: required fields')
      assert.equal(amendmentSchema.required.includes('replacementText'), false, 'MCP_SCHEMA_CONTRACT_MISMATCH: replacementText is optional, not nullable')
      assert.equal(amendmentSchema.required.includes('expectedRevision'), true, 'MCP_SCHEMA_CONTRACT_MISMATCH: goal amendment has a strict revision precondition')
    })

    const inquiryId = 'protocol-only-absent-inquiry'
    await t.test('WHAT[sphinx-v2-036] public start requires explicit startup configuration', async () => {
      await expectMcpRefusal(session, 'sphinx_inquiry_start', {
        commandId: 'unconfigured-start', goalText: 'an authorized goal', constraints: [],
        materialRefs: [], authorizationRef: 'user-authorizer', profileRef: 'sphinx.default@2',
      }, 'CONFIG_REQUIRED', 'configuration', 'unconfigured start')
    })
    const cancel = {tool: 'sphinx_inquiry_cancel', arguments: {commandId: 'cancel-1', inquiryId, expectedRevision: '0', reason: 'stop'}}
    const mutations = {
      command: cancel,
      commands: [cancel],
      certificatePatches: [{targetRef: 'n', expectedSlotRevision: '0'}],
      budgetDebit: {modelCalls: 1},
      events: [{tag: 'CancelRequested', payload: 'stop'}],
      goalRevision: '1',
      goalAmendment: {authorizedBy: 'user-authorizer', expectedRevision: '0', addedConstraints: ['new constraint']},
    }
    // 该 hash 来自下列 canonical schema 文档，不冒充已注册的业务 schema。
    const schemaDocument = '{"additionalProperties":false,"properties":{"answer":{"type":"string"}},"required":["answer"],"type":"object"}'
    const answer = {
      commandId: 'submit-1', inquiryId, workId: 'protocol-only-work', attempt: 1,
      fence: 'protocol-only-fence', canonicalResult: '{"answer":"42"}',
      resultSchema: {id: 'sphinx.answer@1', hash: createHash('sha256').update(schemaDocument).digest('hex')},
      clusterId: 'protocol-only-cluster',
    }
    await t.test('WHAT[sphinx-v2-036] a clean submit reaches the current unsupported branch, not business acceptance', async () => {
      await expectMcpRefusal(session, 'sphinx_work_submit', answer, 'RUNTIME_OPERATION_UNSUPPORTED', 'tool', 'clean submit positive control')
    })
    for (const field of ['certificatePatches', 'budgetDebit', 'events', 'goalRevision', 'goalAmendment']) {
      await t.test('WHAT[sphinx-v2-036] public work_submit preserves and refuses ' + field, async () => {
        await expectMcpRefusal(session, 'sphinx_work_submit', {...answer, [field]: mutations[field]}, 'WORK_RESULT_EXCEEDS_ROLE', field, 'work_submit.' + field)
      })
    }
    const reads = [
      ['sphinx_inquiry_status', {inquiryId}],
      ['sphinx_inquiry_export', {inquiryId, mode: 'summary'}],
      ['sphinx_inquiry_export', {inquiryId, mode: 'full'}],
    ]
    for (const [name, args] of reads) {
      const label = name + '.' + (args.mode ?? 'status')
      await t.test('WHAT[sphinx-v2-036] ' + label + ' clean input is not a business read/export proof', async () => {
        const refusal = mcpRefusal(await session.callTool(name, args, label + '.clean'), label + '.clean')
        assert.equal(refusal.path, 'inquiryId')
        assert.equal(refusal.code, 'UNKNOWN_INQUIRY', 'valid read/export must reach the actual absent-inquiry branch')
      })
      for (const [field, value] of Object.entries(mutations)) {
        await t.test('WHAT[sphinx-v2-036] public ' + label + ' refuses explicit ' + field, async () => {
          await expectMcpRefusal(session, name, {...args, [field]: value}, 'INVALID_SCHEMA', field, label + '.' + field)
        })
      }
    }
    const amendment = {commandId: 'amend-1', inquiryId, expectedRevision: '0', authorizedBy: 'user-authorizer', addedConstraints: ['keep the original goal']}
    await t.test('WHAT[sphinx-v2-036] public goal amendment refuses a negative revision before the unsupported driver', async () => {
      await expectMcpRefusal(session, 'sphinx_goal_amend', {...amendment, expectedRevision: '-1'}, 'INVALID_REVISION', 'expectedRevision', 'negative amendment revision')
    })
    for (const [label, args] of [
      ['omitted replacementText', amendment],
      ['nonblank replacementText', {...amendment, replacementText: 'user replacement'}],
    ]) {
      await t.test('WHAT[sphinx-v2-036] public goal amendment accepts ' + label + ' at ingress only', async () => {
        await expectMcpRefusal(session, 'sphinx_goal_amend', args, 'RUNTIME_OPERATION_UNSUPPORTED', 'tool', label)
      })
    }
    for (const replacementText of [null, '  ']) {
      const label = replacementText === null ? 'explicit null replacementText' : 'blank replacementText'
      await t.test('WHAT[sphinx-v2-036] public goal amendment refuses ' + label + ', not as omitted', async () => {
        if (replacementText !== null) {
          await expectMcpRefusal(session, 'sphinx_goal_amend', {...amendment, replacementText}, 'INVALID_SCHEMA', 'replacementText', label)
          return
        }
        // optional 不等于 nullable；SDK 类型拒绝无需伪装成 Tool 业务 JSON。
        let detail
        try {
          const result = await session.callTool('sphinx_goal_amend', {...amendment, replacementText}, label)
          assert.equal(plainObject(result) && nativeJson(result), true, 'MCP_SCHEMA_REJECTION: 必须是原生 MCP result')
          assert.equal(result.isError, true, 'MCP_SCHEMA_REJECTION: null 不得被接受或当作省略')
          assert.equal(Array.isArray(result.content), true, 'MCP_SCHEMA_REJECTION: 缺少正式 content')
          detail = result.content.filter(block => block.type === 'text' && typeof block.text === 'string')
            .map(block => block.text).join('\n').trim()
          if (!detail && Object.hasOwn(result, 'structuredContent')) {
            const refusal = mcpRefusal(result, label)
            assert.equal(refusal.path, 'replacementText')
            detail = refusal.path + ': ' + refusal.message
          }
        } catch (error) {
          // session 只包装一层 cause；其它协议、进程或 assertion 失败原样抛回。
          const sdkError = error instanceof McpError ? error : error.cause
          if (!(sdkError instanceof McpError) || sdkError.code !== ErrorCode.InvalidParams) throw error
          detail = sdkError.message
        }
        assert.equal(typeof detail, 'string', 'MCP_SCHEMA_REJECTION: 缺少可读字段错误')
        assert.notEqual(detail.trim(), '', 'MCP_SCHEMA_REJECTION: 空错误不算参数拒绝')
        assert.match(detail, /\breplacementText\b/, 'MCP_SCHEMA_REJECTION: 必须指出 replacementText')
        assert.match(detail, /invalid[_ -]?type|expected|must|required|cannot|received|不合法|无效|必须|不能|类型/i, 'MCP_SCHEMA_REJECTION: 必须说明拒绝原因')
        assert.match(detail, /\b(?:string|null|nullable|type)\b|字符串|空值|类型/i, 'MCP_SCHEMA_REJECTION: 必须说明类型或 null 原因')
      })
    }
  })
})

const startConfig = {
  commandNamespace: 'test-owner', createdBy: 'authorized-controller', profileRef: 'sphinx.default@2',
  executionMode: 'delegated', resourceSpecs: [{name: 'calls', kind: {case: 'consumed', payload: 'calls'}, authorizedLimit: 0}],
  renderReserve: {calls: 0},
}

test('WHAT[sphinx-v2-036] invalid material identities are refused by the real JS creator without a durable write', async () => {
  const commonDir = mkdtempSync(join(tmpdir(), 'sphinx-invalid-material-id-'))
  const handle = Wire.create(commonDir, 'invalid-material-owner', startConfig)
  const command = {commandId: 'invalid-material', goalText: 'goal with whitespace is lawful', constraints: [],
    materialRefs: [], authorizationRef: 'user', profileRef: startConfig.profileRef}
  try {
    const before = journalBytes(commonDir)
    for (const reference of ['ref a', 'ref\nx', 'ref\0x']) {
      const result = await Wire.start(handle, {...command, materialRefs: [reference]})
      assert.equal(result.outcome, 'refused')
      assert.equal(result.refusal.code, 'INVALID_SCHEMA')
      assert.equal(result.refusal.path, 'materialRefs[0]')
      assert.notEqual(result.refusal.message.trim(), '')
    }
    assert.deepEqual(journalBytes(commonDir), before)
  } finally {
    Wire.dispose(handle)
    rmSync(commonDir, {recursive: true, force: true})
  }
})

test('WHAT[sphinx-v2-036] actual JS start refuses malformed string lists without coercion or exceptions', async t => {
  const commonDir = mkdtempSync(join(tmpdir(), 'sphinx-start-list-types-'))
  const handle = Wire.create(commonDir, 'start-list-owner', startConfig)
  const command = {goalText: 'original goal with spaces', constraints: ['a lawful constraint with spaces'],
    materialRefs: [], authorizationRef: 'user', profileRef: startConfig.profileRef}
  const cases = [
    ['missing', undefined], ['null', null], ['object', {}], ['string', 'reference'],
    ['numeric entry', [1]], ['object entry', [{}]], ['null entry', [null]], ['boolean entry', [true]],
  ]
  try {
    for (const field of ['constraints', 'materialRefs']) {
      for (const [index, [label, value]] of cases.entries()) {
        await t.test('WHAT[sphinx-v2-036] actual start rejects ' + field + ' ' + label, async () => {
          const args = {...command, commandId: field + '-invalid-' + index, [field]: value}
          if (value === undefined) delete args[field]
          const before = journalBytes(commonDir)
          const result = await Wire.start(handle, args)
          assert.equal(result.outcome, 'refused')
          assert.equal(result.refusal.code, 'INVALID_SCHEMA')
          assert.equal(result.refusal.path, field)
          assert.notEqual(result.refusal.message.trim(), '')
          assert.deepEqual(journalBytes(commonDir), before)
        })
      }
    }
    const before = journalBytes(commonDir)
    const created = await Wire.start(handle, {...command, commandId: 'lawful-list-positive-control'})
    assert.equal(created.outcome, 'created', 'text fields with interior spaces remain lawful')
    assert.notDeepEqual(journalBytes(commonDir), before, 'valid lists still cause an actual durable creation')
  } finally {
    Wire.dispose(handle)
    rmSync(commonDir, {recursive: true, force: true})
  }
})

test('WHAT[sphinx-v2-036] invalid inquiry identities and material identities receive named refusals over real stdio', async t => {
  await withSphinxStdio(t, async session => {
    const before = journalBytes(session.commonDir)
    for (const inquiryId of ['a b', 'inq\nx', 'inq\0x']) {
      for (const [name, args] of [
        ['sphinx_inquiry_status', {inquiryId}],
        ['sphinx_inquiry_export', {inquiryId, mode: 'full'}],
        ['sphinx_inquiry_cancel', {inquiryId, commandId: 'invalid-identity', reason: 'stop'}],
      ]) {
        await t.test('WHAT[sphinx-v2-036] real ' + name + ' rejects invalid inquiry identity ' + JSON.stringify(inquiryId), async () => {
          await expectMcpRefusal(session, name, args, 'INVALID_SCHEMA', 'inquiryId', 'invalid inquiry identity')
        })
      }
    }
    for (const reference of ['ref a', 'ref\nx', 'ref\0x']) {
      await t.test('WHAT[sphinx-v2-036] real start rejects invalid material identity ' + JSON.stringify(reference), async () => {
        await expectMcpRefusal(session, 'sphinx_inquiry_start', {
          commandId: 'invalid-material', goalText: 'goal with whitespace is lawful', constraints: [],
          materialRefs: [reference], authorizationRef: 'user', profileRef: startConfig.profileRef,
        }, 'INVALID_SCHEMA', 'materialRefs[0]', 'invalid material identity')
      })
    }
    assert.deepEqual(journalBytes(session.commonDir), before)
  }, {startConfig})
})

function mcpBusiness(result, outcome, label) {
  assert.equal(plainObject(result) && nativeJson(result), true, 'MCP_BUSINESS_LAYOUT: ' + label)
  const texts = result.content?.filter(block => block.type === 'text') ?? []
  assert.equal(texts.length, 1, 'MCP_BUSINESS_LAYOUT: one readable JSON payload, ' + label)
  const textPayload = JSON.parse(texts[0].text)
  const payload = result.structuredContent ?? textPayload
  assert.equal(plainObject(payload) && nativeJson(payload), true, 'MCP_BUSINESS_LAYOUT: native business JSON, ' + label)
  assert.deepEqual(textPayload, payload, 'MCP_BUSINESS_LAYOUT: structured and text payload agree, ' + label)
  assert.equal(payload.apiVersion, '2', label)
  assert.equal(payload.outcome, outcome, 'N06_A_BUSINESS_OUTCOME: ' + label)
  assert.equal(result.isError, false, 'MCP_BUSINESS_LAYOUT: successful business outcome, ' + label)
  return payload
}

function wireBusiness(payload, outcome, label) {
  assert.equal(plainObject(payload) && nativeJson(payload), true, 'JS_BUSINESS_LAYOUT: ' + label)
  assert.equal(payload.apiVersion, '2', label + '.apiVersion')
  assert.equal(payload.outcome, outcome, 'JS_BUSINESS_OUTCOME: ' + label)
  return payload
}

function journalBytes(directory, prefix = '') {
  return readdirSync(directory, {withFileTypes: true}).sort((left, right) => left.name.localeCompare(right.name)).flatMap(entry => {
    const relative = prefix + entry.name
    if (entry.isDirectory()) return journalBytes(join(directory, entry.name), relative + '/')
    assert.equal(entry.isFile(), true, 'journal fixture contains only owned directories and files: ' + relative)
    return [{path: relative, bytes: readFileSync(join(directory, entry.name)).toString('base64')}]
  })
}

function physicalInquiryEvents(snapshot, inquiryId) {
  return snapshot.filter(file => file.path.endsWith('.ndjson')).flatMap(file =>
    Buffer.from(file.bytes, 'base64').toString('utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)))
    .filter(event => event.event_type === 'sphinx/v2-transition@2' && event.payload.inquiry === inquiryId)
    .sort((left, right) => Number(BigInt(left.payload.revision) - BigInt(right.payload.revision)))
}

function assertHashes(payload, label) {
  for (const field of ['traceHash', 'stateHash', 'semanticHash']) {
    assert.equal(typeof payload[field], 'string', label + '.' + field)
    assert.match(payload[field], /^[a-f0-9]{64}$/, label + '.' + field)
  }
}

function assertCreation(payload, goalText, label) {
  for (const field of ['inquiryId', 'eventId']) {
    assert.equal(typeof payload[field], 'string', label + '.' + field)
    assert.notEqual(payload[field].trim(), '', label + '.' + field)
  }
  assert.equal(payload.revision, '0', label + '.original revision')
  assert.equal(payload.status, 'active', label + '.status')
  assert.equal(payload.advance.outcome, 'no-runnable-work', label + '.advance')
  assert.equal(typeof payload.advance.detail, 'string', label + '.advance.detail')
  assert.notEqual(payload.advance.detail.trim(), '', label + '.advance.detail')
  assert.notEqual(goalText.trim(), '')
}

async function readInquiry(session, creation, goalText, label) {
  const before = journalBytes(session.commonDir)
  const status = mcpBusiness(await session.callTool('sphinx_inquiry_status', {inquiryId: creation.inquiryId}, label + '.status'), 'read', label + '.status')
  assert.equal(status.inquiryId, creation.inquiryId, label + '.inquiryId')
  assert.equal(typeof status.revision, 'string', label + '.revision')
  assert.equal(status.inquiry.goal.originalText, goalText, label + '.original goal bytes')
  assert.deepEqual(Buffer.from(status.inquiry.goal.originalText), Buffer.from(goalText), label + '.UTF8 goal bytes')
  assert.equal(plainObject(status.inquiry.goal), true, label + '.native goal DTO')
  const summary = mcpBusiness(await session.callTool('sphinx_inquiry_export', {inquiryId: creation.inquiryId, mode: 'summary'}, label + '.summary'), 'exported', label + '.summary')
  assert.equal(summary.mode, 'summary', label + '.summary mode')
  assert.equal(summary.replayability, 'summary-only', label + '.summary replayability')
  assert.deepEqual(summary.inquiry, status.inquiry, label + '.summary semantic view')
  assertHashes(summary, label + '.summary')
  const full = mcpBusiness(await session.callTool('sphinx_inquiry_export', {inquiryId: creation.inquiryId, mode: 'full'}, label + '.full'), 'exported', label + '.full')
  assert.equal(full.mode, 'full', label + '.full mode')
  assert.equal(full.replayability, 'requires-external-inputs', label + '.full replayability')
  assert.equal(full.externalInputsComplete, false, label + '.full does not claim all external inputs are available')
  assert.equal(typeof full.replayabilityReason, 'string', label + '.full replayability reason')
  assert.notEqual(full.replayabilityReason.trim(), '', label + '.full names the remaining external input boundary')
  assert.equal(Array.isArray(full.externalInputs), true, label + '.explicit external inputs')
  assert.equal(Array.isArray(full.events), true, label + '.canonical events')
  assertHashes(full, label + '.full')
  for (const field of ['traceHash', 'stateHash', 'semanticHash']) assert.equal(full[field], summary[field], label + '.same accepted head ' + field)
  const events = physicalInquiryEvents(before, creation.inquiryId)
  assert.ok(events.length > 0, label + '.creation really persisted')
  assert.deepEqual(full.events, events, label + '.full exports actual canonical origin-to-head envelopes')
  assert.equal(full.events[0].event_id, creation.eventId, label + '.origin receipt')
  assert.equal(full.events[0].payload.events[0].case, 'InquiryCreated', label + '.creation event')
  assert.equal(full.events[0].payload.events[0].payload.goal.originalText, goalText, label + '.stored goal bytes')
  const created = full.events[0].payload.events[0].payload
  assert.deepEqual(full.externalInputs, [
    {kind: 'startup-configuration', ref: created.configHash},
    ...created.goal.materialRefs.map(ref => ({kind: 'material', ref})),
  ], label + '.external inputs bind actual creation configuration and material references')
  assert.deepEqual(journalBytes(session.commonDir), before, label + '.status/export do not write journal bytes')
  return {status, summary, full}
}

test('WHAT[sphinx-v2-036] configured real stdio start persists byte-exact goals and content-bound receipts, while native reads survive a new OS server', async t => {
  const commonDir = mkdtempSync(join(tmpdir(), 'sphinx-mcp-durable-start-'))
  const goals = ['第一目标\r\n空值:\u0000；café 😀 尾部  ', '第二目标\r\n空值:\u0000；naïve 雪 尾部  ']
  const commands = goals.map((goalText, index) => ({
    commandId: 'stdio-create-' + index, goalText, constraints: ['keep the supplied text'],
    materialRefs: ['material:原始-' + index], authorizationRef: 'authorized-user', profileRef: 'sphinx.default@2',
  }))
  const creations = []
  let acceptedReads
  let sharedHandle
  let completed = false
  try {
    await withSphinxStdio(t, async session => {
      const before = journalBytes(commonDir)
      for (const [index, command] of commands.entries()) {
        const creation = mcpBusiness(await session.callTool('sphinx_inquiry_start', command, 'start.' + index), 'created', 'start.' + index)
        assertCreation(creation, goals[index], 'start.' + index)
        creations.push(creation)
      }
      assert.notEqual(creations[0].inquiryId, creations[1].inquiryId, 'distinct commands create distinct inquiries')
      assert.notDeepEqual(journalBytes(commonDir), before, 'positive control: actual creation changes journal bytes')
      sharedHandle = Wire.create(commonDir, 'stdio-js-writer', startConfig)
      for (const [index, command] of commands.entries()) {
        const creation = creations[index]
        const receipt = mcpBusiness(await session.callTool('sphinx_inquiry_start', command, 'start.repeat.' + index), 'replayed', 'start.repeat.' + index)
        for (const field of ['inquiryId', 'revision', 'eventId']) assert.equal(receipt[field], creation[field], 'exact repeat keeps original ' + field)
        const frozen = journalBytes(commonDir)
        for (const [field, value] of [
          ['goalText', command.goalText + '!'], ['constraints', ['a changed constraint']],
          ['materialRefs', ['material:changed']], ['profileRef', 'different-profile'], ['authorizationRef', 'different-user'],
        ]) {
          await expectMcpRefusal(session, 'sphinx_inquiry_start', {...command, [field]: value}, 'COMMAND_CONFLICT', 'commandId', 'start.conflict.' + field)
          assert.deepEqual(journalBytes(commonDir), frozen, 'conflicting ' + field + ' does not change durable bytes')
        }
      }
      const first = await readInquiry(session, creations[0], goals[0], 'first.goal')
      const second = await readInquiry(session, creations[1], goals[1], 'second.goal')
      const beforeJsReads = journalBytes(commonDir)
      assert.deepEqual(wireBusiness(Wire.status(sharedHandle, {inquiryId: creations[0].inquiryId}), 'read', 'JS reads MCP creation'), first.status, 'JS and MCP resolve the same canonical status')
      for (const mode of ['summary', 'full']) {
        assert.deepEqual(wireBusiness(Wire.exportInquiry(sharedHandle, {inquiryId: creations[0].inquiryId, mode}), 'exported', 'JS reads MCP ' + mode), first[mode], 'JS and MCP export the same accepted ' + mode)
      }
      assert.deepEqual(journalBytes(commonDir), beforeJsReads, 'JS status/export over MCP creation do not write journal bytes')
      const thirdGoal = 'JS 创建的第三目标\r\n边界:\u0000 雪 😀 尾部  '
      const thirdCommand = {...commands[0], commandId: 'js-create-third', goalText: thirdGoal, materialRefs: ['material:JS-原始']}
      const beforeJsCreation = journalBytes(commonDir)
      const third = wireBusiness(await Wire.start(sharedHandle, thirdCommand), 'created', 'JS actual third creation')
      assertCreation(third, thirdGoal, 'JS actual third creation')
      assert.ok(creations.every(creation => creation.inquiryId !== third.inquiryId), 'JS creates a distinct third inquiry in the shared owner')
      assert.notDeepEqual(journalBytes(commonDir), beforeJsCreation, 'positive control: JS start changes the shared journal bytes')
      const thirdReads = await readInquiry(session, third, thirdGoal, 'MCP.refresh.JS-creation')
      const beforeSharedReads = journalBytes(commonDir)
      assert.deepEqual(wireBusiness(Wire.status(sharedHandle, {inquiryId: third.inquiryId}), 'read', 'JS third status'), thirdReads.status, 'MCP refreshes the canonical inquiry created through JS')
      for (const mode of ['summary', 'full']) {
        assert.deepEqual(wireBusiness(Wire.exportInquiry(sharedHandle, {inquiryId: third.inquiryId, mode}), 'exported', 'JS third ' + mode), thirdReads[mode], 'MCP and JS share third inquiry ' + mode)
      }
      assert.deepEqual(journalBytes(commonDir), beforeSharedReads, 'cross-surface reads keep the same durable bytes')
      assert.equal(first.full.events.length, second.full.events.length, 'same-length trace comparison')
      for (const field of ['traceHash', 'stateHash', 'semanticHash']) assert.notEqual(first.full[field], second.full[field], 'different goal content changes ' + field)
      assert.deepEqual(await readInquiry(session, creations[0], goals[0], 'first.repeat'), first, 'same accepted facts yield the same native reads')
      const beforeCancel = journalBytes(commonDir)
      const cancelled = mcpBusiness(await session.callTool('sphinx_inquiry_cancel', {
        commandId: 'stdio-cancel', inquiryId: creations[0].inquiryId, reason: 'authorized stop',
      }, 'cancel.first'), 'applied', 'cancel.first')
      assert.equal(cancelled.inquiryId, creations[0].inquiryId)
      assert.equal(cancelled.revision, '1')
      assert.notDeepEqual(journalBytes(commonDir), beforeCancel, 'positive control: actual cancellation changes journal bytes')
      const afterCancel = await readInquiry(session, creations[0], goals[0], 'first.cancelled')
      assert.equal(afterCancel.status.revision, '1')
      assert.equal(afterCancel.status.status, 'cancelling', 'unconfirmed cancellation is not a drained fact')
      assert.equal(afterCancel.full.events.length, 2)
      assert.deepEqual(afterCancel.full.events[1].parents, [creations[0].eventId], 'accepted trace follows its actual parent')
      for (const field of ['traceHash', 'stateHash']) assert.notEqual(afterCancel.full[field], first.full[field], 'actual cancellation changes ' + field)
      assert.equal(afterCancel.full.semanticHash, first.full.semanticHash, 'cancellation control history does not change the semantic facts')
      assert.deepEqual(afterCancel.status.inquiry, first.status.inquiry, 'cancellation leaves the original semantic projection unchanged')
      const beforeJsRefresh = journalBytes(commonDir)
      assert.deepEqual(wireBusiness(Wire.status(sharedHandle, {inquiryId: creations[0].inquiryId}), 'read', 'JS.refresh.MCP-cancellation'), afterCancel.status, 'JS refresh sees MCP cancellation status and revision')
      for (const mode of ['summary', 'full']) {
        assert.deepEqual(wireBusiness(Wire.exportInquiry(sharedHandle, {inquiryId: creations[0].inquiryId, mode}), 'exported', 'JS.refresh.MCP-cancellation.' + mode), afterCancel[mode], 'JS refresh sees the current accepted cancellation ' + mode)
      }
      assert.deepEqual(journalBytes(commonDir), beforeJsRefresh, 'JS refresh over MCP cancellation writes no journal bytes')
      const replay = mcpBusiness(await session.callTool('sphinx_inquiry_start', commands[0], 'start.repeat.after-cancel'), 'replayed', 'start.repeat.after-cancel')
      for (const field of ['inquiryId', 'revision', 'eventId']) assert.equal(replay[field], creations[0][field], 'later revision does not change the original start ' + field)
      assert.equal(replay.revision, '0')
      acceptedReads = [afterCancel, second]
    }, {commonDir, startConfig})
    await withSphinxStdio(t, async session => {
      for (const [index, command] of commands.entries()) {
        assert.deepEqual(await readInquiry(session, creations[index], goals[index], 'cold.' + index), acceptedReads[index], 'new OS process replays the original native facts')
        const beforeReplay = journalBytes(commonDir)
        const replay = mcpBusiness(await session.callTool('sphinx_inquiry_start', command, 'cold.start.repeat.' + index), 'replayed', 'cold.start.repeat.' + index)
        for (const field of ['inquiryId', 'revision', 'eventId']) assert.equal(replay[field], creations[index][field], 'cold replay retains original ' + field)
        assert.deepEqual(journalBytes(commonDir), beforeReplay, 'cold exact replay does not append another creation')
      }
    }, {commonDir, startConfig})
    await withSphinxStdio(t, async session => {
      const beforeConflict = journalBytes(commonDir)
      await expectMcpRefusal(session, 'sphinx_inquiry_start', commands[0], 'COMMAND_CONFLICT', 'commandId', 'cold.changed-startup-config')
      assert.deepEqual(journalBytes(commonDir), beforeConflict, 'changed startup configuration cannot rewrite the original command')
      assert.deepEqual(await readInquiry(session, creations[0], goals[0], 'changed-config.read'), acceptedReads[0], 'read resolves the durable original configuration')
    }, {commonDir, startConfig: {...startConfig, resourceSpecs: [{...startConfig.resourceSpecs[0], authorizedLimit: 1}]}})
    completed = true
  } finally {
    if (sharedHandle) Wire.dispose(sharedHandle)
    if (completed) rmSync(commonDir, {recursive: true, force: true})
    else t.diagnostic('N06_A_FAILURE_EVIDENCE: shared durable directory retained at ' + commonDir)
  }
})

for (const operation of ['start', 'cancel']) {
  test(`WHAT[sphinx-v2-036] actual_${operation}_release_failure_is_a_terminal_unknown_with_its_original_command`, async t => {
    const commonDir = realpathSync(mkdtempSync(join(tmpdir(), 'sphinx-settlement-')))
    const loader = fileURLToPath(new URL('./settlement-release-loader.mjs', import.meta.url))
    const command = {commandId: 'positive-start', goalText: '初始事实\r\n雪 尾部  ', constraints: [],
      materialRefs: [], authorizationRef: 'user', profileRef: startConfig.profileRef}
    let failedReply
    let evidence
    let exported
    let last
    let closed = false
    try {
      await withSphinxStdio(t, async session => {
        const first = mcpBusiness(await session.callTool('sphinx_inquiry_start', command, 'positive.start'), 'created', 'positive.start')
        const commandId = 'uncertain-' + operation
        writeFileSync(join(commonDir, 'settlement-arm.json'), JSON.stringify({commandId}))
        failedReply = await session.callTool(operation === 'start' ? 'sphinx_inquiry_start' : 'sphinx_inquiry_cancel',
          operation === 'start' ? {...command, commandId, goalText: '新的真实事实\r\n尾部  '}
            : {commandId, inquiryId: first.inquiryId, reason: 'authorized stop'}, 'uncertain.' + operation)
        evidence = JSON.parse(readFileSync(join(commonDir, 'settlement-release.json'), 'utf8'))
        assert.equal(evidence.releaseCalls, 1)
        assert.equal(evidence.lockReleased, true)
        assert.notEqual(evidence.pid, process.pid)
        assert.equal(existsSync(join(commonDir, 'wanxiangshu.lock')), false)
        assert.equal(readFileSync(evidence.sourceFile, 'base64'), evidence.bytes)
        const lines = Buffer.from(evidence.bytes, 'base64').toString('utf8').trimEnd().split('\n').map(JSON.parse)
        assert.equal(lines.length, 2, 'Only the positive control and one failed invocation append; no automatic retry')
        last = lines.at(-1)
        assert.equal(last.payload.commandId, commandId)
        assert.equal(last.payload.events[0].case, operation === 'start' ? 'InquiryCreated' : 'CancelRequested')
        exported = mcpBusiness(await session.callTool('sphinx_inquiry_export', {inquiryId: last.payload.inquiry, mode: 'full'},
          'uncertain.export'), 'exported', 'uncertain.export')
        assert.equal(exported.events.at(-1).event_id, last.event_id)
      }, {commonDir, startConfig, importModule: loader})
      closed = true
      const coldWriter = randomUUID()
      const cold = Wire.create(commonDir, coldWriter, null)
      try {
        assert.deepEqual(Wire.exportInquiry(cold, {inquiryId: last.payload.inquiry, mode: 'full'}), exported)
        assert.equal(existsSync(join(commonDir, 'wanxiangshu', 'events', `${coldWriter}.ndjson`)), false)
        assert.equal(readFileSync(evidence.sourceFile, 'base64'), evidence.bytes)
      } finally { Wire.dispose(cold) }
      t.diagnostic(JSON.stringify({operation, physicalAndCold: true, sourcePid: evidence.pid, coldPid: process.pid}))
      const refusal = mcpRefusal(failedReply, 'actual Release uncertainty')
      assert.equal(refusal.code, 'COMMIT_UNKNOWN')
      assert.equal(refusal.path, 'inquiryId')
      for (const identity of [last.payload.inquiry, last.payload.commandId, last.event_id, evidence.cause]) {
        assert.ok(refusal.message.includes(identity), identity)
      }
      assert.match(refusal.message, /Reconcile the durable record before any retry/)
    } finally {
      if (closed) rmSync(commonDir, {recursive: true, force: true})
      else t.diagnostic('SPHINX_SETTLEMENT_FAILURE_EVIDENCE: retained ' + commonDir)
    }
  })
}

test.todo('WHAT[sphinx-v2-036] registered writable MCP tools drive durable creation, work claim, result admission and authorized goal amendment through the single runtime')
test.todo('WHAT[sphinx-v2-036] status/export over real stdio read an existing inquiry without creating leases, calling models or changing business state; receipts and dispatch observers need positive controls')
