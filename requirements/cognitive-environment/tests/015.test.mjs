import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import * as BloggerChronicleSurface from '../../../dist/OpenCode/Host/BloggerChronicleSurface.js'
import * as ModelRoutingSurface from '../../../dist/OpenCode/Host/ModelRoutingSurface.js'
import * as JournalSurface from '../../../dist/Persistence/Journal/Surface.js'
import * as LanguageSurface from '../../../dist/Participant/Provider/LanguageSurface.js'
import * as CompanionRuntimeSurface from '../../../dist/Context/Companion/RuntimeSurface.js'
import { ordinaryEffects } from '../../../dist/OpenCode/Host/PluginTransformSurface.js'
import { acceptAuthorityRoot, claimBloggerRequest, withExecutablePlugin } from '../../verification-system/tests/support/plugin-fixture.mjs'
import { integrationTest } from '../../verification-system/tests/support/tier-gate.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

integrationTest('WHAT[cognitive-environment-015] installed Host delivers ephemeral Blogger hints in two actual provider requests', () => {
  const output = execFileSync(process.execPath, [join(root, 'requirements/cognitive-environment/tests/support/run-chronicle-provider-canary.mjs')], {
    cwd: root,
    encoding: 'utf8',
    timeout: 45000,
  })
  assert.deepEqual(JSON.parse(output.trim()), { providerRequests: 2, chronicleCompleted: true, historyClean: true, journalClean: true })
})

integrationTest('WHAT[cognitive-environment-015] a late actual provider callback failure cannot turn into a successful canary', () => {
  assert.throws(() => execFileSync(process.execPath, [join(root, 'requirements/cognitive-environment/tests/support/run-chronicle-provider-canary.mjs'), '--late-provider-error'], {
    cwd: root, encoding: 'utf8', timeout: 45000, stdio: 'pipe',
  }), error => {
    assert.equal(error.status, 1)
    assert.match(error.stderr, /SyntaxError/)
    assert.equal(error.stdout.includes('"chronicleCompleted":true'), false, 'failure must not publish a success result')
    return true
  }, 'a malformed actual HTTP request after both Blogger responses must still reject the canary')
})

const bloggerSource = readFileSync(join(root, 'src/Wanxiangshu/OpenCode/Host/BloggerChronicleText.fs'), 'utf8')

const chronicleResourcePath = 'resources/provider/cognitive-environment/blogger-chronicle-text'

const zhResource = readFileSync(join(root, chronicleResourcePath, 'zh-CN.md'), 'utf8').trim()
const enResource = readFileSync(join(root, chronicleResourcePath, 'en.md'), 'utf8').trim()

test('WHAT[cognitive-environment-015] BLOGGER_CHRONICLE_TEXT_has_exact_bilingual_craft', () => {
  assert.match(zhResource, /直接把材料提炼成 charge、occurrence、settlement、consequence，并调用 chronicle/)
  assert.match(
    enResource,
    /Distill the material into charge, occurrence, settlement, and consequence, then call chronicle directly\./,
  )
  // 源码不再内联文案，只引用资源语义路径（provider-language-006 成对叶子）
  assert.match(bloggerSource, /cognitive-environment\/blogger-chronicle-text/)
  assert.doesNotMatch(bloggerSource, /直接把材料提炼成/)
  assert.doesNotMatch(bloggerSource, /Distill the material into/)
})

test('WHAT[cognitive-environment-015] Blogger prose discipline rejects status-report wrappers and demands self-contained evidence', () => {
  const zh = readFileSync(join(root, 'resources/provider/role/blogger/zh-CN.md'), 'utf8')
  const en = readFileSync(join(root, 'resources/provider/role/blogger/en.md'), 'utf8')

  assert.match(zh, /经过分析/)
  assert.match(zh, /最短证据链/)
  assert.match(zh, /自包含/)
  assert.match(zh, /技术判词|判词/)
  assert.match(zh, /可证伪/)
  assert.match(en, /after reviewing/)
  assert.match(en, /shortest evidence chain/)
  assert.match(en, /self-contained/)
  assert.match(en, /verdict backed by evidence/)
  assert.match(en, /falsifiable/)
})

test('WHAT[cognitive-environment-015] BLOGGER_CHRONICLE_TEXT_is_companion_only_ephemeral_assistant_text_injection', () => {
  assert.match(bloggerSource, /SessionAssociationProjection\.isCompanion/)
  assert.match(bloggerSource, /"type", box "text"/)
  assert.match(bloggerSource, /"text", box text/)

  assert.doesNotMatch(bloggerSource, /AgentJournal\.append|appendDurable|GuidelineProjection|tryInject/)
  assert.doesNotMatch(bloggerSource, /PairProgrammingThoughtTransform|systemBlock|"reasoning"|"tool"|"status"|"source"|"synthetic"/)
})

