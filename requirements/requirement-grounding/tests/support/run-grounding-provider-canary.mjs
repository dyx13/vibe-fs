import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ProcessHost } from '../../../verification-system/tests/e2e/support/process-host.js'
import { EventProbe } from '../../../verification-system/tests/e2e/support/event-probe.js'
import { initGitWorkspace, OPENCODE_BIN } from '../../../verification-system/tests/e2e/support/process-host-utils.js'
import { buildTextChunks, buildToolCallChunks, sendJSON, sendSSE } from '../../../verification-system/tests/e2e/support/strict-mock-sse.js'
import { startHttpServer, stopHttpServer } from '../../../verification-system/tests/e2e/support/strict-mock-server.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../../..')
const version = '1.18.29'
const marker = 'GROUNDING_OWNER_PROVIDER_SERIALIZATION_CANARY'
const separator = '\0\uFEFF'
const materialPath = 'requirements/alpha/WHAT.md'
const sourceBytes = 'SOURCE 中文 😀\r\nsecond line\r\n'
const oldBody = 'OLD MATERIAL\r\nold tail  '
const guideResource = fs.readFileSync(path.join(root, 'resources/provider/host/pair-programming-guideline/zh-CN.md'), 'utf8')
const expectedGuidance = guideResource.trim().replace(/\r\n?/g, '\n').split('\n')
  .map(line => line ? `# ${line}` : '#').join('\n') + '\n'
