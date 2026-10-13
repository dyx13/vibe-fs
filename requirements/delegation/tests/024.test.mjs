import test from 'node:test'
import assert from 'node:assert/strict'
import { withForkRuntime, toolModule } from './support/fork-runtime.mjs'
import * as forkTool from '../../../dist/Execution/Delegation/Fork/OpenCode/ToolSurface.js'

test('WHAT[delegation-024] pre-join resume preserves both public join WorkRecords', async () => {
  const owner = 'prejoin-retained-delivery'
  await withForkRuntime(owner, async runtime => {
    const first = forkTool.executeManagerFork(runtime, toolModule, owner, 'engineer', 'Ada', 'FIRST')
    await forkTool.awaitPromptCount(runtime, 1)
    assert.equal(forkTool.acceptPrompt(runtime, 0), true)
    assert.match(await first, /Ada/)
    const child = forkTool.child(runtime)
    assert.equal(await forkTool.settle(runtime, owner, 'RETAINED-ANSWER-A', 'provider-a'), true)
    const second = forkTool.executeManagerResume(runtime, toolModule, owner, '', 'Ada', 'SECOND')
    await forkTool.awaitPromptCount(runtime, 2)
    assert.equal(forkTool.acceptPrompt(runtime, 1), true)
    assert.match(await second, /Ada/)
    assert.equal(forkTool.child(runtime), child)
    assert.equal(await forkTool.settle(runtime, owner, 'RETAINED-ANSWER-B', 'provider-b'), true)
    const result = await forkTool.executeJoin(runtime, owner)
    assert.match(result, /RETAINED-ANSWER-A/)
    assert.match(result, /RETAINED-ANSWER-B/)
    assert.equal((result.match(/RETAINED-ANSWER-A/g) ?? []).length, 1)
    assert.equal((result.match(/RETAINED-ANSWER-B/g) ?? []).length, 1)
  })
})

{
const { default: assert } = await import("node:assert/strict");
const { mkdtempSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { default: test } = await import("node:test");
const fork = await import("../../../dist/Execution/Delegation/Fork/Surface.js");
const forkTool = await import("../../../dist/Execution/Delegation/Fork/OpenCode/ToolSurface.js");

const schemaNode = (kind, extra = {}) => ({
  kind,
  ...extra,
  describe: () => schemaNode(`${kind}-described`, extra),
  optional: () => schemaNode(`${kind}-optional`, extra),
  int: () => schemaNode(`${kind}-int`, extra),
  nonnegative: () => schemaNode(`${kind}-nonnegative`, extra),
})
const toolModule = {
  tool: {
    schema: {
      string: () => schemaNode('string'),
      number: () => schemaNode('number'),
      enum: (values) => schemaNode('enum', { values }),
      array: (inner) => schemaNode('array', { inner }),
    },
  },
}
const waitForPromptCount = (runtime, count) => forkTool.awaitPromptCount(runtime, count)
const ownerDescriptor = (sessionId) => [{ sessionId, agent: 'manager' }]

test('WHAT[delegation-024] FORK_TOOL_same_byname_reuse_dispatches_immediately_and_leaves_completion_to_join', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wxs-fork-reuse-'))
  const owner = 'manager-reuse'
  const runtime = await forkTool.createRuntime(directory, ownerDescriptor(owner))

  try {
    await forkTool.captureOwnerOpening(runtime, owner, 'ROOT-OPENING-MARKER')

    const first = forkTool.executeManagerFork(
      runtime,
      toolModule,
      owner,
      'engineer',
      'Ada',
      'FIRST-FORK-CHARGE',
    )
    await waitForPromptCount(runtime, 1)
    assert.equal(forkTool.acceptPrompt(runtime, 0), true)
    assert.equal(forkTool.childCount(runtime), 1)
    const child = forkTool.child(runtime)
    assert.notEqual(child, null)
    assert.match(forkTool.prompt(runtime, 0), /FIRST-FORK-CHARGE/)
    assert.match(forkTool.prompt(runtime, 0), /ROOT-OPENING-MARKER/)
    assert.match(await first, /Ada/)

    assert.equal(await forkTool.settle(runtime, owner, 'FIRST-FORK-ANSWER', 'fork-run-1'), true)

    await forkTool.captureOwnerDeltaPart(runtime, owner, 'PARENT-FRESH-DELTA-MARKER', 'parent-run-2')

    const second = forkTool.executeManagerResume(
      runtime,
      toolModule,
      owner,
      '',
      'Ada',
      'SECOND-FORK-CHARGE',
    )

    await waitForPromptCount(runtime, 2)
    assert.equal(forkTool.acceptPrompt(runtime, 1), true)
    assert.equal(forkTool.child(runtime), child, 'same Byname must reuse the same physical child')
    assert.equal(forkTool.childCount(runtime), 1)

    const secondPrompt = forkTool.prompt(runtime, 1)
    assert.match(secondPrompt, /SECOND-FORK-CHARGE/)
    assert.match(secondPrompt, /commissioner_record\s*=/)
    assert.match(secondPrompt, /PARENT-FRESH-DELTA-MARKER/)
    assert.doesNotMatch(secondPrompt, /ROOT-OPENING-MARKER/)

    const secondResult = await second
    assert.match(secondResult, /Ada/)
    assert.doesNotMatch(secondResult, /SECOND-FORK-ANSWER/)
    assert.doesNotMatch(secondResult, /FIRST-FORK-ANSWER/)

    assert.equal(
      forkTool.durableLifecycleByname(runtime, owner, 'Ada'),
      'Active',
      'fork return must not imply that the reused child already completed',
    )

    assert.equal(await forkTool.settle(runtime, owner, 'SECOND-FORK-ANSWER', 'fork-run-2'), true)
    assert.equal(
      forkTool.durableLifecycleByname(runtime, owner, 'Ada'),
      'CompletedAwaitingJoin',
      'completion remains a separately consumable join fact',
    )
  } finally {
    forkTool.disposeRuntime(runtime)
  }
})
}

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");
const handoff = await import("../../../dist/Execution/Delegation/HandoffSurface.js");