test('WHAT[cognitive-environment-015] BLOGGER_CHRONICLE_TEXT_is_enabled_for_step_3_5_flash_model_prefix', () => {
  const enabledHelper = bloggerSource.match(/let private bloggerChronicleTextEnabled[\s\S]*?\n    let private rawMessageRole/)?.[0]
  assert.ok(enabledHelper, 'Blogger chronicle text model gate must remain a named local decision')
  assert.match(
    bloggerSource,
    /let private bloggerChronicleTextModelPrefixes\s*:\s*string list\s*=\s*\[\s*"step-3\.5-flash"\s*\]/,
  )
  assert.match(enabledHelper, /ModelRouting\.tryReadExecution/)
  assert.match(enabledHelper, /model\.modelID\.StartsWith\(prefix, StringComparison\.Ordinal\)/)
  assert.match(enabledHelper, /List\.exists[\s\S]*bloggerChronicleTextModelPrefixes/)
  assert.doesNotMatch(bloggerSource, /providerID[^\n]*step-3\.5-flash|Contains\([^\n]*step-3\.5-flash/)
})

test('WHAT[cognitive-environment-015] BLOGGER_CHRONICLE_TEXT_is_the_last_semantic_injection_before_sanitize', async () => {
  const effects = await ordinaryEffects(false, false)
  const bloggerIndex = effects.indexOf('chronicle')
  for (const name of ['pair', 'grounding', 'delegation']) {
    const index = effects.indexOf(name)
    assert.ok(index >= 0, `${name} transform must execute`)
    assert.ok(bloggerIndex > index, `Blogger chronicle text must be injected after ${name}`)
  }
  assert.deepEqual(effects.slice(bloggerIndex), ['chronicle', 'deferred', 'sanitize'],
    'only inspection settlement and sanitize may follow the final semantic injection')
})

// ---------------------------------------------------------------------------
// 行为级证据（GAP-077）：经正式登记的 BloggerChronicleSurface 走真实生产入口
// BloggerChronicleText.maybeInject。模型门禁读的是 process-shared ModelRouting
// 的 exact lease，因此测试用隔离 HOME 下的 wanxiangshu.mjs 控制 scheduler 路由
// 结果（与 host-boundary/tests/032 同一手法），journal 是真实 EventStore。
// ---------------------------------------------------------------------------

const schedulerHome = mkdtempSync(join(tmpdir(), 'wanxiangshu-blogger-routing-'))
mkdirSync(join(schedulerHome, '.config', 'opencode'), { recursive: true })
writeFileSync(
  join(schedulerHome, '.config', 'opencode', 'wanxiangshu.mjs'),
  `export const routingProtocol = 2
export const hasTheoreticalCapacity = () => true
export const predictorConfiguration = () => ({ state: 'unconfigured', reason: null })
export default function route() {
  return { model: globalThis.__wanxiangshu_test_blogger_model ?? 'test/step-3.5-flash-canary', reasoning: 'low' }
}
`,
)
const previousHome = process.env.HOME
process.env.HOME = schedulerHome
await ModelRoutingSurface.initialize()
if (previousHome === undefined) {
  delete process.env.HOME
} else {
  process.env.HOME = previousHome
}

const journalDirectory = mkdtempSync(join(tmpdir(), 'wanxiangshu-blogger-journal-'))
const journalBoot = await BloggerChronicleSurface.createJournal(journalDirectory)
assert.ok(journalBoot.ok, 'journal boot must succeed before behavioral cases')

const companionLink = await BloggerChronicleSurface.appendCompanionLink(journalBoot.journal, {
  session: 'ses-blog-main-1',
  bloggerSession: 'ses-blog-blogger-1',
  bloggerAgent: 'blogger',
})
assert.ok(companionLink.ok, 'companion link append must succeed')
assert.equal(companionLink.companion, true, 'linked blogger session must project as companion')

test.after(() => {
  BloggerChronicleSurface.disposeJournal(journalBoot.journal)
})

const acquireLease = async (session, physicalUserMessageId, role = 'blogger', participant = 'chronicler') => {
  const acquisition = await ModelRoutingSurface.acquireSharedExecutionAdmission(
    session,
    physicalUserMessageId,
    role,
    participant,
    null,
    'normal',
  )
  assert.equal(acquisition.kind, 'Acquired', 'shared admission must acquire an exact lease')
  // tryReadExecution observes only committed executions (emr-011
  // accept → acquire → project); the injection model gate reads the
  // committed lease target, so the fixture commits the admission the way
  // production does before the transform runs.
  const committed = ModelRoutingSurface.commitSharedExecutionAdmission(acquisition.lease, {
    sessionId: session,
    physicalUserMessageId,
    role,
    participant: 'chronicler',
    target: ModelRoutingSurface.sharedExecutionAdmissionTarget(acquisition.lease),
  })
  assert.equal(committed.kind, 'Applied', 'shared admission must commit the exact lease')
  return acquisition
}

const frontierUserMessage = (id) => ({
  info: { id, role: 'user' },
  parts: [{ type: 'text', text: '材料已备好，请记账' }],
})

const chronicleMarkerCount = (messages) =>
  messages.filter(
    (m) => m?.info?.role === 'assistant' && m?.parts?.length === 1 && m.parts[0]?.type === 'text' &&
      (m.parts[0]?.text === zhResource || m.parts[0]?.text === enResource),
  ).length

const snapshotJournalTree = (directory) => {
  const entries = {}
  const walk = (dir, prefix) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      const relative = prefix ? `${prefix}/${name}` : name
      if (statSync(full).isDirectory()) {
        walk(full, relative)
      } else {
        entries[relative] = createHash('sha256').update(readFileSync(full)).digest('hex')
      }
    }
  }
  walk(directory, '')
  return entries
}