const carrier = body => `${body}\n\nrequirement_source_path = "${materialPath}"\n`
const newBody = `\uFEFF中文 😀\r\nblank follows\r\n\r\nbare\rtail  \0inside\0\uFEFF\r\n${separator}${expectedGuidance}\r\n${separator}${carrier(oldBody)}`
const bodies = [oldBody, newBody]
const materialDigest = body => createHash('sha256').update(materialPath + '\0' + body).digest('hex')
const callIDs = ['grounding-provider-old', 'grounding-provider-original']
const host = new ProcessHost()
const receipts = []
const requests = []
const callbacks = new Set()
const providerErrors = []
const failures = []
const cleanupErrors = []
const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wanxiang-grounding-provider-evidence-'))
let provider
let scenarioDir
let workspace
let sourcePath
let materialFile
let probe
let timer
let sessionID
let transcript
let journalEvents
let result
let resolveObserved
let rejectObserved
const observed = new Promise((resolve, reject) => { resolveObserved = resolve; rejectObserved = reject })
observed.catch(() => {})
const expectedNative = () => `<path>${sourcePath}</path>\n<type>file</type>\n<content>\n1: SOURCE 中文 😀\n2: second line\n\n(End of file - total 2 lines)\n</content>`
const expectedResult = index => expectedNative() + separator + expectedGuidance + separator + carrier(bodies[index])
const toolResults = body => (body.messages ?? []).filter(message => message.role === 'tool' && callIDs.includes(message.tool_call_id))
const api = async (pathname, body) => {
  const response = await fetch(host.baseUrl + pathname, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-opencode-directory': encodeURIComponent(host.workDir) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  assert.ok(response.ok, `${pathname}: ${response.status} ${text}`)
  return text ? JSON.parse(text) : null
}
const valueOf = response => response?.data?.data ?? response?.data ?? response
const handleProviderRequest = async (request, response) => {
  try {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const bytes = Buffer.concat(chunks)
    if (request.method !== 'POST') {
      sendJSON(response, 200, { object: 'list', data: [] })
      return
    }
    const body = JSON.parse(bytes.toString('utf8'))
    if (request.url === '/collector') {
      receipts.push(body)
      assert.notEqual(body.kind, 'hook-error', `${body.stage}: ${body.name}: ${body.message}`)
      sendJSON(response, 200, { accepted: true })
      return
    }
    const hasRead = (body.tools ?? []).some(tool => (tool.function?.name ?? tool.name) === 'read')
    const hasMarker = (body.messages ?? []).some(message => typeof message.content === 'string' && message.content.includes(marker))
    if (!hasRead || !hasMarker) {
      sendSSE(response, buildTextChunks('grounding-title', 'Grounding serialization canary', 1))
      return
    }
    requests.push({ bytesBase64: bytes.toString('base64'), body })
    assert.ok(requests.length <= 3, 'only two real native read iterations are authorized by the fixture')
    const expectedCount = requests.length - 1
    const wireResults = toolResults(body)
    assert.equal(wireResults.length, expectedCount)
    for (let index = 0; index < expectedCount; index += 1) {
      const matches = wireResults.filter(message => message.tool_call_id === callIDs[index])
      assert.equal(matches.length, 1)
      assert.deepEqual(Buffer.from(matches[0].content), Buffer.from(expectedResult(index)), 'the next actual provider POST must preserve the complete independently expected payload')
    }
    if (requests.length < 3) {
      if (requests.length === 2) fs.writeFileSync(materialFile, newBody, 'utf8')
      sendSSE(response, buildToolCallChunks(callIDs[requests.length - 1], 'read', JSON.stringify({ filePath: sourcePath }), 1))
      return
    }
    sendSSE(response, buildTextChunks('grounding-complete', 'Grounding original bytes captured.', 1))
    resolveObserved()
  } catch (error) {
    providerErrors.push(error)
    rejectObserved(error)
    sendJSON(response, 500, { error: error.message })
  }
}

try {
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'node_modules/opencode-ai/package.json'), 'utf8')).version, version)
  assert.equal(fs.realpathSync(OPENCODE_BIN), fs.realpathSync(path.join(root, 'node_modules/.bin/opencode')))
  provider = await startHttpServer((request, response) => {
    const callback = handleProviderRequest(request, response).catch(error => { providerErrors.push(error); rejectObserved(error) })
    callbacks.add(callback)
    callback.then(() => callbacks.delete(callback))
  })
  scenarioDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wanxiang-grounding-provider-'))
  workspace = path.join(scenarioDir, 'workspace')
  fs.mkdirSync(path.join(workspace, 'requirements/alpha'), { recursive: true })
  fs.mkdirSync(path.join(workspace, 'src'))
  workspace = fs.realpathSync(workspace)
  sourcePath = path.join(workspace, 'src/code.txt')
  materialFile = path.join(workspace, materialPath)
  fs.writeFileSync(sourcePath, sourceBytes, 'utf8')
  fs.writeFileSync(materialFile, oldBody, 'utf8')
  fs.writeFileSync(path.join(workspace, 'requirements/alpha/APPLIES-TO'), '/src/**\n')
  fs.writeFileSync(path.join(evidenceDir, 'oracle.json'), JSON.stringify({
    sourcePath, sourceBytesBase64: Buffer.from(sourceBytes).toString('base64'), expectedNative: expectedNative(),
    guideResourceBytesBase64: Buffer.from(guideResource).toString('base64'), expectedGuidance,
    materials: bodies.map((body, index) => ({
      path: materialPath, bytesBase64: Buffer.from(body).toString('base64'), carrier: carrier(body), expectedResult: expectedResult(index),
      digest: materialDigest(body),
    })),
  }, null, 2))
  await initGitWorkspace(workspace)
  await host.start({
    scenarioDir, providerUrl: `${provider.url}/v1`, pluginPaths: [path.join(here, 'grounding-provider-canary-plugin.mjs')],
    extraEnv: {
      WXS_GROUNDING_CANARY_COLLECTOR: `${provider.url}/collector`, WXS_GROUNDING_CANARY_WORKSPACE: workspace,
      WXS_GROUNDING_CANARY_SOURCE: sourcePath, WXS_GROUNDING_CANARY_DIST: path.join(root, 'dist'),
    },
  })
  assert.equal((await api('/global/health')).version, version)
  probe = new EventProbe(host.baseUrl, host.workDir)
  await probe.connect()
  sessionID = valueOf(await api('/session', { title: 'Grounding original material serialization' })).id
  timer = setTimeout(() => rejectObserved(new Error(`Grounding delivery missing: ${requests.length}/3 provider requests, ${receipts.length} hook receipts`)), 30000)
  await api(`/session/${sessionID}/prompt_async`, {
    messageID: 'msg_grounding_provider_canary', agent: 'engineer', model: { providerID: 'test', modelID: 'test-model' },
    parts: [{ type: 'text', text: marker }],
  })
  await observed
  await probe.awaitEvent(event => event.type === 'session.idle' && event.properties?.sessionID === sessionID, 10000)
  transcript = valueOf(await api(`/session/${sessionID}/message`))
  assert.ok(Array.isArray(transcript))
  const after = receipts.filter(receipt => receipt.kind === 'after')
  const projections = receipts.filter(receipt => receipt.kind === 'projection')
  assert.equal(after.length, 2)
  assert.equal(projections.length, 2)
  const completed = transcript.flatMap(message => message.parts ?? []).filter(part => part.type === 'tool' && callIDs.includes(part.callID))
  assert.equal(completed.length, 2)
  for (let index = 0; index < 2; index += 1) {
    const seen = after.filter(receipt => receipt.input.callID === callIDs[index])
    assert.equal(seen.length, 1)
    assert.equal(seen[0].input.sessionID, sessionID)
    assert.deepEqual(seen[0].input.args, { filePath: sourcePath })
    assert.equal(seen[0].output.output, expectedNative(), 'the after hook records the actual pinned native output without Grounding decoration')
    assert.deepEqual(seen[0].decision, { ok: true, needsGrounding: true, requested: 1, packages: ['alpha'] })
    const sdk = completed.find(part => part.callID === callIDs[index])
    assert.equal(sdk.state.status, 'completed')
    assert.equal(sdk.state.output, seen[0].output.output)
    assert.equal(sdk.state.title, seen[0].output.title)
    assert.deepEqual(sdk.state.input, seen[0].input.args)
    assert.deepEqual(sdk.state.metadata, seen[0].output.metadata)
    assert.equal(projections[index].guidance, expectedGuidance, 'compiled Pair owner must match the independent canonical-resource oracle')
    assert.deepEqual(projections[index].grounded, bodies.slice(0, index + 1)
      .map(body => `${workspace}\0alpha\0${materialPath}\0${materialDigest(body)}`).sort(), 'visible material versions must derive from the raw original bytes')
    const projected = projections[index].projected.flatMap(message => message.parts ?? []).find(part => part.callID === callIDs[index])
    assert.equal(projected.state.output, expectedResult(index), 'compiled production owners must preserve the complete original carrier')
    const delivered = toolResults(requests[index + 1].body).find(message => message.tool_call_id === callIDs[index])
    assert.equal(delivered.content, projected.state.output)
  }
  const eventsDirectory = path.join(workspace, '.git/wanxiangshu/events')
  journalEvents = fs.readdirSync(eventsDirectory).flatMap(name => fs.readFileSync(path.join(eventsDirectory, name), 'utf8').split('\n').filter(Boolean).map(JSON.parse))
  const hostFacts = journalEvents.flatMap(event => {
    const fact = event.payload?.Fact
    return fact?.[0] === 'Agent' && fact[1]?.[0] === 'Host' ? [fact[1][1]] : []
  })
  const occurrences = hostFacts.filter(fact => fact[0] === 'RequirementGroundingAnchored').map(fact => fact[1].Occurrence)
  assert.equal(occurrences.length, 2)
  for (let index = 0; index < 2; index += 1) {
    assert.equal(occurrences[index].Reads.length, 1)
    const read = occurrences[index].Reads[0]
    assert.equal(read.Path, materialPath)
    assert.deepEqual(JSON.parse(read.ArgsJson), { filePath: materialPath })
    assert.deepEqual(Buffer.from(read.ResultBytes), Buffer.from(bodies[index]))
    assert.deepEqual(Buffer.from(read.CursorResultBytes), Buffer.from(carrier(bodies[index])))
  }
  result = {
    version, providerRequests: requests.length, nativeReads: after.length,
    compiledPairAndGroundingOwners: true, independentWholePayloadOracle: true, afterHookMatchesSDK: true,
    nextProviderMatchesProjection: true, originalMaterialBytesPreserved: true, frozenPriorResultPreserved: true,
    nativeByteCoverage: 'PartialFile', scope: 'thin-owner-hooks-and-real-host-serialization', evidenceDir,
  }
} catch (error) {
  failures.push(error)
} finally {
  clearTimeout(timer)
  if (sessionID && transcript === undefined) {
    try { transcript = valueOf(await api(`/session/${sessionID}/message`)) } catch (error) { cleanupErrors.push(error) }
  }
  if (workspace && journalEvents === undefined) {
    const eventsDirectory = path.join(workspace, '.git/wanxiangshu/events')
    if (fs.existsSync(eventsDirectory)) {
      try {
        journalEvents = fs.readdirSync(eventsDirectory).flatMap(name => fs.readFileSync(path.join(eventsDirectory, name), 'utf8').split('\n').filter(Boolean).map(JSON.parse))
      } catch (error) { cleanupErrors.push(error) }
    }
  }
  for (const cleanup of [() => probe?.close(), () => host.stop(), () => provider && stopHttpServer(provider.server), () => Promise.all(callbacks)]) {
    try { await cleanup() } catch (error) { cleanupErrors.push(error) }
  }
  fs.writeFileSync(path.join(evidenceDir, 'hook-receipts.json'), JSON.stringify(receipts, null, 2))
  fs.writeFileSync(path.join(evidenceDir, 'provider-requests.json'), JSON.stringify(requests, null, 2))
  fs.writeFileSync(path.join(evidenceDir, 'sdk-transcript.json'), JSON.stringify(transcript ?? null, null, 2))
  fs.writeFileSync(path.join(evidenceDir, 'journal-events.json'), JSON.stringify(journalEvents ?? null, null, 2))
  fs.writeFileSync(path.join(evidenceDir, 'events.json'), JSON.stringify(probe?.allEvents ?? [], null, 2))
  fs.writeFileSync(path.join(evidenceDir, 'host.stdout.log'), host.stdoutLog)
  fs.writeFileSync(path.join(evidenceDir, 'host.stderr.log'), host.stderrLog)
  try { if (scenarioDir) fs.rmSync(scenarioDir, { recursive: true, force: true }) } catch (error) { cleanupErrors.push(error) }
}
const errors = [...new Set([...failures, ...providerErrors, ...cleanupErrors])]
if (errors.length) console.error(`grounding-provider-canary-failure: ${JSON.stringify({
  evidenceDir, requests: requests.length,
  failures: failures.map(error => ({ name: error.name, message: error.message })),
  providerErrors: providerErrors.map(error => ({ name: error.name, message: error.message })),
  cleanupErrors: cleanupErrors.map(error => ({ name: error.name, message: error.message })),
})}`)
if (errors.length === 1) throw errors[0]
if (errors.length > 1) throw new AggregateError(errors, 'Grounding provider canary failed', { cause: errors[0] })
assert.equal(requests.length, 3, 'shutdown must not conceal additional provider requests')
console.log(`grounding-provider-canary: ${JSON.stringify(result)}`)
