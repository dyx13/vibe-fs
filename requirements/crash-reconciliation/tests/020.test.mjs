import assert from 'node:assert/strict'
import test from 'node:test'
import * as roles from '../../../dist/Foundation/RolesSurface.js'
import * as recovery from '../../../dist/OpenCode/Host/LoadRecoverySurface.js'
import { fold, link, acceptRun, terminal, canonical, materialized, abandoned } from './support/load-projection.mjs'
import { integrationTest } from '../../verification-system/tests/support/tier-gate.mjs'
import { hostPort } from '../../interaction-authority/tests/support/authority.mjs'

test('WHAT[crash-reconciliation-020] current role vocabulary includes DevOps and Engineer but excludes legacy Coder', () => {
  assert.ok(roles.allRoleLabels.includes('devops'))
  assert.ok(roles.allRoleLabels.includes('engineer'))
  assert.equal(roles.allRoleLabels.includes('coder'), false)
})

test('WHAT[crash-reconciliation-020] in-process physical terminals preserve an active child logical run and handle', () => {
  for (const disposition of ['Cancelled', 'Failed', 'Completed']) {
    const state = recovery.create()
    link(state)
    const child = acceptRun(state)
    const before = recovery.childView(state, 'parent', 'child')
    const ended = terminal(disposition, child)
    const payload = JSON.parse(ended)[1][1][1]
    const started = payload.Evidence[1]
    fold(state, canonical('ChatExecution', 'Accepted', {
      SchemaVersion: 1, Key: payload.Key, Evidence: started.Accepted,
    }))
    fold(state, canonical('ChatExecution', 'ProviderStarted', {
      SchemaVersion: 1, Key: payload.Key, Evidence: started,
    }))
    fold(state, ended)
    assert.deepEqual(recovery.childView(state, 'parent', 'child'), before)
    assert.equal(before.activeRun, child.logicalRun)
    assert.equal(before.lifecycle, 'Active')
    assert.equal(before.joinable, 0)
  }
})

test('WHAT[crash-reconciliation-020] production load decision voids active child runs without creating a completion', () => {
  for (const agent of ['engineer', 'devops']) {
    const state = recovery.create()
    link(state, { agent })
    const child = acceptRun(state, { agent })
    assert.equal(recovery.childView(state, 'parent', 'child').activeRun, child.logicalRun)
    const settlements = recovery.childSettlements(state)
    assert.equal(settlements.length, 1)
    assert.equal(JSON.parse(settlements[0])[1][1][0], 'ChildWorkVoided')
    fold(state, settlements[0])
    assert.deepEqual(recovery.childView(state, 'parent', 'child'), {
      activeRun: '', lifecycle: 'Active', joinable: 0, horizonVisible: 0,
    })
    assert.deepEqual(recovery.childSettlements(state), [])
    assert.equal(recovery.lookupChild(state, 'parent', 'work', false).session, 'child')
  }
})

test('WHAT[crash-reconciliation-020] an active child work run leaves the horizon projection only after load settlement voids it', () => {
  for (const agent of ['engineer', 'devops']) {
    const state = recovery.create()
    link(state, { agent })
    acceptRun(state, { agent })
    assert.equal(recovery.childView(state, 'parent', 'child').horizonVisible, 1)
    const settlements = recovery.childSettlements(state)
    assert.equal(settlements.length, 1)
    fold(state, settlements[0])
    assert.equal(recovery.childView(state, 'parent', 'child').horizonVisible, 0)
  }
})

test('WHAT[crash-reconciliation-020] human roots and child runs without a durable handle are not selected for load settlement', () => {
  const human = recovery.create()
  const manager = acceptRun(human, { child: 'parent', agent: 'manager', human: true })
  assert.deepEqual(recovery.childSettlements(human), [])
  assert.equal(recovery.childView(human, 'parent', 'parent').activeRun, manager.logicalRun)
  const unlinked = recovery.create()
  const child = acceptRun(unlinked)
  assert.deepEqual(recovery.childSettlements(unlinked), [])
  assert.equal(recovery.childView(unlinked, 'parent', 'child').activeRun, child.logicalRun)
})

test('WHAT[crash-reconciliation-020] stale Blogger selection respects exact live flight and abandonment clears the same folded open request', () => {
  const state = recovery.create()
  fold(state, materialized())
  const expected = [{ main: 'parent', blogger: 'blogger', request: 'request' }]
  assert.deepEqual(recovery.staleBloggerRequests(state, () => false), expected)
  assert.deepEqual(recovery.staleBloggerRequests(state, (blogger, request) => blogger === 'blogger' && request === 'request'), [])
  assert.deepEqual(recovery.staleBloggerRequests(state, (blogger, request) => blogger === 'blogger' && request === 'another-request'), expected)
  assert.deepEqual(recovery.staleBloggerRequests(state, (blogger, request) => blogger === 'another-blogger' && request === 'request'), expected)
  fold(state, abandoned())
  assert.deepEqual(recovery.staleBloggerRequests(state, () => false), [])
  fold(state, materialized('next-request'))
  assert.deepEqual(recovery.staleBloggerRequests(state, () => false), [{ main: 'parent', blogger: 'blogger', request: 'next-request' }])
})