test('WHAT[cognitive-environment-015] B1_whitelisted_model_prefix_injects_exactly_one_bilingual_hint_before_frontier_user', async () => {
  delete globalThis.__wanxiangshu_test_blogger_model
  const session = 'ses-blog-blogger-1'
  const physical = 'msg-user-b1'
  await acquireLease(session, physical)

  const frontier = frontierUserMessage(physical)
  const outObj = { messages: [frontier] }
  BloggerChronicleSurface.maybeInject(journalBoot.journal, session, 'zh-CN', outObj)

  assert.equal(outObj.messages.length, 2, 'whitelisted lease must inject exactly one message')
  const [marker, user] = outObj.messages
  assert.equal(marker.info.role, 'assistant')
  assert.ok(marker.info.id.startsWith('text-'), 'injected marker id must be the digest-derived text- id')
  assert.equal(marker.parts.length, 1)
  assert.equal(marker.parts[0].type, 'text')
  assert.equal(marker.parts[0].text, zhResource, 'injected text must be the zh-CN provider resource')
  assert.deepEqual(user, frontier, 'frontier user message must survive verbatim after the marker')
})

test('WHAT[cognitive-environment-015] B2_non_whitelisted_model_prefix_performs_zero_injection', async () => {
  globalThis.__wanxiangshu_test_blogger_model = 'test/other-model'
  try {
    const session = 'ses-blog-blogger-1'
    const physical = 'msg-user-b2'
    await acquireLease(session, physical)

    const frontier = frontierUserMessage(physical)
    const outObj = { messages: [frontier] }
    BloggerChronicleSurface.maybeInject(journalBoot.journal, session, 'zh-CN', outObj)

    assert.equal(outObj.messages.length, 1, 'non-whitelisted lease must inject nothing')
    assert.deepEqual(outObj.messages[0], frontier, 'original messages must remain untouched')
  } finally {
    delete globalThis.__wanxiangshu_test_blogger_model
  }
})

test('WHAT[cognitive-environment-015] B3_existing_same_text_assistant_message_is_deduplicated_not_reinjected', async () => {
  delete globalThis.__wanxiangshu_test_blogger_model
  const session = 'ses-blog-blogger-1'
  const physical = 'msg-user-b3'
  await acquireLease(session, physical)

  const frontier = frontierUserMessage(physical)
  const outObj = { messages: [frontier] }
  BloggerChronicleSurface.maybeInject(journalBoot.journal, session, 'zh-CN', outObj)
  assert.equal(chronicleMarkerCount(outObj.messages), 1, 'first injection adds exactly one marker')

  // 同一 outObj 再次经过 transform：既有同文本 assistant 消息被 filter 剔除后
  // 重新插入恰好一条，不产生重复。
  BloggerChronicleSurface.maybeInject(journalBoot.journal, session, 'zh-CN', outObj)
  assert.equal(outObj.messages.length, 2, 'replay must not accumulate duplicate markers')
  assert.equal(chronicleMarkerCount(outObj.messages), 1, 'exactly one chronicle marker survives the replay')
  assert.equal(outObj.messages[1].info.id, physical, 'marker stays before the frontier user message')
})

test('WHAT[cognitive-environment-015] B4_injection_writes_no_durable_persistence', async () => {
  delete globalThis.__wanxiangshu_test_blogger_model
  const session = 'ses-blog-blogger-1'
  const physical = 'msg-user-b4'
  await acquireLease(session, physical)

  const outObj = { messages: [frontierUserMessage(physical)] }
  const before = snapshotJournalTree(journalDirectory)
  BloggerChronicleSurface.maybeInject(journalBoot.journal, session, 'zh-CN', outObj)
  const after = snapshotJournalTree(journalDirectory)

  assert.equal(outObj.messages.length, 2, 'injection itself must still happen')
  assert.deepEqual(after, before, 'journal bytes must be untouched by the injection (no AgentJournal.append)')
})

test('WHAT[cognitive-environment-015] B5_language_binding_selects_the_matching_resource_leaf', async () => {
  delete globalThis.__wanxiangshu_test_blogger_model
  const session = 'ses-blog-blogger-1'
  const physical = 'msg-user-b5'
  await acquireLease(session, physical)

  const outObj = { messages: [frontierUserMessage(physical)] }
  BloggerChronicleSurface.maybeInject(journalBoot.journal, session, 'en', outObj)

  assert.equal(outObj.messages.length, 2)
  const marker = outObj.messages[0]
  assert.equal(marker.info.role, 'assistant')
  assert.equal(marker.parts[0].text, enResource, 'english binding must inject the en resource leaf verbatim')
  assert.notEqual(marker.parts[0].text, zhResource, 'english binding must not fall back to the zh-CN leaf')
})

test('WHAT[cognitive-environment-015] B6_missing_physical_identity_cannot_borrow_the_session_model', async () => {
  const session = 'ses-blog-blogger-1'
  await acquireLease(session, 'msg-user-b6')
  const output = { messages: [{ info: { role: 'user' }, parts: [{ type: 'text', text: 'No physical identity.' }] }] }
  const original = structuredClone(output)
  BloggerChronicleSurface.maybeInject(journalBoot.journal, session, 'en', output)
  assert.deepEqual(output, original, 'an active whitelisted session lease cannot substitute for missing exact request identity')
})

