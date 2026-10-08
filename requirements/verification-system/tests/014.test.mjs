/**
 * The Long Stroke — sole top-level E2E entry & verification-system 014 test
 * WHAT[verification-system-014] Long Stroke 真实物理验收环境.
 *
 * Scenario: e2e/scenarios/long-stroke.toml
 * Oracles:  e2e/support/long-stroke-oracles.mjs
 *
 * NOT registered under cases/ — G4R-0 freeze forbids growing the multi-canary
 * ceiling; this is the required-exactly-one-when-present cutover path
 * (g4r-freeze gate retired 2026-08-14; the e2e-watchdog-feed gate keeps the
 * sole-entry scope).
 *
 * PHYSICAL CONTRACTS (verification-system [002]/[014]): this file is the sole Long Stroke
 * because it depends on Host facts Pure/Temporal/Adapter cannot simulate:
 *   1. OpenCode process lifetime — spawn count === 1, one serve, one journal writer
 *   2. Host-assigned assistant messageID persisted before transform, then
 *      ToolContext.messageID at execute (HOST-010 共时)
 *   3. Host ToolPart / idle / abort / child-session physical threading
 * Repeat-until-pass is forbidden; semantic branches stay at Pure/Temporal/Adapter.
 *
 * G4R §2 / Exit: one continuous OpenCode lifetime — spawn count must be exactly 1.
 *
 * The Manager tool surface is proven on the wire the sole serve lifetime really sent:
 * the independent `assume` and Host-native `todowrite` entries are advertised
 * together with the Manager spine.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { compileScenario } from './e2e/support/scenario-schema.js'
import { resolveEntry } from './e2e/support/runtime-key.js'
import { ScenarioRuntime } from './e2e/support/scenario-runtime.js'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import './e2e/support/env-pin.mjs'
import { runCanary } from './e2e/support/scenario-driver.mjs'
import { bindLaneSession } from './e2e/support/lane.mjs'
import { getSessionId } from './e2e/support/scenario-http.js'
import { runStaticGate } from './e2e/support/index.js'
import { SOLE_ENTRY } from './e2e/support/watchdog-feed-scan.mjs'
import { releaseTest } from './support/tier-gate.mjs'
import {
  CUSTOMS,
  publicToolResults,
  HUMANROOT_MANAGER_LOOP_CANARY_PROMPT,
  assertHumanRootManagerLoop,
  awaitNamedFact,
  waitFactShape,
  retireCompanionForDeletion,
  INVESTIGATION_OUTLOOK_MARKERS,
  matchInvestigationOutlookMarker,
} from './e2e/support/long-stroke-oracles.mjs'
import { factPayloads, countFactCase } from './e2e/support/journal-observer.js'
import { withHumanRootLoopFixture } from './support/humanroot-loop-fixture.mjs'
import { WAIT_FACT_WINDOW_MS } from './e2e/support/time-budget.js'
import {
  getOpencodeSpawnCount,
  resetOpencodeSpawnCount,
} from './e2e/support/process-host-utils.js'
import {
  assertManagerToolSurface,
  collectManagerProviderToolEvidence,
} from './e2e/support/manager-tool-surface-evidence.mjs'

test('WHAT[verification-system-014] the Long Stroke entry satisfies the watchdog-feed guard', () => {
  // VERIFICATION-SYSTEM-014 requires the Layer 4 Long Stroke environment to be driven
  // by exactly one sole E2E entry executing under a single process lifecycle.
  const here = fileURLToPath(import.meta.url)
  const entryPath = here

  const gateResult = runStaticGate([entryPath])
  assert.equal(gateResult.passed, true, 'Long Stroke sole entry must satisfy static entry gate')

  // Verify that the entry defines the single physical server and single lifecycle contract
  assert.ok(entryPath.endsWith('014.test.mjs'), 'Long Stroke sole entry must be 014.test.mjs')
})

test('WHAT[verification-system-014] matchInvestigationOutlookMarker correctly identifies outlook markers and never falls back to raw description', () => {
  // Incident regression: When both markers are missing, the oracle must return null rather than falling
  // back to the full description. Falling back to the description causes undecorated tools to be fed into
  // legacy narrative assertions, misreporting a missing decoration as a legacy narrative residue.

  // 1. Both markers missing: must return null, never the description itself
  const plainToolDescription = 'Read a file or directory from the local filesystem. If the path does not exist, an error is returned.';
  assert.equal(matchInvestigationOutlookMarker(plainToolDescription), null);
  assert.notEqual(matchInvestigationOutlookMarker(plainToolDescription), plainToolDescription);

  const emptyDescription = '';
  assert.equal(matchInvestigationOutlookMarker(emptyDescription), null);

  const nonStringInputs = [null, undefined, 12345, {}, []];
  for (const input of nonStringInputs) {
    assert.equal(matchInvestigationOutlookMarker(input), null);
  }

  // 2. English marker present: returns exact English marker string
  const enDecoratedDescription =
    'Read a file from disk.\n\n' +
    'Investigation outlook: estimated_readonly_rounds estimates the consecutive read-only investigation rounds after the current batch. Include self_note only for a positive estimate, stating what to inspect next and what finding will make the next step possible; omit the note for 0.';
  const enMarker = matchInvestigationOutlookMarker(enDecoratedDescription);
  assert.equal(enMarker, INVESTIGATION_OUTLOOK_MARKERS.en);
  assert.equal(enMarker, 'Investigation outlook:');
  const enIncremental = enDecoratedDescription.slice(enDecoratedDescription.indexOf(enMarker));
  assert.ok(enIncremental.startsWith('Investigation outlook:'));

  // 3. Chinese marker present: returns exact Chinese marker string
  const zhDecoratedDescription =
    '从本地文件系统读取文件或目录。\n\n' +
    '调查展望：estimated_readonly_rounds 估计当前整批完成后的连续只读查证轮数。只在本次估计大于 0 时填写 self_note，简述接下来查什么、查到什么即可进入下一步；估计为 0 时省略短记。';
  const zhMarker = matchInvestigationOutlookMarker(zhDecoratedDescription);
  assert.equal(zhMarker, INVESTIGATION_OUTLOOK_MARKERS.zh);
  assert.equal(zhMarker, '调查展望：');
  const zhIncremental = zhDecoratedDescription.slice(zhDecoratedDescription.indexOf(zhMarker));
  assert.ok(zhIncremental.startsWith('调查展望：'));

  // 4. Invariant: Idempotent decoration appends must not produce multiple marker blocks
  const enDoubleDecorated =
    enDecoratedDescription +
    '\n\nInvestigation outlook: estimated_readonly_rounds estimates the consecutive read-only investigation rounds after the current batch.';
  const doubleMarker = matchInvestigationOutlookMarker(enDoubleDecorated);
  assert.equal(doubleMarker, INVESTIGATION_OUTLOOK_MARKERS.en);
  // Verify that an incremental slice from the first marker can detect non-idempotent duplication
  const firstIndex = enDoubleDecorated.indexOf(doubleMarker);
  const secondIndex = enDoubleDecorated.indexOf(doubleMarker, firstIndex + doubleMarker.length);
  assert.ok(secondIndex > firstIndex, 'Controlled fixture proves second occurrence exists when duplicated');

  // And for a properly decorated tool, the marker block appears exactly once
  const singleFirstIndex = enDecoratedDescription.indexOf(enMarker);
  const singleSecondIndex = enDecoratedDescription.indexOf(enMarker, singleFirstIndex + enMarker.length);
  assert.equal(singleSecondIndex, -1, 'Properly decorated description must have exactly one marker occurrence');

  // 5. Executable Mutation Verification (counterexample showing the test goes RED if reverted to 3-tier fallback):
  // The buggy 3-tier fallback returned the full description on missing markers:
  const buggyThreeTierFallback = (desc) =>
    desc.includes('Investigation outlook:')
      ? 'Investigation outlook:'
      : desc.includes('调查展望：')
        ? '调查展望：'
        : desc; // The bug: fallback to desc

  // Demonstrating the mutation creates a distinct observable failure:
  const mutantResult = buggyThreeTierFallback(plainToolDescription);
  assert.equal(mutantResult, plainToolDescription);
  // A test asserting strict equality to null strictly rejects the mutated logic:
  assert.throws(
    () => assert.equal(mutantResult, null),
    /AssertionError/,
    'Reverting to 3-tier fallback must fail the null assertion with an AssertionError',
  );
})

test('WHAT[verification-system-014] the compiled Long Stroke scenario preserves its Manager and consecutive-failure cases', () => {
  const source = readFileSync(new URL('./e2e/scenarios/long-stroke.toml', import.meta.url), 'utf8')
  const result = compileScenario(source, { name: 'long-stroke.toml' })
  assert.equal(result.ok, true, result.ok ? '' : result.problems.join('\n'))
  const byId = new Map(result.scenario.entries.map((entry) => [entry.id, entry]))
  const ordinary = byId.get('manager-loop.2')
  assert.deepEqual({ optional: ordinary?.optional, lane: ordinary?.lane, step: ordinary?.step },
    { optional: false, lane: 'manager', step: 2 })
  assert.deepEqual(result.scenario.faults.filter((fault) => fault.kind === 'provider-error' && fault.status === 400)
    .map((fault) => fault.entryId), ['manager-loop.2', 'continue.0'])

  const loopTools = ['fork', 'resume', 'join', 'horizon', 'review', 'suicide']
  const managerTools = ['fork', 'resume', 'join', 'horizon', 'assume', 'suicide']
  const request = (turn, step, tools) => ({
    messages: [{ role: 'user', content: turn },
      ...Array.from({ length: step }, (_, index) => ({ role: 'assistant', content: `reply-${index}` }))],
    tools: tools.map((name) => ({ name })),
  })
  const bindings = new Map([['manager', 'ses_manager']])
  const context = { sessionId: 'ses_manager' }
  assert.equal(resolveEntry(request('# Delegated work you sent out has not come back yet. Continue the work.', 1, managerTools), result.scenario.entries, bindings, context).matched?.id,
    'manager-join-guard.0')
  const assessUser =
    '# You are the 2 Manager taking over this mission. A predecessor may already have done\n' +
    '# part of the work, or may already have finished it; investigate the actual workspace before you\n' +
    "# act on either assumption. The predecessor's work is the object you must assess; the shared workspace is the actual state it left behind: check it directly\n" +
    '# rather than trusting any inherited claim.\n' +
    '#\n' +
    "# During assessment, you may directly use the review-only read tool js-manager, or entrust read-only work to Engineer to establish facts about the predecessor's work"
  for (const [step, tool] of [[0, 'review'], [1, 'suicide']]) {
    const id = `manager-reopened-loop.${step}`
    const entry = byId.get(id)
    assert.deepEqual({ step: entry?.step, optional: entry?.optional, internal: entry?.internal, tool: entry?.respond?.tool },
      { step, optional: true, internal: true, tool })
    assert.equal(resolveEntry(request(assessUser, step, loopTools), result.scenario.entries, bindings, context).matched?.id, id)
  }
  assert.equal(result.scenario.flow.filter((step) => step.waitAny).length, 0)
  for (let index = 0; index <= 2; index += 1) {
    const id = `manager-loop.${index}`
    assert.ok(result.scenario.must.includes(id), `${id} must be an exact must step`)
    assert.deepEqual(byId.get(id)?.tools, loopTools)
    assert.equal(byId.get(id)?.internal, false)
  }
  assert.ok(!result.scenario.entries.some((entry) => entry.id.startsWith('manager-resume.')))
  const currentActions = result.scenario.entries.filter((entry) => entry.turnId === 'manager-current-action')
  assert.deepEqual(currentActions.map((entry) => entry.step), Array.from({ length: 11 }, (_, index) => index))
  assert.ok(currentActions.every((entry) => entry.optional === true))
  assert.ok(!result.scenario.must.some((id) => id.startsWith('manager-current-action.')))
  assert.ok(!result.scenario.entries.some((entry) => entry.id.startsWith('manager-repair-resume.')))
  assert.ok(!result.scenario.must.some((id) => id.startsWith('manager-join-guard.')))
  assert.deepEqual({ journal: result.scenario.setup.maxJournalEvents, sse: result.scenario.setup.maxSseEvents },
    { journal: 699, sse: 3351 }, 'the measured scenario ceilings stay fixed during migration')
})

test('WHAT[verification-system-014] Long Stroke strictly consumes current production Blogger instructions across sessions', async () => {
  const companion = await import('../../../dist/Context/Companion/ProjectionSurface.js')
  const source = readFileSync(new URL('./e2e/scenarios/long-stroke.toml', import.meta.url), 'utf8')
  const result = compileScenario(source, { name: 'long-stroke.toml' })
  assert.equal(result.ok, true, result.ok ? '' : result.problems.join('\n'))
  const prompts = [companion.normalInstruction, companion.squashInstruction,
    companion.newWork([{ role: 'user', kind: 'text', text: 'Meaningful work.', truncated: false }])]
  for (const prompt of prompts) {
    const runtime = new ScenarioRuntime(result.scenario)
    for (const sessionId of ['ses_blogger_first', 'ses_blogger_second']) {
      runtime.bindAlias('blogger', sessionId)
      const context = { sessionId }
      const body = {
        model: 'test-model-b',
        messages: [{ role: 'system', content: 'Blogger' }, { role: 'user', content: prompt }],
        tools: [{ type: 'function', function: { name: 'chronicle', parameters: { type: 'object' } } }],
      }
      const selection = runtime.select(body, context)
      assert.equal(selection.entry?.id, 'blogger.0',
        `current production instruction must reach the declared Blogger turn: ${prompt.split('\n')[0]}`)
      assert.equal(selection.entry.lane, undefined, 'internal turns are not pinned to one session')
      assert.equal(selection.entry.respond.type, 'tool-call')
      assert.equal(selection.entry.respond.tool, 'chronicle')
      runtime.consume(body, selection, context)
      assert.equal(runtime.answered.has('blogger.0'), true)
    }
  }
  for (const prompt of ['# Write the dense work-log continuation now', '# Undeclared Blogger instruction']) {
    const runtime = new ScenarioRuntime(result.scenario)
    const selection = runtime.select({
      model: 'test-model-b',
      messages: [{ role: 'user', content: prompt }],
      tools: [{ type: 'function', function: { name: 'chronicle' } }],
    }, { sessionId: 'ses_blogger_negative' })
    assert.ok(selection.unmatched, 'stale or undeclared text must remain a strict mismatch')
    assert.equal(selection.entry, undefined)
    assert.equal(runtime.answered.size, 0)
  }
})

test('WHAT[verification-system-014] Long Stroke strictly consumes current production internal resources and readonly capabilities', async () => {
  const language = await import('../../../dist/Participant/Provider/LanguageSurface.js')
  const strength = await import('../../../dist/Strength/Surface.js')
  const source = readFileSync(new URL('./e2e/scenarios/long-stroke.toml', import.meta.url), 'utf8')
  const compiled = compileScenario(source, { name: 'long-stroke.toml' })
  assert.equal(compiled.ok, true, compiled.ok ? '' : compiled.problems.join('\n'))
  const tools = strength.exactReadonlyHostToolMap.filter((item) => item.allowed).map((item) => ({
    type: 'function', function: { name: item.tool, parameters: { type: 'object' } },
  }))
  assert.deepEqual(tools.map((tool) => tool.function.name), ['js-predictor'])
  const prompt = language.replicaConstraintFor('en')
  const body = (user, names = tools) => ({
    model: 'test-model-b', messages: [{ role: 'user', content: user }], tools: names,
  })
  for (const sessionId of ['ses_readonly_normal', 'ses_readonly_recovery']) {
    const runtime = new ScenarioRuntime(compiled.scenario)
    const selection = runtime.select(body(prompt), { sessionId })
    assert.equal(selection.entry?.id, 'strength-readonly-replica.0',
      'production readonly instruction and exact js-predictor capability must select one declared turn')
    assert.equal(selection.entry.lane, undefined)
    assert.equal(selection.entry.respond.tool, 'js-predictor')
    assert.equal(selection.entry.respond.args.program,
      "class Js extends JsProgram { async run() { const file = await this.file('large_probe.txt'); return file.text('^', '$'); } }")
    assert.equal(selection.entry.respond.args.estimated_readonly_rounds, 0)
  }
  for (const [user, names] of [
    ['STRENGTH_HOST_CANARY: inspect README.md through the real nested Replica path.', tools],
    ['STRENGTH_RECOVERY: resume the readonly delegation after a provider failure.', tools],
    ['Continue.', tools],
    ['Undeclared readonly instruction', tools],
    [prompt, [{ function: { name: 'read' } }]],
    [prompt, [...tools, { function: { name: 'read' } }]],
  ]) {
    const runtime = new ScenarioRuntime(compiled.scenario)
    const selection = runtime.select(body(user, names), { sessionId: 'ses_readonly_negative' })
    assert.ok(selection.unmatched, 'old prompts and native-read capability must remain strict mismatches')
    assert.equal(selection.entry, undefined)
  }
  const request = (text, step, names) => ({
    messages: [{ role: 'user', content: '# ' + text.trim().replace(/\n/g, '\n# ') },
      ...Array.from({ length: step }, () => ({ role: 'assistant', content: 'completed reply' }))],
    tools: names.map((name) => ({ function: { name } })),
  })
  const bindings = new Map([['manager', 'ses_manager']])
  const context = { sessionId: 'ses_manager' }
  for (const [path, step, names, expected] of [
    ['runtime/provider-retry', 0, [], 'continue.0'],
    ['runtime/background-join', 1, ['fork', 'resume', 'join', 'horizon', 'assume', 'suicide'], 'manager-join-guard.0'],
    ['runtime/manager-work', 0, ['join', 'assume', 'suicide'], 'manager-current-action.0'],
  ]) {
    const text = language.readText('en', path)
    assert.equal(resolveEntry(request(text, step, names), compiled.scenario.entries, bindings, context).matched?.id,
      expected, 'current production resource must keep its existing strict declaration: ' + path)
  }
  const assess = language.substitute(language.readText('en', 'runtime/manager-assess'), { ordinal: '2' })
  assert.equal(resolveEntry(request(assess, 0, ['fork', 'resume', 'join', 'horizon', 'review', 'suicide']),
    compiled.scenario.entries, bindings, context).matched?.id, 'manager-reopened-loop.0')
  assert.deepEqual(compiled.scenario.faults.filter((fault) => fault.kind === 'provider-error' && fault.status === 400)
    .map((fault) => fault.entryId), ['manager-loop.2', 'continue.0'])
})

test('WHAT[verification-system-014] readonly replica finish requires its actual completed probe exchange, independently of deliveries', async () => {
  const language = await import('../../../dist/Participant/Provider/LanguageSurface.js')
  const source = readFileSync(new URL('./e2e/scenarios/long-stroke.toml', import.meta.url), 'utf8')
  const prompt = language.replicaConstraintFor('en')
  const createRuntime = () => {
    const compiled = compileScenario(source, { name: 'long-stroke.toml' })
    assert.equal(compiled.ok, true, compiled.ok ? '' : compiled.problems.join('\n'))
    return new ScenarioRuntime(compiled.scenario)
  }
  const body = (history = []) => ({
    model: 'test-model-b',
    messages: [...history, { role: 'user', content: prompt }],
    tools: [{ type: 'function', function: { name: 'js-predictor' } }],
  })
  const call = (name = 'js-predictor') => ({
    role: 'assistant',
    tool_calls: [{ id: 'probe-call', type: 'function', function: { name, arguments: '{}' } }],
  })
  const result = (content = 'LARGE_READ_PROBE_MARKER actual file bytes', id = 'probe-call') => ({
    role: 'tool', tool_call_id: id, content,
  })
  const consume = (runtime, request, context) => {
    const selection = runtime.select(request, context)
    assert.equal(selection.entry?.id, 'strength-readonly-replica.0')
    runtime.consume(request, selection, context)
    return selection.entry.respond
  }
  const runtime = createRuntime()
  assert.equal(runtime.select(body(), { sessionId: 'ses_readonly_first' }).entry?.id,
    'strength-readonly-replica.0', 'the old scenario must fail at the production instruction boundary')
  await CUSTOMS.bindStrengthReplicaResponses({ provider: { _scenario: runtime } })
  for (const sessionId of ['ses_readonly_first', 'ses_readonly_second']) {
    const context = { sessionId }
    const initial = body()
    for (let delivery = 0; delivery < 2; delivery += 1) {
      assert.equal(consume(runtime, initial, context).tool, 'js-predictor',
        'identical deliveries without a completed probe must always request the real read')
    }
    const complete = body([...initial.messages, call(), result()])
    for (let delivery = 0; delivery < 2; delivery += 1) {
      assert.deepEqual(consume(runtime, complete, context), {
        type: 'text', text: 'Read-only survey complete; returning the gathered evidence.',
      }, 'a completed probe selects the same plain-text early end on every delivery')
    }
  }
  for (const history of [
    [call()],
    [result()],
    [call('js-manager'), result()],
    [call(), result('LARGE_READ_PROBE_MARKER orphan', 'unrelated-call')],
    [call(), result('ordinary result without probe evidence')],
    [{ role: 'user', content: 'LARGE_READ_PROBE_MARKER is merely mentioned' }],
  ]) {
    const negative = createRuntime()
    await CUSTOMS.bindStrengthReplicaResponses({ provider: { _scenario: negative } })
    assert.equal(consume(negative, body(history), { sessionId: 'ses_readonly_negative' }).tool, 'js-predictor',
      'unfinished, other-tool, orphan, and prose-only evidence must never end the replica')
  }
})

test('WHAT[verification-system-014] owner continuations retain the real promoted Replica assistant steps and the recovery fault', () => {
  const source = readFileSync(new URL('./e2e/scenarios/long-stroke.toml', import.meta.url), 'utf8')
  const compiled = compileScenario(source, { name: 'long-stroke.toml' })
  assert.equal(compiled.ok, true, compiled.ok ? '' : compiled.problems.join('\n'))
  const call = (id, name, args = {}) => ({
    role: 'assistant', tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
  })
  const result = (id, content) => ({ role: 'tool', tool_call_id: id, content })
  const body = (messages) => ({ model: 'test-model', messages, tools: [{ function: { name: 'js-manager' } }] })
  for (const leg of [
    { owner: 'strength-canary-owner', prompt: 'STRENGTH_HOST_CANARY: inspect README.md through the real nested Replica path.', rounds: 2, continuationStep: 3, finalStep: 4 },
    { owner: 'strength-recovery-owner', prompt: 'STRENGTH_RECOVERY: resume the readonly delegation after a provider failure.', rounds: 1, continuationStep: 2, finalStep: 3 },
  ]) {
    const runtime = new ScenarioRuntime(compiled.scenario)
    const context = { sessionId: 'ses_' + leg.owner }
    runtime.bindAlias(leg.owner, context.sessionId)
    const initial = [{ role: 'user', content: leg.prompt }]
    const first = runtime.select(body(initial), context)
    assert.equal(first.entry?.id, leg.owner + '.0')
    runtime.consume(body(initial), first, context)
    const estimated = [...initial,
      call('owner-estimate', 'js-manager', { estimated_readonly_rounds: leg.rounds }),
      result('owner-estimate', '# ok\n\n[data]\ninspected = true'),
    ]
    const promotedRead = [...estimated,
      call('replica-probe', 'js-predictor'),
      result('replica-probe', 'LARGE_READ_PROBE_MARKER actual file bytes'),
    ]
    const continued = leg.rounds === 2
      ? [...promotedRead, { role: 'assistant', content: 'Read-only survey complete; returning the gathered evidence.' }]
      : promotedRead
    assert.deepEqual(publicToolResults([body(continued)], 'js-predictor'), ['LARGE_READ_PROBE_MARKER actual file bytes'])
    const continuation = runtime.select(body(continued), context)
    assert.equal(continuation.entry?.id, leg.owner + '.1',
      'completed Replica batches must select the owner continuation at its actual assistant cursor')
    assert.equal(continuation.entry.step, leg.continuationStep)
    assert.equal(continuation.entry.respond.tool, 'js-manager')
    runtime.consume(body(continued), continuation, context)
    if (leg.rounds === 1) {
      assert.deepEqual({ status: continuation.fault?.status, retryable: continuation.fault?.retryable },
        { status: 500, retryable: true })
      const retry = runtime.select(body(continued), context)
      assert.equal(retry.entry?.id, leg.owner + '.1')
      assert.equal(retry.fault, undefined, 'the declared first-delivery fault must leave the same content for the retry')
      runtime.consume(body(continued), retry, context)
    } else {
      assert.equal(continuation.fault, undefined)
    }
    const final = [...continued, call('owner-continuation', 'js-manager'),
      result('owner-continuation', '# ok\n\n[data]\ninspected = true')]
    const successor = runtime.select(body(final), context)
    assert.equal(successor.entry?.id, leg.owner + '.2')
    assert.equal(successor.entry.step, leg.finalStep)
    assert.equal(successor.entry.respond.type, 'text')
    assert.equal(successor.fault, undefined)
    runtime.consume(body(final), successor, context)
    for (const partial of [estimated, ...(leg.rounds === 2 ? [promotedRead] : [])]) {
      assert.ok(resolveEntry(body(partial), compiled.scenario.entries, runtime.bindings, context).unmatched,
        'the uncompleted promotion cursor must have no filler declaration')
    }
    const extra = [...final, { role: 'assistant', content: 'undeclared extra reply' }]
    assert.ok(resolveEntry(body(extra), compiled.scenario.entries, runtime.bindings, context).unmatched)
    assert.ok(resolveEntry({ ...body(continued), tools: [{ function: { name: 'js-predictor' } }] },
      compiled.scenario.entries, runtime.bindings, context).unmatched)
  }
  assert.deepEqual(compiled.scenario.faults.filter((fault) => fault.kind === 'provider-error' && fault.status === 400)
    .map((fault) => fault.entryId), ['manager-loop.2', 'continue.0'])
})

test('WHAT[verification-system-014] another Road cannot supply the HumanRoot canary missing assessment or retirement', async () => {
  await withHumanRootLoopFixture(async (fixture) => {
    const { target, foreign, workDir, open, assess, retire, assertReplayed } = fixture
    open(target, 1)
    assess(target, 1, 'Revise')
    retire(target, 1, false)
    open(foreign, 1)
    assess(foreign, 1, 'Perfect')
    retire(foreign, 1, true)
    await assertReplayed(target, 1, false)
    await assertReplayed(foreign, 1, false)
    for (const name of ['AssessmentCommitted', 'RetirementCommitted', 'IncumbencyOpened']) {
      assert.equal(countFactCase(workDir, name), 2, 'the whole-world count deliberately mixes two real Roads')
      assert.equal((await awaitNamedFact(workDir, waitFactShape(name, { eq: 2 }), { timeoutMs: 0 })).named, 2,
        'an explicitly global barrier must retain its original whole-world contract')
      await assert.rejects(awaitNamedFact(workDir, waitFactShape(name, { eq: 2, session: target }), { timeoutMs: 0 }),
        /not satisfied .*got 1/, 'foreign facts must not complete the target Road barrier')
    }
  })
})

test('WHAT[verification-system-014] the original HumanRoot loop oracle keeps exact Road facts and physical deliveries amid other owners', async () => {
  await withHumanRootLoopFixture(async (fixture) => {
    const { target, foreign, scenario, open, assess, retire, reopen, assertReplayed } = fixture
    open(foreign, 1)
    assess(foreign, 1, 'Perfect')
    retire(foreign, 1, true)
    reopen(foreign, 2)
    open(target, 1)
    assess(target, 1, 'Revise')
    retire(target, 1, false)
    open(target, 2)
    assess(target, 2, 'Perfect')
    retire(target, 2, true)
    await assertReplayed(target, 2, false)
    await assertReplayed(foreign, 1, true)
    assert.equal(scenario.provider.matchCount('manager-reopened-loop.0'), 2)
    assert.equal(scenario.provider.matchCount('manager-reopened-loop.0', target), 1)
    await assertHumanRootManagerLoop(scenario, target)
    const firstReview = scenario.provider.requests[2].messages
    scenario.provider.requests[2].messages = firstReview.filter((message) => message.role === 'system' || message.role === 'user')
    await assert.rejects(assertHumanRootManagerLoop(scenario, target), /retain the predecessor physical history/)
    scenario.provider.requests[2].messages = firstReview
    fixture.signals.consume({ id: 'manager-reopened-loop.0', sessionId: target })
    await assert.rejects(assertHumanRootManagerLoop(scenario, target), /successor iteration audit must be delivered once/)
    reopen(target, 3)
    await assertReplayed(target, 2, true)
    await assert.rejects(assertHumanRootManagerLoop(scenario, target), /IncumbencyOpened overshot eq 2 \(got 3\)/)
  })
})

test('WHAT[verification-system-014] Manager loop response binding isolates each other Road from the main five-iteration spine', async () => {
  const language = await import('../../../dist/Participant/Provider/LanguageSurface.js')
  const compiled = compileScenario(readFileSync(new URL('./e2e/scenarios/long-stroke.toml', import.meta.url), 'utf8'),
    { name: 'long-stroke.toml' })
  assert.equal(compiled.ok, true, compiled.ok ? '' : compiled.problems.join('\n'))
  const runtime = new ScenarioRuntime(compiled.scenario)
  for (const sessionId of ['ses_main', 'ses_strength', 'ses_human']) runtime.bindAlias('manager', sessionId)
  runtime.bindAlias('humanroot-manager', 'ses_human')
  const histories = new Map()
  const dispatch = (sessionId, user, id) => {
    const history = histories.get(sessionId) ?? []
    if (user !== null) history.push({ role: 'user', content: user })
    const body = { messages: [...history], tools: ['fork', 'resume', 'join', 'horizon', 'review', 'suicide', 'assume']
      .map((name) => ({ function: { name } })) }
    const selection = runtime.select(body, { sessionId })
    assert.equal(selection.entry?.id, id, JSON.stringify(selection))
    runtime.consume(body, selection, { sessionId })
    const response = selection.entry.respond
    const callId = `${sessionId}:${history.length}`
    history.push({ role: 'assistant', content: response.prefixText ?? '', tool_calls: [{ id: callId,
      type: 'function', function: { name: response.tool, arguments: JSON.stringify(response.args ?? {}) } }] },
    { role: 'tool', tool_call_id: callId, content: 'completed' })
    histories.set(sessionId, history)
    return response
  }
  const successor = (ordinal) => '# ' + language.substitute(language.readText('en', 'runtime/manager-assess'),
    { ordinal: String(ordinal) }).trim().replace(/\n/g, '\n# ')
  const work = '# ' + language.readText('en', 'runtime/manager-work').trim().replace(/\n/g, '\n# ')
  await CUSTOMS.bindManagerLoopSequence({ provider: { _scenario: runtime } })
  assert.equal(dispatch('ses_strength', successor(2), 'manager-reopened-loop.0').args.completeness, 'PERFECT')
  assert.equal(dispatch('ses_strength', null, 'manager-reopened-loop.1').tool, 'suicide')
  assert.equal(dispatch('ses_human', HUMANROOT_MANAGER_LOOP_CANARY_PROMPT, 'humanroot-loop.0').args.completeness, 'REVISE')
  assert.equal(dispatch('ses_human', null, 'humanroot-loop.1').tool, 'suicide')
  assert.equal(dispatch('ses_human', successor(2), 'manager-reopened-loop.0').args.completeness, 'PERFECT')
  assert.equal(dispatch('ses_human', null, 'manager-reopened-loop.1').tool, 'suicide')
  assert.equal(dispatch('ses_strength', work, 'manager-current-action.0').tool, 'assume')
  const initial = compiled.scenario.entries.find((entry) => entry.id === 'manager-loop.0').turn
  assert.equal(dispatch('ses_main', initial, 'manager-loop.0').args.completeness, 'REVISE')
  assert.equal(dispatch('ses_main', null, 'manager-loop.1').args.name, 'Proof Writer')
  assert.equal(dispatch('ses_main', work, 'manager-current-action.0').tool, 'assume')
  assert.equal(dispatch('ses_main', null, 'manager-current-action.1').tool, 'join')
  assert.equal(dispatch('ses_strength', work, 'manager-current-action.0').tool, 'assume')
  assert.equal(dispatch('ses_strength', null, 'manager-current-action.1').tool, 'suicide')
  assert.equal(dispatch('ses_main', successor(2), 'manager-reopened-loop.0').args.completeness, 'PERFECT')
  assert.equal(dispatch('ses_main', null, 'manager-reopened-loop.1').tool, 'suicide')
  assert.equal(dispatch('ses_main', successor(3), 'manager-reopened-loop.0').args.completeness, 'REVISE')
  assert.equal(dispatch('ses_strength', successor(3), 'manager-reopened-loop.0').args.completeness, 'PERFECT',
    'the shared audit entry must reset after the main Road repair response')
  assert.equal(dispatch('ses_main', null, 'manager-reopened-loop.1').args.name, 'Conflict Resolver')
  assert.equal(dispatch('ses_strength', null, 'manager-reopened-loop.1').tool, 'suicide',
    'the shared action entry must reset after the main Road fork response')
  for (const ordinal of [4, 5]) {
    assert.equal(dispatch('ses_main', successor(ordinal), 'manager-reopened-loop.0').args.completeness, 'PERFECT')
    assert.equal(dispatch('ses_main', null, 'manager-reopened-loop.1').tool, 'suicide')
  }
  assert.throws(() => dispatch('ses_strength', initial, 'manager-loop.0'), /main Manager Road cannot change/)
})

test('WHAT[verification-system-014] all main relay barriers count the bound Road independently of preflow owners', () => {
  const compiled = compileScenario(readFileSync(new URL('./e2e/scenarios/long-stroke.toml', import.meta.url), 'utf8'),
    { name: 'long-stroke.toml' })
  assert.equal(compiled.ok, true, compiled.ok ? '' : compiled.problems.join('\n'))
  const relay = new Set(['AssessmentCommitted', 'RetirementCommitted', 'IncumbencyOpened'])
  assert.deepEqual(compiled.scenario.flow.filter((step) => relay.has(step.waitFact?.name)).map((step) => step.waitFact), [
    { name: 'AssessmentCommitted', eq: 1, session: 'child' },
    { name: 'RetirementCommitted', gte: 1, session: 'child' },
    { name: 'IncumbencyOpened', gte: 2, session: 'child' },
    { name: 'AssessmentCommitted', gte: 2, session: 'child' },
    { name: 'RetirementCommitted', gte: 2, session: 'child' },
    { name: 'IncumbencyOpened', gte: 3, session: 'child' },
    { name: 'AssessmentCommitted', gte: 3, session: 'child' },
    { name: 'RetirementCommitted', gte: 3, session: 'child' },
    { name: 'IncumbencyOpened', gte: 4, session: 'child' },
    { name: 'AssessmentCommitted', gte: 4, session: 'child' },
    { name: 'RetirementCommitted', gte: 4, session: 'child' },
  ])
})

test('WHAT[verification-system-014] the original Engineer barrier and Join oracle require the same admitted Work', async () => {
  const compiled = compileScenario(readFileSync(new URL('./e2e/scenarios/long-stroke.toml', import.meta.url), 'utf8'),
    { name: 'long-stroke.toml' })
  assert.equal(compiled.ok, true, compiled.ok ? '' : compiled.problems.join('\n'))
  const barriers = compiled.scenario.flow.filter((step) => step.waitFact?.name.startsWith('Handle'))
  assert.deepEqual(barriers.map((step) => ({ waitFact: step.waitFact, timeoutMs: step.timeoutMs })), [
    { waitFact: { name: 'HandleWorkCompleted', gte: 1, session: 'child' }, timeoutMs: 60000 },
  ])
  const { assertJoinWakePath, PLANNED_WAIT_FACTS } = await import('./e2e/support/long-stroke-oracles.mjs')
  assert.deepEqual(PLANNED_WAIT_FACTS.handleWorkCompleted,
    { name: 'HandleWorkCompleted', gte: 1, session: 'child', renewOn: [] })
  const { execFileSync } = await import('node:child_process')
  const { withForkRuntime, toolModule } = await import('../../delegation/tests/support/fork-runtime.mjs')
  const fork = await import('../../../dist/Execution/Delegation/Fork/OpenCode/ToolSurface.js')
  const { releaseSharedObserver } = await import('./e2e/support/journal-observer.js')
  const owner = 'long-stroke-original-work'
  const pair = await import('../../../dist/OpenCode/Host/PairProgrammingThoughtSurface.js')
  await withForkRuntime(owner, async (runtime, directory) => {
    execFileSync('git', ['init', '--bare', '--quiet', directory])
    const requests = []
    const scenario = { host: { workDir: directory }, provider: { requests } }
    const admit = async (name) => {
      fork.acceptNextPrompt(runtime)
      assert.match(await fork.executeManagerFork(runtime, toolModule, owner, 'engineer', name, `Charge ${name}`),
        new RegExp(name))
      assert.equal(fork.promptCount(runtime), 1)
      return fork.workSnapshot(runtime, owner).find((work) => work.byname === name && work.lifecycle === 'Active')
    }
    const deliver = async (answer, providerRun) => {
      const terminal = await fork.prepareTerminalDelivery(runtime, owner, answer, providerRun)
      await terminal()
    }
    const onWire = (sessionID, callId, text) => ({ sessionID, messages: [
      { role: 'assistant', tool_calls: [{ id: callId, function: { name: 'join', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: callId, content: text },
    ] })
    const withHostGuidance = async (text) => {
      const input = [
        { info: { id: 'original-user', role: 'user' }, parts: [{ type: 'text', text: 'Join the original admitted work.' }] },
        { info: { id: 'original-join', role: 'assistant' }, parts: [
          { type: 'tool', tool: 'join', callID: 'original-join-call', state: {
            status: 'completed', input: {}, output: text, time: { start: 0, end: 1 },
          } },
        ] },
      ]
      const before = structuredClone(input)
      const injected = await pair.tryInject(owner, pair.canonicalText, input)
      assert.equal(injected.ok, true, injected.error)
      assert.deepEqual(input, before, 'the actual Host projection must preserve the physical Join result')
      const output = injected.value.at(-1).parts[0].state.output
      assert.equal(output, text + '\0\uFEFF' + pair.canonicalText)
      return output
    }
    try {
      await admit('Other Engineer')
      await deliver('OTHER-WORK-ANSWER', 'provider-other-work')
      const otherResult = await fork.executeJoin(runtime, owner)
      requests.push(onWire(owner, 'join-other-work', otherResult))
      assert.equal(countFactCase(directory, 'HandleWorkCompleted'), 1)
      assert.equal(countFactCase(directory, 'HandleWorkConsumed'), 1)
      assert.throws(() => assertJoinWakePath(scenario, owner), /original Proof Writer binding required exactly once/)

      const original = await admit('Proof Writer')
      assert.ok(original)
      assert.throws(() => assertJoinWakePath(scenario, owner), /original Work terminal completion required exactly once/)
      await deliver('ORIGINAL-WORK-ANSWER', 'provider-original-work')
      assert.equal(countFactCase(directory, 'HandleCompleted'), 0, 'current producer must not manufacture a historical terminal')
      assert.equal(countFactCase(directory, 'HandleWorkCompleted'), 2)
      assert.equal(countFactCase(directory, 'HandleWorkConsumed'), 1)
      assert.throws(() => assertJoinWakePath(scenario, owner), /same original Work must be consumed exactly once/,
        'another Work completion and consumption cannot settle the original Work')
      assert.deepEqual(await fork.coldWorkSnapshot(directory, owner), fork.workSnapshot(runtime, owner))

      const result = await fork.executeJoin(runtime, owner)
      assert.match(result, /ORIGINAL-WORK-ANSWER/)
      assert.doesNotMatch(result, /OTHER-WORK-ANSWER/)
      assert.equal(countFactCase(directory, 'HandleWorkConsumed'), 2)
      const completed = factPayloads(directory, 'HandleWorkCompleted')
        .find((payload) => payload.Work?.AuthorityRoot?.[1] === original.root)
      const consumed = factPayloads(directory, 'HandleWorkConsumed')
        .find((payload) => payload.Work?.AuthorityRoot?.[1] === original.root)
      assert.deepEqual(consumed.Work, completed.Work)
      assert.equal(completed.Work.ChildSessionId[1], original.child)
      assert.deepEqual(completed.Work.Handle, factPayloads(directory, 'HandleLinked')
        .find((payload) => payload.Byname === 'Proof Writer').Handle)
      assert.deepEqual(consumed.CompletionRef, completed.CompletionRef)
      assert.deepEqual(consumed.CompletionDigest, completed.CompletionDigest)
      assert.deepEqual(await fork.coldWorkSnapshot(directory, owner), fork.workSnapshot(runtime, owner))
      assert.throws(() => assertJoinWakePath(scenario, owner), /one successful public join result/,
        'a consumed fact alone is not a provider-visible successful Join')
      requests.push(onWire(owner, 'join-original-plain', result))
      assertJoinWakePath(scenario, owner)
      requests.pop()
      const presented = await withHostGuidance(result)
      requests.push(onWire('another-owner', 'join-foreign-owner', presented))
      assert.throws(() => assertJoinWakePath(scenario, owner), /one successful public join result/)
      requests.push(onWire(owner, 'join-guidance-only', otherResult + '\0\uFEFF' + result))
      assert.throws(() => assertJoinWakePath(scenario, owner), /one successful public join result/,
        'the original completion quoted only in guidance cannot deliver the original Work')
      requests.push(onWire(owner, 'join-edited-body', await withHostGuidance(result + 'changed')))
      assert.throws(() => assertJoinWakePath(scenario, owner), /one successful public join result/,
        'guidance must not excuse a change to the actual completion body')
      requests.push(onWire(owner, 'join-unseparated-suffix', result + pair.canonicalText))
      assert.throws(() => assertJoinWakePath(scenario, owner), /one successful public join result/,
        'an appended text without the real guidance-plane delimiter changes the completion body')
      const originalWire = onWire(owner, 'join-original-work', presented)
      requests.push(originalWire)
      assertJoinWakePath(scenario, owner)
      requests.push(structuredClone(originalWire))
      assertJoinWakePath(scenario, owner)
      assert.throws(() => assertJoinWakePath(scenario, 'another-owner'), /original Proof Writer binding required exactly once/)
      requests.push(onWire(owner, 'join-duplicate-original-work', presented))
      assert.throws(() => assertJoinWakePath(scenario, owner), /one successful public join result/)
    } finally {
      await releaseSharedObserver(directory)
    }
  })
})

const STRENGTH_HOST_CANARY_PROMPT =
  'STRENGTH_HOST_CANARY: inspect README.md through the real nested Replica path.'

const runPreFlowPrompt = async (scenario, lane, prompt, agent) => {
  const created = await scenario.client.createSession(agent ? { agent } : {})
  const sessionID = getSessionId(created)
  assert.ok(sessionID, `${lane} session creation failed: ${JSON.stringify(created)}`)
  if (!scenario.sessionIds.includes(sessionID)) scenario.sessionIds.push(sessionID)
  bindLaneSession(scenario.provider, sessionID, lane)

  const turn = scenario.turn.start(sessionID)
  const response = await scenario.client.request('POST', `/session/${sessionID}/prompt_async`, {
    body: {
      parts: [{ type: 'text', text: prompt }],
      ...(agent ? { agent } : {}),
    },
  })
  assert.ok(response.ok, `${lane} prompt failed: ${JSON.stringify(response.data)}`)
  await turn.awaitTerminal()
}

const preFlowCanaries = async (scenario) => {
  await CUSTOMS.bindManagerLoopSequence(scenario)
  await CUSTOMS.bindStrengthReplicaResponses(scenario)
  await runPreFlowPrompt(scenario, 'strength-canary-owner', STRENGTH_HOST_CANARY_PROMPT, 'manager')

  assert.equal(
    scenario.provider.matchCount('strength-readonly-replica.0'),
    2,
    `Strength dry-run must physically start its Replica without blocking the owner. Host stderr tail:\n${scenario.host.stderrLog.slice(-4000)}`,
  )

  const replicaRequests = scenario.provider.requests.filter((request) =>
    (request.tools ?? []).some((tool) => (tool?.function?.name ?? tool?.name) === 'js-predictor'))
  assert.equal(replicaRequests.length, 2, 'the estimate-2 canary must admit exactly two replica requests')
  assert.deepEqual(publicToolResults([replicaRequests[0]], 'js-predictor'), [],
    'the unique bootstrap request must precede its own read result')
  const completedProbe = publicToolResults([replicaRequests[1]], 'js-predictor')
  assert.equal(completedProbe.length, 1, 'the second request must carry exactly one completed probe exchange')
  assert.match(completedProbe[0], /LARGE_READ_PROBE_MARKER/)

  const humanrootCreated = await scenario.client.createSession({ agent: 'manager' })
  const humanrootSessionId = getSessionId(humanrootCreated)
  assert.ok(humanrootSessionId, `humanroot-manager session creation failed: ${JSON.stringify(humanrootCreated)}`)
  if (!scenario.sessionIds.includes(humanrootSessionId)) scenario.sessionIds.push(humanrootSessionId)
  bindLaneSession(scenario.provider, humanrootSessionId, 'humanroot-manager')

  const humanrootPrompt = await scenario.client.request('POST', `/session/${humanrootSessionId}/prompt_async`, {
    body: {
      parts: [{ type: 'text', text: HUMANROOT_MANAGER_LOOP_CANARY_PROMPT }],
      agent: 'manager',
    },
  })
  assert.ok(humanrootPrompt.ok, `humanroot-manager prompt failed: ${JSON.stringify(humanrootPrompt.data)}`)

  await assertHumanRootManagerLoop(scenario, humanrootSessionId)

  const linkedBlogger = factPayloads(scenario.host.workDir, 'CompanionBloggerLinked')
    .filter((payload) => {
      const text = JSON.stringify(payload ?? {})
      return text.includes(humanrootSessionId)
    })
  if (linkedBlogger.length > 0) {
    await retireCompanionForDeletion(scenario, humanrootSessionId)
  }
}

const awaitManagerJoinRunning = async (scenario, ctx) => {
  const managerSessionId = ctx?.childId
  assert.ok(managerSessionId, 'Long Stroke join-running barrier requires the bound Manager session')

  const isRunningJoin = (event) =>
    event?.type === 'message.part.updated'
    && event?.sessionID === managerSessionId
    && event?.toolName === 'join'
    && event?.toolStatus === 'running'

  await scenario.events.awaitEvent(isRunningJoin, null)
}

const assertManagerToolSurfaceOnWire = async (scenario, ctx) => {
  const managerProviderWire = collectManagerProviderToolEvidence(scenario, {
    childSessionId: ctx?.childId ?? null,
  })
  const result = assertManagerToolSurface({ managerProviderWire })
  console.log(`[manager-surface] ok tools=${result.unionTools.join(',')} requests=${result.requestCount}`)
}

test('WHAT[verification-system-014] declared participating tool arguments satisfy the production estimate contract', async () => {
  const Strength = await import('../../../dist/Strength/Surface.js')
  const Hooks = await import('../../../dist/OpenCode/Host/PluginHooksSurface.js')
  const compiled = compileScenario(readFileSync(new URL('./e2e/scenarios/long-stroke.toml', import.meta.url), 'utf8'),
    { name: 'long-stroke.toml' })
  assert.equal(compiled.ok, true, compiled.ok ? '' : compiled.problems.join('\n'))
  const rejected = []
  const estimates = []
  let participating = 0
  for (const entry of compiled.scenario.entries) {
    const response = entry.respond
    if (response.type !== 'tool-call' || Strength.classifyTool(response.tool) !== 'EstimateAfterCall') continue
    participating += 1
    const args = JSON.parse(JSON.stringify(response.args ?? {}))
    const definition = {
      description: 'Scenario estimate contract',
      parameters: { type: 'object', properties: {}, required: [] },
    }
    Hooks.decorateReadonlyDelegationToolDefinition(response.tool, definition)
    assert.ok(definition.parameters.required.includes('estimated_readonly_rounds'), entry.id)
    const parsed = Strength.parseParticipatingArguments(args)
    const boundary = Hooks.readonlyDelegationSelfNoteOf(args)
    assert.equal(boundary.ok, parsed.ok, entry.id)
    if (parsed.ok) {
      assert.equal(boundary.note, parsed.selfNote, entry.id)
      estimates.push({ id: entry.id, rounds: parsed.rounds })
    } else {
      assert.equal(boundary.error, parsed.error, entry.id)
      rejected.push({ id: entry.id, tool: response.tool, error: parsed.error })
    }
    const missing = { ...args }
    delete missing.estimated_readonly_rounds
    assert.deepEqual(Strength.parseParticipatingArguments(missing),
      { ok: false, error: 'MissingEstimate' }, `${entry.id}: deleting the required estimate must be rejected`)
    assert.deepEqual(Hooks.readonlyDelegationSelfNoteOf(missing),
      { ok: false, error: 'MissingEstimate' }, `${entry.id}: the production argument boundary must reject missing input`)
  }
  assert.equal(participating, 7, 'all declared participating calls must reach the production argument contract')
  assert.deepEqual(rejected, [], 'the configured-Predictor scenario must not script invalid participating arguments')
  assert.deepEqual(estimates, [
    { id: 'engineer.0', rounds: 0 },
    { id: 'engineer.1', rounds: 0 },
    { id: 'engineer-resolve.0', rounds: 0 },
    { id: 'strength-canary-owner.0', rounds: 2 },
    { id: 'strength-canary-owner.1', rounds: 0 },
    { id: 'strength-recovery-owner.0', rounds: 1 },
    { id: 'strength-recovery-owner.1', rounds: 0 },
  ])
})

releaseTest('WHAT[verification-system-014] Long Stroke 真实物理验收环境', async () => {
  resetOpencodeSpawnCount()
  const code = await runCanary('long-stroke', {
    preFlow: preFlowCanaries,
    customs: {
      ...CUSTOMS,
      awaitManagerJoinRunning,
      assertManagerToolSurfaceOnWire,
    },
  })
  assert.equal(code, 0, `Long Stroke canary exited with code ${code}`)
  assert.equal(
    getOpencodeSpawnCount(),
    1,
    `G4R §2: Long Stroke must spawn opencode serve exactly once (got ${getOpencodeSpawnCount()})`,
  )
})