const managerRootSelection = {
  kind: 'RootSelection', ownerSession: null, ownerLogicalRun: null, ownerAuthorityRoot: null,
  participantIdentity: {
    participant: 'manager', role: 'manager', persona: 'Lead', personaCatalogVersion: 1, origin: 'ResolvedAtRoot',
  },
}

const withDurableChildRuns = async (body) => {
  const { mkdtempSync, mkdirSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const journal = await import('../../../dist/Persistence/Journal/Surface.js')
  const dispatch = await import('../../../dist/Interaction/Dispatch/DispatchSurface.js')
  const authority = await import('../../../dist/Interaction/Authority/RuntimeSurface.js')
  const directory = mkdtempSync(join(tmpdir(), 'wxs-child-load-settle-'))
  const commonDir = join(directory, '.git')
  mkdirSync(commonDir)
  let handle
  let incarnation = 0
  let writerId
  const reopen = async () => {
    if (handle !== undefined) journal.JournalSurface_dispose(handle)
    handle = undefined
    incarnation += 1
    writerId = `load-writer-${incarnation}`
    const opened = await journal.JournalSurface_bootWithWriterId(
      commonDir, writerId, `load-runtime-${incarnation}`, process.pid, new Date().toISOString(),
    )
    assert.equal(opened.ok, true, JSON.stringify(opened.error))
    handle = opened.journal
    return handle
  }
  try {
    await reopen()
    const parent = await dispatch.acceptHumanRootSelection(handle, 'parent', 'root-parent', managerRootSelection)
    assert.equal(parent.ok, true, JSON.stringify(parent.error))
    const profiles = new Map()
    const port = hostPort(async () => dispatch.admittedWithReceipt('load-child-receipt'))
    for (const agent of ['engineer', 'devops']) {
      const linked = await journal.JournalSurface_appendAgent(handle, { kind: 'Session', session: 'parent' }, null, {
        family: 'Execution', case: 'HandleLinked', payload: {
          ParentSessionId: 'parent', ChildSessionId: agent, Handle: `work-${agent}`,
          TargetAgent: agent, Byname: `work-${agent}`, CanonicalRole: agent, Ownership: 'DurableParentHandle',
        },
      })
      assert.equal(linked.ok, true, JSON.stringify(linked.error))
      const seed = authority.issueInheritedIdentitySeed(agent, parent.profile)
      assert.equal(seed.ok, true, seed.error)
      const sent = await dispatch.sendAgentOwnerRootAwait(port, handle, agent, `WORK-${agent}`, seed.value)
      assert.equal(sent.ok, true, sent.error)
      const accepted = await dispatch.acceptAgentOwnerRoot(handle, agent, sent.key, `physical-${agent}`)
      assert.equal(accepted.ok, true, JSON.stringify(accepted.error))
      profiles.set(agent, accepted.profile)
    }
    // Reopen the actual writer before settlement; this does not simulate plugin activation or an OS crash.
    await body({ handle: await reopen(), writerId, commonDir, reopen, dispatch, profiles })
  } finally {
    if (handle !== undefined) journal.JournalSurface_dispose(handle)
    rmSync(directory, { recursive: true, force: true })
  }
}

const durableEvents = async (commonDir) => {
  const { readdirSync, readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const events = join(commonDir, 'wanxiangshu', 'events')
  return readdirSync(events).filter(name => name.endsWith('.ndjson')).sort().flatMap(name => {
    const content = readFileSync(join(events, name), 'utf8')
    assert.ok(content === '' || content.endsWith('\n'), 'every durable event must be a complete line')
    return content.split('\n').filter(Boolean).map(line => {
      const event = JSON.parse(line)
      assert.equal(typeof event.event_id, 'string')
      assert.notEqual(event.event_id, '')
      return event
    })
  })
}

integrationTest('WHAT[crash-reconciliation-020] actual child settlement persists voids across journal reopen without a completion', async () => {
  await withDurableChildRuns(async ({ handle, commonDir, reopen, dispatch, profiles }) => {
    const before = new Set((await durableEvents(commonDir)).map(event => event.event_id))
    for (const child of ['engineer', 'devops']) {
      assert.deepEqual(dispatch.projectionObservation(handle, child).activeLogicalRun, profiles.get(child))
    }
    await recovery.settleChildRuns(handle)
    for (const child of ['engineer', 'devops']) {
      assert.equal(dispatch.projectionObservation(handle, child).activeLogicalRun, null)
    }
    const added = (await durableEvents(commonDir))
      .filter(event => !before.has(event.event_id))
      .map(event => event.payload.Fact)
    const settlements = added.filter(fact => fact[0] === 'Agent')
    assert.equal(settlements.length, 2, 'settlement appends only the two void facts, never a completion')
    for (const child of ['engineer', 'devops']) {
      assert.deepEqual(settlements.find(fact => fact[1]?.[1]?.[1]?.Work?.ChildSessionId?.[1] === child), [
        'Agent', ['Execution', ['ChildWorkVoided', {
          ParentSessionId: ['SessionId', 'parent'], Work: {
            Handle: ['Agent', ['AgentHandleId', `work-${child}`]],
            ChildSessionId: ['SessionId', child],
            AuthorityRoot: ['AuthorityRootUserMessageId', profiles.get(child).authorityRoot],
          },
        }]],
      ])
    }
    const reopened = await reopen()
    for (const child of ['engineer', 'devops']) {
      assert.equal(dispatch.projectionObservation(reopened, child).activeLogicalRun, null)
    }
    const settled = await durableEvents(commonDir)
    await recovery.settleChildRuns(reopened)
    assert.deepEqual(await durableEvents(commonDir), settled, 'settled runs produce no duplicate facts')
  })
})

const assertChildSettlementAppendFailure = async phase => {
  await withDurableChildRuns(async ({ handle, writerId, commonDir, reopen, dispatch }) => {
    const { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const events = join(commonDir, 'wanxiangshu', 'events')
    const writer = join(events, `${writerId}.ndjson`)
    const blocked = phase === 'PhysicalAppend' ? writer : events
    const saved = join(commonDir, 'wanxiangshu', 'saved-append-target')
    // Activate the fresh writer before the fault, so the failed physical append
    // is the child void itself rather than its preceding RuntimeStarted watermark.
    const admitted = await dispatch.acceptHumanRootSelection(handle, 'current-manager', 'root-current-manager', managerRootSelection)
    assert.equal(admitted.ok, true, JSON.stringify(admitted.error))
    const before = await durableEvents(commonDir)
    const beforeWriter = readFileSync(writer)
    const active = child => dispatch.projectionObservation(handle, child).activeLogicalRun
    const initial = ['engineer', 'devops'].map(active)
    assert.ok(initial.every(profile => profile !== null), 'the failed operation must have real unsettled child work')
    renameSync(blocked, saved)
    try {
      if (phase === 'PhysicalAppend') {
        mkdirSync(blocked)
        await assert.rejects(() => recovery.settleChildRuns(handle), /append outcome unknown.*PhysicalAppend.*EISDIR/i)
      } else {
        writeFileSync(blocked, 'blocked: not a directory')
        await assert.rejects(() => recovery.settleChildRuns(handle), /append not attempted.*BeforePhysicalAppend.*EEXIST/i)
      }
      assert.deepEqual(['engineer', 'devops'].map(active), initial, 'failed durability cannot close either run')
    } finally {
      rmSync(blocked, { recursive: true, force: true })
      renameSync(saved, blocked)
    }
    assert.deepEqual(readFileSync(writer), beforeWriter, 'fault cleanup restores the exact original writer bytes')
    assert.deepEqual(await durableEvents(commonDir), before, 'the refused append publishes no durable fact')
    await assert.rejects(() => recovery.settleChildRuns(handle), /append not attempted.*writer poisoned/i)
    assert.deepEqual(['engineer', 'devops'].map(active), initial)
    assert.deepEqual(await durableEvents(commonDir), before, 'the poisoned writer must not retry physical append')
    const reopened = await reopen()
    assert.deepEqual(['engineer', 'devops'].map(child => dispatch.projectionObservation(reopened, child).activeLogicalRun), initial)
    await recovery.settleChildRuns(reopened)
    for (const child of ['engineer', 'devops']) {
      assert.equal(dispatch.projectionObservation(reopened, child).activeLogicalRun, null)
    }
  })
}

integrationTest('WHAT[crash-reconciliation-020] actual child settlement propagates unknown and unattempted append failures', async () => {
  await assertChildSettlementAppendFailure('PhysicalAppend')
})

integrationTest('WHAT[crash-reconciliation-020] a BeforePhysicalAppend directory fault is explicitly unattempted and poisons further settlement', async () => {
  await assertChildSettlementAppendFailure('BeforePhysicalAppend')
})

test.todo('WHAT[crash-reconciliation-020] actual plugin activation durably settles orphan child and Blogger work before ordinary execution, preserves exact live flights, and refuses append failure (GAP-149)')
test.todo('WHAT[crash-reconciliation-020] a real interrupted run and PTY input are not replayed after restart while unique DevOps authority and durable model Persona binding are retained (GAP-149; GAP-129; GAP-132)')