// ---------------------------------------------------------------------------
// GAP-077 补充（registered Host 链）：经真实插件注册的
// experimental.chat.messages.transform 走完整 normalTransform（16 步真实
// capabilities），而非直调 BloggerChronicleSurface.maybeInject。lease 经
// ModelRouting 正式 surface 建立（与 B1—B5 同一 emr-011 accept→acquire→
// project owner 顺序），companion link 经 journal surface 写入
// CompanionBloggerLinked。ModelRouting 是 process singleton，插件二次启动的
// initialize 幂等，路由结果继续由本文件顶部的隔离 HOME 配置驱动
// （globalThis.__wanxiangshu_test_blogger_model）。
//
// The registered transform receives a physical Host history and may replace
// its frontier with a canonical companion projection. Admission and marker
// identity must remain bound to the original physical execution.
// Fixture disposal uses the canonical request release before draining scope episodes.
// ---------------------------------------------------------------------------

const registeredUserMessage = (session, id) => ({
  info: { id, sessionID: session, role: 'user' },
  parts: [{ type: 'text', text: '材料已备好，请记账' }],
})

const appendCompanionBloggerLink = async (runtime, mainSession, bloggerSession) => {
  const linked = await JournalSurface.JournalSurface_appendAgent(
    runtime.journal,
    { kind: 'Session', session: mainSession },
    null,
    {
      family: 'Companion',
      case: 'CompanionBloggerLinked',
      payload: { SessionId: mainSession, BloggerSessionId: bloggerSession, BloggerAgent: 'blogger' },
    },
  )
  assert.ok(
    linked?.ok,
    `companion link append must succeed: ${linked?.error ?? 'unknown error'}`,
  )
}

// Physical-binding admission fixture helper (direction B): replicates the
// production chat.message admission shape. The registered transform's
// normalTransform chain needs two durable facts for the exact (session,
// physical) pair — the Accepted execution the HOST-BOUNDARY-008 plan freeze
// reads, and the exact committed lease the injection model gate reads
// (bloggerChronicleTextEnabled → ModelRouting.tryReadExecution). The
// production entry for both is the same chat.message admission hook: the
// transaction runs Accept → Acquire (ModelRouting.acquireExecutionAdmission
// with the exact frontier physical — the lease binds physical right here) →
// Project → Commit, exactly the emr-011 owner order. No separate surface
// acquire is needed or valid after the admission owns the lease. The
// frontier message itself stays model-free — managed sends carry
// Model=None (dispatch-protocol-010) and the target reaches the mutable
// message only through the admission's Project step — matching the
// context-compression-018 fresh binding shape.
//
// Shape contract (eighth layer): the root physical must stay distinct from
// the chat.message frontier physical (the fixture default `root-<session>`),
// otherwise the ingress classifies the message as a replay of the
// already-accepted root material and the admission transaction never runs.
// context-compression-018's fresh binding case proves this exact shape lands
// the committed lease end-to-end.
const admitExecution = async (runtime, hooks, session, physical) => {
  // sendContinuation (inside the BloggerRequest chain) only continues the
  // exact active run, so the caller needs the durable profile this root
  // installs on the Blogger session. The root physical defaults to
  // `root-<session>` and is deliberately distinct from the chat.message
  // frontier physical (see the eighth-layer note above).
  const profile = await acceptAuthorityRoot(runtime, session, 'blogger')
  await hooks['chat.message'](
    { sessionID: session, messageID: physical },
    {
      message: { id: physical, sessionID: session, role: 'user' },
      parts: [{ type: 'text', text: '材料已备好，请记账' }],
    },
  )
  return profile
}

const chronicleMarkers = (messages) =>
  messages.filter(
    (m) => m?.info?.role === 'assistant' && m?.parts?.length === 1 && m.parts[0]?.type === 'text' &&
      (m.parts[0]?.text === zhResource || m.parts[0]?.text === enResource),
  )

const markerIdFor = (session, physical) =>
  `text-${createHash('sha256').update([session, 'blogger-chronicle-text', physical].join('\u001f')).digest('hex').slice(0, 24)}`

const hostHistoryContainsMarker = (runtime) =>
  runtime.messages.some((message) => {
    const text = JSON.stringify(message?.parts ?? [])
    return text.includes(zhResource) || text.includes(enResource)
  })

const journalTreeContainsMarker = (directory) => {
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        if (walk(full)) return true
      } else {
        const text = readFileSync(full, 'utf8')
        if (text.includes(zhResource) || text.includes(enResource)) return true
      }
    }
    return false
  }
  return walk(join(directory, '.git', 'wanxiang', 'events'))
}