test('WHAT[delegation-024] reusable handoff advances one durable parent delta window at a time', () => {
  const first = handoff.handoffWindow(null, 10)
  assert.deepEqual(first, { start: 0, end: 10, isInitial: true })

  const second = handoff.handoffWindow(10, 17)
  assert.deepEqual(second, { start: 10, end: 17, isInitial: false })

  assert.deepEqual(handoff.handoffWindow(17, 17), { start: 17, end: 17, isInitial: false })
})
test('WHAT[delegation-024] bounded child result never widens to an earlier invocation', () => {
  assert.deepEqual(handoff.childRange(31, 44), { start: 31, end: 44 })
})
}

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");
const { mkdtemp } = await import("node:fs/promises");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const sync = await import("../../../dist/Execution/Delegation/SyncDelegate/Surface.js");

const live = async (owner) => sync.create(
  await mkdtemp(join(tmpdir(), 'wxs-sync-delegate-')),
  [{ sessionId: owner, agent: 'manager' }],
)
const waitForChild = async (h, owner, role) => {
  await sync.awaitPromptCount(h, owner, role, 1)
  return sync.child(h, owner, role)
}
const waitForPromptCount = async (h, owner, role, count) => {
  await sync.awaitPromptCount(h, owner, role, count)
  assert.equal(sync.acceptPrompt(h, owner, role, count - 1), true)
}
const settle = async (h, owner, role, answer, run = 'run-1') => sync.settle(h, owner, role, answer, run)
const remainsPending = async (promise) =>
  Promise.race([
    promise.then((value) => ({ kind: 'resolved', value })),
    new Promise((resolve) => setImmediate(() => resolve({ kind: 'pending' }))),
  ])
const verifyReusableHandoff = async (role) => {
  const owner = `owner-handoff-${role.toLowerCase()}`
  const h = await live(owner)
  try {
    await sync.captureOwnerOpening(h, owner, 'ROOT-OPENING-MARKER')

    const first = sync.invoke(h, owner, role, 'FIRST-CHARGE')
    await waitForPromptCount(h, owner, role, 1)
    assert.equal(sync.handoffFrontier(h, owner, role), null)
    assert.match(sync.prompt(h, owner, role, 0), /ROOT-OPENING-MARKER/)
    assert.match(
      sync.prompt(h, owner, role, 0),
      /closing report/,
      'the charge prompt must carry the shared fork-child Base guidance (delegation-019)',
    )

    assert.equal(await settle(h, owner, role, 'FIRST-ANSWER', 'run-first'), true)
    const firstResult = await first
    assert.equal(firstResult.ok, true)
    assert.match(firstResult.value, /FIRST-ANSWER/)
    const firstFrontier = sync.handoffFrontier(h, owner, role)
    assert.notEqual(firstFrontier, null)

    await sync.captureOwnerDeltaPart(h, owner, 'PARENT-DELTA-ONLY-MARKER', 'parent-run-2')

    const second = sync.invoke(h, owner, role, 'SECOND-CHARGE')
    await waitForPromptCount(h, owner, role, 2)
    const secondPrompt = sync.prompt(h, owner, role, 1)
    assert.match(secondPrompt, /SECOND-CHARGE/)
    assert.match(secondPrompt, /commissioner_record\s*=/)
    assert.match(secondPrompt, /PARENT-DELTA-ONLY-MARKER/)
    assert.doesNotMatch(secondPrompt, /ROOT-OPENING-MARKER/)
    assert.equal(sync.handoffFrontier(h, owner, role), firstFrontier)

    assert.equal(
      await sync.settleWithAuthorityRoot(h, owner, role, 'STALE-ANSWER', 'run-stale', 'old-authority-root'),
      false,
    )
    assert.deepEqual(await remainsPending(second), { kind: 'pending' })

    assert.equal(await settle(h, owner, role, 'SECOND-ANSWER', 'run-second'), true)
    const secondResult = await second
    assert.equal(secondResult.ok, true)
    assert.match(secondResult.value, /SECOND-ANSWER/)
    assert.doesNotMatch(secondResult.value, /FIRST-ANSWER/)
    assert.notEqual(sync.handoffFrontier(h, owner, role), firstFrontier)
    assert.equal(sync.childCount(h), 1)
  } finally { sync.dispose(h) }
}

test('WHAT[delegation-024] Engineer reuse sends parent delta waits for its own root and returns its own child delta', async () => {
  await verifyReusableHandoff('Engineer')
})

test('WHAT[delegation-024] DevOps completion is claimed by HandleTurn and its LWR returns to the caller', async () => {
  await verifyReusableHandoff('DevOps')
})
}
