import assert from 'node:assert/strict'
import test from 'node:test'
import { cpSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {withReview, scores} from '../../relay-assessment/tests/support/plugin.mjs'
import {withSuccessor, messageId} from '../../relay-context-projection/tests/support/cut.mjs'
import { withExecutablePlugin, acceptAuthorityRoot } from '../../verification-system/tests/support/plugin-fixture.mjs'
import * as workflow from '../../../dist/Mission/Manager/WorkflowSurface.js'
import * as dispatch from '../../../dist/Interaction/Dispatch/DispatchSurface.js'
import * as projection from '../../../dist/Mission/Relay/ProjectionSurface.js'
import * as journal from '../../../dist/Persistence/Journal/Surface.js'
import { withManagerLoop } from '../../relay-incumbency/tests/support/manager-loop.mjs'
import { withChangeInterrupt } from './support/change-interrupt.mjs'

test('WHAT[relay-retirement-008] actual Accepted suicide returns without abort and the next transform stops the retired attempt', async () => {
  await withReview(async ({execute, hooks, directory, runtime, session}) => {
    assert.match(await execute(scores('PERFECT')), /recorded = true/)
    const confirmation = await hooks.tool.suicide.execute({}, {sessionID: session, callID: 'suicide-confirm', messageID: 'retirement-confirm', agent: 'manager'})
    assert.match(confirmation, /confirmation_required = true/)
    runtime.pushHostMessage(session, {
      info: { id: 'retirement-run', role: 'assistant', sessionID: session, parentID: 'user-root', time: { created: 3 } },
      parts: [{ type: 'tool', tool: 'suicide', callID: 'suicide-call',
        state: { status: 'completed', input: {}, output: 'finished = true' } }],
    })
    const result = await hooks.tool.suicide.execute({}, {sessionID: session, callID: 'suicide-call', messageID: 'retirement-run', agent: 'manager'})
    assert.match(result, /finished = true/)
    assert.deepEqual(runtime.abortedIds, [])
    const road = handle => journal.JournalSurface_snapshot(handle).sessionProjections[session].relay
    const acceptedRoad = structuredClone(road(runtime.journal))
    assert.equal(acceptedRoad.roads[0].certificatePresent, true)
    assert.equal(acceptedRoad.roads[0].activeIncumbencyPresent, false)
    const eventDirectory = join(directory, '.git', 'wanxiangshu', 'events')
    const relayFacts = () => readdirSync(eventDirectory).filter(name => name.endsWith('.ndjson')).sort()
      .flatMap(name => readFileSync(join(eventDirectory, name), 'utf8').trim().split('\n'))
      .filter(line => line.includes('"TransactionCommitted"'))
    const acceptedFacts = relayFacts()
    assert.ok(acceptedFacts.some(line => line.includes('"RetirementCommitted"')))
    assert.equal(acceptedFacts.filter(line => line.includes('"QualityCertificateInvalidated"')).length, 0)
    const output = {messages: [
      {info: {id: 'user-root', role: 'user', sessionID: session, model: {providerID: 'provider', modelID: 'manager-model'}}, parts: [{type: 'text', text: 'Deliver the requested behavior and verification.'}]},
      {info: {id: 'retirement-run', role: 'assistant'}, parts: [{type: 'text', text: 'Old closing tail'}]},
    ]}
    await hooks['experimental.chat.messages.transform']({sessionID: session}, output)
    assert.deepEqual(output.messages, [])
    assert.deepEqual(runtime.abortedIds, [session])
    assert.equal(runtime.prompts.length, 0)
    assert.deepEqual(road(runtime.journal), acceptedRoad,
      'the stale physical request must leave the Accepted certificate, opening ordinal and inactive road unchanged')
    assert.deepEqual(relayFacts(), acceptedFacts,
      'interrupting the old cut must not commit certificate invalidation or a successor opening')
    const coldDirectory = join(directory, 'cold-accepted-road')
    cpSync(join(directory, '.git', 'wanxiangshu'), join(coldDirectory, 'wanxiangshu'), { recursive: true })
    const reopened = await journal.JournalSurface_bootWithWriterId(coldDirectory, 'accepted-cold',
      'rt_accepted_cold', process.pid, '2026-10-08T00:00:00Z')
    assert.equal(reopened.ok, true, JSON.stringify(reopened.error))
    try {
      assert.deepEqual(road(reopened.journal), acceptedRoad,
        'an independent cold fold must retain the exact Accepted road after the stale transform')
    } finally {
      journal.JournalSurface_dispose(reopened.journal)
    }
  })
})

test('WHAT[relay-retirement-008] actual Continue starts one same-session successor whose transform retains the old physical history without another abort', async () => {
  await withSuccessor(async ({hooks, runtime, session, history, gate}) => {
    const output = {messages: [...structuredClone(history), gate]}
    await hooks['experimental.chat.messages.transform']({sessionID: session}, output)
    for (const prior of history) {
      assert.ok(output.messages.some(message => messageId(message) === messageId(prior)), `lost physical message ${messageId(prior)}`)
    }
    assert.ok(output.messages.some(message => messageId(message) === messageId(gate)))
    assert.deepEqual(runtime.abortedIds, [session])
    assert.equal(runtime.prompts.filter(p => p.sessionID === session).length, 1)
  })
})

test('WHAT[relay-retirement-008] physical prompt after Accepted suicide invalidates certificate and unblocks successor manager tools', async () => {
  const { withExecutablePlugin, acceptAuthorityRoot } = await import('../../verification-system/tests/support/plugin-fixture.mjs')
  const withLateCutPhase = async latePhase => withExecutablePlugin(async (hooks, _directory, _children, runtime) => {
    const sessionID = `ses-accepted-human-successor-${latePhase}`
    const rootID = `root-${sessionID}`
    const root = {
      id: rootID,
      role: 'user',
      parts: [{ type: 'text', text: 'Design the capability reuse resolver.' }],
    }
    await acceptAuthorityRoot(runtime, sessionID, 'manager')
    runtime.pushHostMessage(sessionID, root)
    await hooks['chat.message'](
      { sessionID, messageID: rootID, agent: 'manager' },
      { message: root, parts: root.parts },
    )
    const user = { info: { id: rootID, role: 'user', sessionID }, parts: root.parts }
    runtime.pushHostMessage(sessionID, {
      info: { id: 'run-root', role: 'assistant', sessionID, parentID: rootID, time: { created: 1 } },
      parts: [],
    })
    await hooks['experimental.chat.messages.transform']({ sessionID }, { messages: [user] })

    // Step 1: Submit PERFECT review
    const findings = { findings: [] }
    const review = {
      id: 'run-review', role: 'assistant', parentID: rootID, time: { created: 2 },
      parts: [
        { type: 'text', text: 'All criteria perfect.' },
        { type: 'tool', tool: 'review', callID: 'call-review', state: { status: 'pending', input: findings } },
      ],
    }
    runtime.pushHostMessage(sessionID, review)
    const context = (callID, messageID) => ({ sessionID, agent: 'manager', callID, messageID })
    const reviewResult = await hooks.tool.review.execute(findings, context('call-review', review.id))
    assert.match(reviewResult, /recorded = true/)

    // Step 2: Suicide commits Accepted retirement
    const retiredRun = {
      id: 'run-suicide', role: 'assistant', parentID: rootID, time: { created: 3 },
      parts: [{ type: 'tool', tool: 'suicide', callID: 'call-suicide', state: { status: 'pending', input: {} } }],
    }
    runtime.pushHostMessage(sessionID, retiredRun)
    const confirmation = await hooks.tool.suicide.execute({}, context('call-suicide-confirm', 'confirm-run'))
    assert.match(confirmation, /confirmation_required = true/)
    const suicideResult = await hooks.tool.suicide.execute({}, context('call-suicide', retiredRun.id))
    assert.match(suicideResult, /finished = true/)

    // Prior to human input, manager tools are denied (retirement frozen / Accepted certificate)
    const forkDuringRetirement = await hooks.tool.fork.execute(
      { calling: 'engineer', name: 'alice', charge: 'check' },
      context('call-fork-stale', 'msg-stale'),
    )
    assert.match(forkDuringRetirement, /(当前不可用|is not available right now)/)

    // Step 3: Human inputs new instructions in the continuous session
    const humanNext = {
      id: 'human-phase-2', role: 'user',
      parts: [{ type: 'text', text: 'Plan approved. Please start implementation.' }],
    }
    await hooks['chat.message'](
      { sessionID, messageID: humanNext.id, agent: 'manager' },
      { message: humanNext, parts: humanNext.parts },
    )
    const freshOwner = structuredClone(dispatch.projectionObservation(runtime.journal, sessionID).activeLogicalRun)
    assert.deepEqual(runtime.abortedIds, [])
    const retiredHistory = [
      structuredClone(user),
      { info: { id: review.id, role: 'assistant', sessionID, parentID: rootID }, parts: structuredClone(review.parts) },
      { info: { id: retiredRun.id, role: 'assistant', sessionID, parentID: rootID }, parts: structuredClone(retiredRun.parts) },
    ]
    const assertLateRetiredRequest = async () => {
      const beforePrompts = runtime.prompts.length
      const beforeRoad = structuredClone(journal.JournalSurface_snapshot(runtime.journal).sessionProjections[sessionID].relay)
      const output = { messages: structuredClone(retiredHistory) }
      await hooks['experimental.chat.messages.transform']({ sessionID }, output)
      assert.deepEqual(output.messages, [], `${latePhase}: the retired physical request must stay suppressed`)
      assert.deepEqual(runtime.abortedIds, [], `${latePhase}: the old cut must not abort the new HumanRoot`)
      assert.equal(runtime.prompts.length, beforePrompts, `${latePhase}: the old cut must not open or send a successor`)
      assert.deepEqual(dispatch.projectionObservation(runtime.journal, sessionID).activeLogicalRun, freshOwner,
        `${latePhase}: the old cut must preserve the exact new HumanRoot working identity`)
      assert.deepEqual(journal.JournalSurface_snapshot(runtime.journal).sessionProjections[sessionID].relay, beforeRoad,
        `${latePhase}: the old cut must leave the current Road unchanged`)
    }
    if (latePhase === 'admission') await assertLateRetiredRequest()
    const humanRequest = {
      messages: [
        user,
        { info: { id: review.id, role: 'assistant', sessionID }, parts: review.parts },
        { info: { id: retiredRun.id, role: 'assistant', sessionID }, parts: retiredRun.parts },
        { info: { id: humanNext.id, role: 'user', sessionID }, parts: humanNext.parts },
      ],
    }
    runtime.pushHostMessage(sessionID, {
      info: { id: 'run-human-successor', role: 'assistant', sessionID, parentID: humanNext.id, time: { created: 4 } },
      parts: [],
    })
    await hooks['experimental.chat.messages.transform']({ sessionID }, humanRequest)
    if (latePhase === 'successor-transform') await assertLateRetiredRequest()

    // Step 4: After human input, fork must NOT be denied
    const forkSuccessor = await hooks.tool.fork.execute(
      { calling: 'engineer', name: 'alice', charge: 'implement' },
      context('call-fork-successor', 'msg-successor'),
    )
    assert.doesNotMatch(forkSuccessor, /(当前不可用|is not available right now)/, 'fork must be unblocked after human input advances the continuous session')
  })
  for (const latePhase of ['admission', 'successor-transform']) await withLateCutPhase(latePhase)
})

test('WHAT[relay-retirement-008] invalidated Accepted keeps its stale cut and stops without automatic send while ordinary ContinueLoop sends', async () => {
  await withManagerLoop('invalid-accepted-active', async context => {
    const { directory, session, profile, road } = context
    const original = dispatch.projectionObservation(context.journal(), session)
    const beforeRoad = road()
    const stale = [
      { info: { id: profile.authorityRoot, role: 'user', sessionID: session },
        parts: [{ type: 'text', text: 'Deliver this original Manager charge.' }] },
      { info: { id: 'provider:1', role: 'assistant', sessionID: session, parentID: profile.authorityRoot },
        parts: [{ type: 'tool', tool: 'suicide', callID: 'suicide:1',
          state: { status: 'completed', input: {}, output: 'finished = true' } }] },
    ]
    assert.deepEqual(await projection.apply(context.journal(), session, false, stale), {
      disposition: 'retired-attempt-stopped', messages: [], interrupted: [session],
    }, 'certificate invalidation and the active successor cannot turn the old physical request into new authority')
    const stopping = Promise.withResolvers()
    const release = Promise.withResolvers()
    const stopped = []
    const sent = []
    const port = {
      SubscribeTerminal: () => ({ Dispose() {} }),
      SubscribeFutureTerminal: () => ({ Dispose() {} }),
      AbortSession: () => assert.fail('ordinary continuation must not abort the session'),
      InterruptAttempt: () => assert.fail('the exact interruption is owned by the supplied stop callback'),
      SendPrompt: async (target, text, options) => {
        const key = options.Metadata.wanxiangshu_prompt_key
        const pending = dispatch.projectionObservation(context.journal(), session).pendingClaims
        const claim = pending.find(value => value.promptKey === key)
        assert.equal(target, session)
        assert.equal(claim?.origin, 'ManagerGuard')
        assert.equal(claim?.logicalRun, profile.logicalRun)
        assert.equal(claim?.authorityRoot, profile.authorityRoot)
        sent.push({ key, text })
        return dispatch.admittedWithPhysicalMessage(`ordinary-accepted-${session}`)
      },
    }
    const attempt = workflow.continueAfterRetiredAttempt(port, context.journal(), session, directory, async exact => {
      stopped.push(exact)
      stopping.resolve()
      await release.promise
    })
    try {
      await stopping.promise
      assert.deepEqual(stopped, [session])
      assert.equal(sent.length, 0, 'the old physical attempt must finish stopping first')
    } finally {
      release.resolve()
    }
    await attempt
    assert.equal(sent.length, 0, 'Accepted must never automatically dispatch after stale-attempt interruption')
    assert.deepEqual(road(), beforeRoad)
    assert.deepEqual(dispatch.projectionObservation(context.journal(), session), original,
      'stopping a stale Accepted attempt must leave the actual live AgentOwnerRoot and claims untouched')
    await workflow.maybeDeliverLoop(port, context.journal(), session, directory)
    assert.equal(sent.length, 1, 'explicit ordinary ContinueLoop still dispatches the exact invalidated Accepted retirement')
    assert.deepEqual(dispatch.projectionObservation(context.journal(), session).activeLogicalRun, profile)
    context.assertSubscriptionLive()
  })
})

test('WHAT[relay-retirement-008] actual Change continuation stops the retired Host attempt before send and a late transform cannot abort its successor', async () => {
  await withChangeInterrupt(async context => {
    assert.equal(await context.continueChange(), 'interrupt',
      'the real Change await path must enter physical interruption before its successor SendPrompt')
    assert.equal(context.prompts.length, 0, 'an in-flight physical interruption must hold the successor send')
    context.releaseAbort()
    await context.successorAccepted
    assert.deepEqual(context.order, ['interrupt-started', 'interrupt-completed', 'successor-send'])
    await context.stopLateTransform()
    assert.deepEqual(context.order, ['interrupt-started', 'interrupt-completed', 'successor-send'],
      'the late old transform must reuse the settled exact-cut stop instead of cancelling the successor')
    assert.equal(context.prompts.length, 1)
    assert.equal(context.road().iterationOrdinal, 2)
    assert.equal(context.road().retiredIncumbencyCount, 1)
    assert.equal(context.openingCount(), 2, 'the initial incumbency and its successor each have one durable opening')
    assert.deepEqual(dispatch.projectionObservation(context.runtime.journal, context.session).activeLogicalRun, context.profile)
    assert.equal(dispatch.projectionObservation(context.runtime.journal, context.session).pendingClaims.length, 0)
  })
})

test('WHAT[relay-retirement-008] an in-flight old transform and actual Change share one physical stop and one successor opening', async () => {
  await withChangeInterrupt(async context => {
    const stopped = context.startStaleTransform()
    await context.abortStarted
    await context.activateChange()
    context.releaseAbort()
    await Promise.all([stopped, context.successorAccepted])
    assert.deepEqual(context.order, ['interrupt-started', 'interrupt-completed', 'successor-send'])
    assert.equal(context.prompts.length, 1)
    assert.equal(context.openingCount(), 2, 'a captured pre-interruption context must not append the successor twice')
    assert.equal(context.road().iterationOrdinal, 2)
    assert.deepEqual(dispatch.projectionObservation(context.runtime.journal, context.session).activeLogicalRun, context.profile)
  })
})

test('WHAT[relay-retirement-008] a rejected physical interruption prevents actual Change from sending a successor', async () => {
  await withChangeInterrupt(async context => {
    assert.equal(await context.continueChange(), 'interrupt')
    context.releaseAbort()
    const result = await context.joinResult()
    assert.match(result, /Integration did not succeed\./,
      'the actual Change workflow must settle its failed publication result')
    assert.deepEqual(context.order, ['interrupt-started'])
    assert.equal(context.prompts.length, 0)
    assert.equal(context.openingCount(), 1, 'a rejected physical stop must not open a successor')
    assert.deepEqual(dispatch.projectionObservation(context.runtime.journal, context.session).activeLogicalRun, context.profile)
    await assert.rejects(context.stopLateTransform(), /controlled exact-cut interruption rejected/)
    assert.deepEqual(context.order, ['interrupt-started'], 'the failed exact-cut stop must not be retried by a late transform')
    assert.equal(context.prompts.length, 0)
  }, { interruptError: new Error('controlled exact-cut interruption rejected') })
})

for (const arrival of ['change-first', 'transform-first']) {
  test(`WHAT[relay-retirement-008] linked-worktree and root plugin instances share the ${arrival} exact-cut stop`, async () => {
    await withChangeInterrupt(async context => {
      let stopped
      if (arrival === 'transform-first') {
        stopped = context.startStaleTransform()
        await context.abortStarted
        await context.activateChange()
      } else {
        assert.equal(await context.continueChange(), 'interrupt')
      }
      assert.equal(context.prompts.length, 0, 'the physical stop holds both actual plugin instances')
      context.releaseAbort()
      await context.successorAccepted
      if (stopped) await stopped
      else await context.stopLateTransform()
      assert.deepEqual(context.order, ['interrupt-started', 'interrupt-completed', 'successor-send'])
      assert.equal(context.prompts.length, 1)
      assert.equal(context.openingCount(), 2)
      assert.deepEqual(dispatch.projectionObservation(context.runtime.journal, context.session).activeLogicalRun, context.profile)
    }, { splitInstance: true })
  })
}

test.todo('WHAT[relay-retirement-008] a controlled in-flight Host interrupt prevents successor dispatch until exact provider-step release and physical interruption complete')