test('WHAT[cognitive-environment-015] registered companion projection keeps the original execution model gate', async () => {
  await withEnglishLanguage(async () => {
    await withExecutablePlugin(async (hooks, directory, _createdIds, runtime) => {
      const session = 'ses-blog-original-execution'
      const physical = 'msg-blog-original-execution'
      const main = 'ses-main-original-execution'
      await appendCompanionBloggerLink(runtime, main, session)
      const profile = await admitExecution(runtime, hooks, session, physical)
      const request = await claimBloggerRequest({
        runtime, mainSession: main, bloggerSession: session, profile,
        dispatchPhysical: 'msg-dispatch-original-execution', requestId: 'req-original-execution',
      })
      let otherRequest
      let requestReleased = false
      const failures = []
      try {
        runtime.pushHostMessage(session, registeredUserMessage(session, physical))
        runtime.pushHostMessage(session, {
          info: { id: 'assistant-original-execution', sessionID: session, parentID: physical,
            role: 'assistant', agent: 'blogger', providerID: 'test', modelID: 'step-3.5-flash-canary',
            time: { created: 2 } },
          parts: [],
        })
        const output = { messages: [registeredUserMessage(session, physical)] }
        await hooks['experimental.chat.messages.transform']({ sessionID: session }, output)
        assert.equal(CompanionRuntimeSurface.currentRequest(request.scope, session)?.requestId,
          'req-original-execution', 'the first-step projection must retain its exact live request')
        assert.notEqual(output.messages.at(-1).info.id, physical, 'the companion projection must actually replace the physical frontier')
        assert.equal(chronicleMarkers(output.messages).length, 1, 'a rendered frontier must still use the admitted physical execution model')
        const firstMarker = chronicleMarkers(output.messages)[0]
        assert.equal(firstMarker.info.id, markerIdFor(session, physical))
        const firstWire = JSON.stringify(output.messages)
        // A new fixture scope resets shared flights, so release this exact
        // owner before constructing the next independently isolated request.
        request.dispose()
        requestReleased = true
        const otherSession = 'ses-blog-other-execution'
        const otherMain = 'ses-main-other-execution'
        await appendCompanionBloggerLink(runtime, otherMain, otherSession)
        const otherProfile = await admitExecution(runtime, hooks, otherSession, physical)
        otherRequest = await claimBloggerRequest({
          runtime, mainSession: otherMain, bloggerSession: otherSession, profile: otherProfile,
          dispatchPhysical: 'msg-dispatch-other-execution', requestId: 'req-other-execution',
        })
        runtime.pushHostMessage(otherSession, registeredUserMessage(otherSession, physical))
        runtime.pushHostMessage(otherSession, {
          info: { id: 'assistant-other-execution', sessionID: otherSession, parentID: physical,
            role: 'assistant', agent: 'blogger', providerID: 'test', modelID: 'step-3.5-flash-canary',
            time: { created: 2 } },
          parts: [],
        })
        const otherOutput = { messages: [registeredUserMessage(otherSession, physical)] }
        await hooks['experimental.chat.messages.transform']({ sessionID: otherSession }, otherOutput)
        assert.equal(CompanionRuntimeSurface.currentRequest(otherRequest.scope, otherSession)?.requestId,
          'req-other-execution', 'the other first-step projection must retain its exact live request')
        const otherMarkers = chronicleMarkers(otherOutput.messages)
        assert.equal(otherMarkers.length, 1)
        assert.equal(otherMarkers[0].info.id, markerIdFor(otherSession, physical))
        assert.notEqual(otherMarkers[0].info.id, firstMarker.info.id, 'another session cannot reuse the first occurrence marker')
        assert.equal(JSON.stringify(output.messages), firstWire, 'another session cannot mutate the first request projection')
        assert.equal(hostHistoryContainsMarker(runtime), false)
        assert.equal(journalTreeContainsMarker(directory), false)
      } catch (error) {
        failures.push(error)
      } finally {
        try {
          otherRequest?.dispose()
        } catch (error) {
          failures.push(error)
        }
        if (!requestReleased) {
          try {
            request.dispose()
          } catch (error) {
            failures.push(error)
          }
        }
      }
      if (failures.length === 1) throw failures[0]
      if (failures.length > 1) throw new AggregateError(failures, 'companion projection and cleanup failures')
    })
  })
})

test('WHAT[cognitive-environment-015] durable marker oracle observes Git-private event bytes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'chronicle-marker-oracle-'))
  try {
    const events = join(directory, '.git', 'wanxiang', 'events')
    mkdirSync(events, { recursive: true })
    const log = join(events, 'all.ndjson')
    writeFileSync(log, '{}\n')
    assert.equal(journalTreeContainsMarker(directory), false)
    writeFileSync(log, enResource)
    assert.equal(journalTreeContainsMarker(directory), true)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

async function withEnglishLanguage(action) {
  const previous = process.env.WANXIANGSHU_PROVIDER_LANGUAGE
  process.env.WANXIANGSHU_PROVIDER_LANGUAGE = 'en'
  LanguageSurface.refreshGlobalLanguage()
  try {
    await action()
  } finally {
    if (previous === undefined) {
      delete process.env.WANXIANGSHU_PROVIDER_LANGUAGE
    } else {
      process.env.WANXIANGSHU_PROVIDER_LANGUAGE = previous
    }
    LanguageSurface.refreshGlobalLanguage()
  }
}

test('WHAT[cognitive-environment-015] R1_registered_transform_injects_one_marker_and_writes_no_durable_history', async () => {
  await withEnglishLanguage(async () => {
    delete globalThis.__wanxiangshu_test_blogger_model
    await withExecutablePlugin(async (hooks, directory, _createdIds, runtime) => {
      const session = 'ses-blog-registered-1'
      const main = 'ses-blog-main-registered-1'
      const physical = 'msg-user-r1'
      await appendCompanionBloggerLink(runtime, main, session)
      // chat.message admission transaction writes the durable Accepted
      // execution (the plan freeze requires it) and acquires + commits the
      // exact physical-bound lease itself (emr-011 owner order; direction B
      // — the model-free frontier shape context-compression-018's fresh
      // binding case proves green through the provider start boundary).
      const profile = await admitExecution(runtime, hooks, session, physical)
      // The durable open BloggerRequest is required by the attempt-plan freeze.
      const bloggerRequest = await claimBloggerRequest({
        runtime,
        mainSession: main,
        bloggerSession: session,
        profile,
        dispatchPhysical: 'msg-dispatch-r1',
        requestId: 'req-blog-r1',
      })
      bloggerRequest.dispose()

      // The exact committed lease the injection model gate reads
      // (bloggerChronicleTextEnabled → ModelRouting.tryReadExecution) is the
      // one the chat.message admission above acquired and committed; no
      // manual acquireLease supplement (after the admission owns the lease,
      // a second surface acquire only walks the idempotent adopt path and
      // its commit observation no longer matches the admission-issued
      // identity).

      // The provider start boundary needs a bindable Host run: the physical
      // user message plus an unsealed assistant child in the runtime snapshot
      // (same shape as context-compression-018's transform fixture). The
      // stubClient does not simulate the real Host publishing the assistant
      // when the provider run starts, so the pair is pushed explicitly.
      runtime.pushHostMessage(session, {
        info: { id: physical, sessionID: session, role: 'user', time: { created: 1 } },
        parts: [{ type: 'text', text: '材料已备好，请记账' }],
      })
      runtime.pushHostMessage(session, {
        info: {
          id: 'assistant-r1',
          sessionID: session,
          parentID: physical,
          role: 'assistant',
          agent: 'blogger',
          providerID: 'fixture',
          modelID: 'fixture-model',
          time: { created: 2 },
        },
        parts: [],
      })

      const outObj = { messages: [structuredClone(registeredUserMessage(session, physical))] }
      await hooks['experimental.chat.messages.transform']({ sessionID: session }, outObj)

      const markers = chronicleMarkers(outObj.messages)
      assert.equal(markers.length, 1, 'registered transform must inject exactly one chronicle marker')
      const marker = markers[0]
      assert.equal(marker.parts[0].text, enResource, 'marker text must be the en leaf under the global language binding')
      assert.equal(marker.info.id, markerIdFor(session, physical), 'the marker identity must bind the original physical execution')
      const markerIndex = outObj.messages.indexOf(marker)
      assert.ok(markerIndex >= 0)
      assert.equal(
        outObj.messages[markerIndex + 1],
        outObj.messages.at(-1),
        'the marker must sit immediately before the final projected frontier',
      )

      // WHAT 015：提示只作用于当次转换，不写入日志或历史。transform 修改的
      // 是 provider wire 投影 outObj；Host 持久历史（stubClient messages）与
      // journal 字节都不得出现 marker 文本。
      assert.equal(hostHistoryContainsMarker(runtime), false, 'Host persisted history must not contain the marker')
      assert.equal(journalTreeContainsMarker(directory), false, 'journal bytes must not contain the marker')
    })
  })
})

test('WHAT[cognitive-environment-015] R2_registered_transform_non_companion_session_injects_nothing', async () => {
  await withEnglishLanguage(async () => {
    delete globalThis.__wanxiangshu_test_blogger_model
    await withExecutablePlugin(async (hooks, _directory, _createdIds, runtime) => {
      const session = 'ses-blog-registered-2'
      const physical = 'msg-user-r2'
      await admitExecution(runtime, hooks, session, physical)

      // Bindable Host run for the provider start boundary (same shape as
      // context-compression-018's transform fixture).
      runtime.pushHostMessage(session, {
        info: { id: physical, sessionID: session, role: 'user', time: { created: 1 } },
        parts: [{ type: 'text', text: '材料已备好，请记账' }],
      })
      runtime.pushHostMessage(session, {
        info: {
          id: 'assistant-r2',
          sessionID: session,
          parentID: physical,
          role: 'assistant',
          agent: 'blogger',
          providerID: 'fixture',
          modelID: 'fixture-model',
          time: { created: 2 },
        },
        parts: [],
      })

      const outObj = { messages: [structuredClone(registeredUserMessage(session, physical))] }
      await hooks['experimental.chat.messages.transform']({ sessionID: session }, outObj)

      assert.equal(chronicleMarkers(outObj.messages).length, 0, 'a non-companion session must receive no chronicle marker')
    })
  })
})

test('WHAT[cognitive-environment-015] R3_registered_transform_replays_same_occurrence_without_duplicate_markers', async () => {
  await withEnglishLanguage(async () => {
    delete globalThis.__wanxiangshu_test_blogger_model
    await withExecutablePlugin(async (hooks, directory, _createdIds, runtime) => {
      const session = 'ses-blog-registered-3'
      const main = 'ses-blog-main-registered-3'
      const physical = 'msg-user-r3'
      await appendCompanionBloggerLink(runtime, main, session)
      const profile = await admitExecution(runtime, hooks, session, physical)
      // The durable open request feeds the companion attempt-plan freeze.
      const bloggerRequest = await claimBloggerRequest({
        runtime,
        mainSession: main,
        bloggerSession: session,
        profile,
        dispatchPhysical: 'msg-dispatch-r3',
        requestId: 'req-blog-r3',
      })
      bloggerRequest.dispose()
      runtime.pushHostMessage(session, {
        info: { id: physical, sessionID: session, role: 'user', time: { created: 1 } },
        parts: [{ type: 'text', text: '材料已备好，请记账' }],
      })
      runtime.pushHostMessage(session, {
        info: {
          id: 'assistant-r3',
          sessionID: session,
          parentID: physical,
          role: 'assistant',
          agent: 'blogger',
          providerID: 'fixture',
          modelID: 'fixture-model',
          time: { created: 2 },
        },
        parts: [],
      })

      const outObj = { messages: [structuredClone(registeredUserMessage(session, physical))] }
      await hooks['experimental.chat.messages.transform']({ sessionID: session }, outObj)
      const first = chronicleMarkers(outObj.messages)
      assert.equal(first.length, 1, 'the first pass injects exactly one marker')

      // Host replays the same physical occurrence from its original history,
      // not from the earlier request's canonical provider projection.
      outObj.messages = [registeredUserMessage(session, physical)]
      await hooks['experimental.chat.messages.transform']({ sessionID: session }, outObj)
      const replayed = chronicleMarkers(outObj.messages)
      assert.equal(replayed.length, 1, 'replay must not accumulate duplicate markers')
      assert.equal(replayed[0].info.id, first[0].info.id, 'the same occurrence keeps its digest-derived id stable')
      assert.equal(
        outObj.messages[outObj.messages.indexOf(replayed[0]) + 1],
        outObj.messages.at(-1),
        'the marker must stay immediately before the projected frontier after replay',
      )
      assert.equal(hostHistoryContainsMarker(runtime), false, 'Host replay cannot persist an earlier request hint')
      assert.equal(journalTreeContainsMarker(directory), false, 'canonical capture cannot retain an earlier request hint')
    })
  })
})

test('WHAT[cognitive-environment-015] R4_registered_transform_followup_request_history_boundary', async () => {
  await withEnglishLanguage(async () => {
    delete globalThis.__wanxiangshu_test_blogger_model
    await withExecutablePlugin(async (hooks, directory, _createdIds, runtime) => {
      const session = 'ses-blog-registered-4'
      const main = 'ses-blog-main-registered-4'
      await appendCompanionBloggerLink(runtime, main, session)

      // 第一条物理 user 消息：Host 持久化它，chat.message admission 为它
      // 建立 exact lease（direction B：admission transaction 自带
      // acquire + commit，与生产 emr-011 顺序一致）。
      const physicalOne = 'msg-user-r4-1'
      const userOne = registeredUserMessage(session, physicalOne)
      runtime.pushHostMessage(session, structuredClone(userOne))
      const profile = await admitExecution(runtime, hooks, session, physicalOne)
      // The durable open request feeds the companion attempt-plan freeze.
      const bloggerRequest = await claimBloggerRequest({
        runtime,
        mainSession: main,
        bloggerSession: session,
        profile,
        dispatchPhysical: 'msg-dispatch-r4',
        requestId: 'req-blog-r4',
      })
      bloggerRequest.dispose()

      // Bindable Host run for the first provider request's start boundary
      // (same shape as context-compression-018's transform fixture).
      runtime.pushHostMessage(session, {
        info: {
          id: 'assistant-r4-1',
          sessionID: session,
          parentID: physicalOne,
          role: 'assistant',
          agent: 'blogger',
          providerID: 'fixture',
          modelID: 'fixture-model',
          time: { created: 2 },
        },
        parts: [],
      })

      const firstRequest = { messages: [structuredClone(userOne)] }
      await hooks['experimental.chat.messages.transform']({ sessionID: session }, firstRequest)
      const firstMarkers = chronicleMarkers(firstRequest.messages)
      assert.equal(firstMarkers.length, 1, 'the first provider request carries its marker')
      const firstMarkerId = firstMarkers[0].info.id

      // 注入没有污染任何持久位置：Host 历史与 journal 都不含 marker 文本。
      assert.equal(hostHistoryContainsMarker(runtime), false, 'Host persisted history stays free of the injected marker')
      assert.equal(journalTreeContainsMarker(directory), false, 'journal bytes stay free of the injected marker')

      // 后续请求：Host 从持久历史构建 wire 输入——历史里只有原始 user 消息，
      // 上一次注入的 marker 不出现在下一请求的输入中。
      const physicalTwo = 'msg-user-r4-2'
      const userTwo = registeredUserMessage(session, physicalTwo)
      // The second admission supersedes the first physical's lease — that
      // atomic replacement is exactly the history boundary under test.
      await admitExecution(runtime, hooks, session, physicalTwo)
      // Bindable Host run for the follow-up request's start boundary.
      runtime.pushHostMessage(session, structuredClone(userTwo))
      runtime.pushHostMessage(session, {
        info: {
          id: 'assistant-r4-2',
          sessionID: session,
          parentID: physicalTwo,
          role: 'assistant',
          agent: 'blogger',
          providerID: 'fixture',
          modelID: 'fixture-model',
          time: { created: 4 },
        },
        parts: [],
      })

      const secondRequest = { messages: [structuredClone(userOne), structuredClone(userTwo)] }
      assert.equal(
        chronicleMarkers(secondRequest.messages).length,
        0,
        'the next request input must not carry the previous request marker',
      )

      await hooks['experimental.chat.messages.transform']({ sessionID: session }, secondRequest)
      const secondMarkers = chronicleMarkers(secondRequest.messages)
      assert.equal(secondMarkers.length, 1, 'the follow-up request injects exactly one fresh marker')
      assert.notEqual(secondMarkers[0].info.id, firstMarkerId, 'a new occurrence derives a new marker id')
      const markerIndex = secondRequest.messages.indexOf(secondMarkers[0])
      assert.equal(
        secondRequest.messages[markerIndex + 1],
        secondRequest.messages.at(-1),
        'the fresh marker precedes the final projected frontier',
      )
      assert.equal(
        secondMarkers[0].info.id,
        markerIdFor(session, physicalTwo),
        'the new marker identity must use the new physical execution, not its rendered projection',
      )
      assert.equal(hostHistoryContainsMarker(runtime), false)
      assert.equal(journalTreeContainsMarker(directory), false)
    })
  })
})

test('WHAT[cognitive-environment-015] R5_registered_transform_without_committed_lease_fails_closed_at_execution_admission', async () => {
  await withEnglishLanguage(async () => {
    delete globalThis.__wanxiangshu_test_blogger_model
    await withExecutablePlugin(async (hooks, _directory, _createdIds, runtime) => {
      const session = 'ses-blog-registered-5'
      const main = 'ses-blog-main-registered-5'
      await appendCompanionBloggerLink(runtime, main, session)

      // companion 成立但没有 exact committed lease：host-boundary-008 的模型
      // 门禁读不到本请求的模型身份，绝不借用其它执行的 current model。
      // Accepted 执行仍先建立——被测的是 lease 缺席，不是 Accepted 缺席。
      const physical = 'msg-user-r5'
      const profile = await admitExecution(runtime, hooks, session, physical)
      // The durable open request feeds the companion attempt-plan freeze.
      const bloggerRequest = await claimBloggerRequest({
        runtime,
        mainSession: main,
        bloggerSession: session,
        profile,
        dispatchPhysical: 'msg-dispatch-r5',
        requestId: 'req-blog-r5',
      })
      bloggerRequest.dispose()

      // Bindable Host run for the provider start boundary (same shape as R1);
      // the pair is present so the only missing precondition is the committed
      // lease itself.
      runtime.pushHostMessage(session, {
        info: { id: physical, sessionID: session, role: 'user', time: { created: 1 } },
        parts: [{ type: 'text', text: '材料已备好，请记账' }],
      })
      runtime.pushHostMessage(session, {
        info: {
          id: 'assistant-r5',
          sessionID: session,
          parentID: physical,
          role: 'assistant',
          agent: 'blogger',
          providerID: 'fixture',
          modelID: 'fixture-model',
          time: { created: 2 },
        },
        parts: [],
      })

      // Retire only the admission-issued lease; durable Accepted remains.
      const released = ModelRoutingSurface.releasePhysical(session, physical)
      assert.ok(
        released?.kind === 'Applied' || released?.kind === 'AlreadyApplied',
        'the exact lease must be settled away before the transform runs',
      )

      const outObj = { messages: [structuredClone(registeredUserMessage(session, physical))] }
      await assert.rejects(
        () => hooks['experimental.chat.messages.transform']({ sessionID: session }, outObj),
        (error) => {
          assert.match(
            String(error?.message ?? error),
            /EMR-010: managed provider step for physical user message msg-user-r5 has no committed model-routing lease/,
            'the exact execution admission boundary must reject before any projection or injection',
          )
          return true
        },
        'a companion transform without a committed exact lease must fail closed instead of completing quietly',
      )
      assert.equal(chronicleMarkers(outObj.messages).length, 0, 'a rejected transform must inject no chronicle marker')
    })
  })
})

test('WHAT[cognitive-environment-015] R6_registered_transform_non_whitelisted_model_injects_nothing', async () => {
  await withEnglishLanguage(async () => {
    globalThis.__wanxiangshu_test_blogger_model = 'test/other-model'
    try {
      await withExecutablePlugin(async (hooks, _directory, _createdIds, runtime) => {
        const session = 'ses-blog-registered-6'
        const main = 'ses-blog-main-registered-6'
        const physical = 'msg-user-r6'
        await appendCompanionBloggerLink(runtime, main, session)
        const profile = await admitExecution(runtime, hooks, session, physical)
        // The durable open request feeds the companion attempt-plan freeze.
        const bloggerRequest = await claimBloggerRequest({
          runtime,
          mainSession: main,
          bloggerSession: session,
          profile,
          dispatchPhysical: 'msg-dispatch-r6',
          requestId: 'req-blog-r6',
        })
        bloggerRequest.dispose()
        // The chat.message admission commits the exact lease; the scheduler
        // routes that admission to the non-whitelisted model via
        // __wanxiangshu_test_blogger_model, so the whitelist half of the
        // injection gate is the only reason this case injects nothing.

      const outObj = { messages: [structuredClone(registeredUserMessage(session, physical))] }
      // The provider start boundary needs a bindable Host run: the physical
      // user message plus an unsealed assistant child in the runtime snapshot
      // (same shape as context-compression-018's transform fixture).
      runtime.pushHostMessage(session, {
        info: { id: physical, sessionID: session, role: 'user', time: { created: 1 } },
        parts: [{ type: 'text', text: '材料已备好，请记账' }],
      })
      runtime.pushHostMessage(session, {
        info: {
          id: 'assistant-r6',
          sessionID: session,
          parentID: physical,
          role: 'assistant',
          agent: 'blogger',
          providerID: 'fixture',
          modelID: 'fixture-model',
          time: { created: 2 },
        },
        parts: [],
      })
      await hooks['experimental.chat.messages.transform']({ sessionID: session }, outObj)

        assert.equal(chronicleMarkers(outObj.messages).length, 0, 'a non-whitelisted lease target must not inject')
      })
    } finally {
      delete globalThis.__wanxiangshu_test_blogger_model
    }
  })
})
