import assert from 'node:assert/strict'
import test from 'node:test'
import { withExecutablePlugin, observeAuthority, grantWorkOwned } from '../../verification-system/tests/support/plugin-fixture.mjs'
import { factPayloads, journalEventLines } from '../../verification-system/tests/e2e/support/journal-observer.js'
import * as status from '../../../dist/Execution/Session/ChatExecution/StatusSurface.js'
import { admit, context, user, transform } from './support/plugin.mjs'

test('WHAT[concern-routing-005] actual automatic root and named child mailboxes publish without changing either authority or interrupting the owner provider', async () => {
  await withExecutablePlugin(async (hooks, directory, created, runtime) => {
    const owner = 'mailbox-authority-owner'
    await admit(runtime, owner, 'manager')
    const root = user(owner)
    await transform(hooks, runtime, owner, [root])
    await grantWorkOwned(runtime, owner)
    const priorChildren = new Set(created)
    const forked = await hooks.tool.fork.execute({ calling: 'engineer', name: 'Ada', charge: 'Inspect the source and report evidence.' }, context(owner, 'mailbox-child', 'manager'))
    assert.match(forked, /Ada/)
    const forkChildren = created.filter(session => !priorChildren.has(session))
    assert.equal(forkChildren.length, 1)
    const child = forkChildren[0]
    const subscriptions = factPayloads(directory, 'MailboxSubscribed')
    assert.equal(subscriptions.length, 2)
    const rootMailbox = subscriptions.find(fact => fact.Id === 'root')
    const childMailbox = subscriptions.find(fact => fact.Id === 'Ada')
    assert.deepEqual(rootMailbox.OwnerSessionId, ['SessionId', owner])
    assert.deepEqual(childMailbox.OwnerSessionId, ['SessionId', child])
    const authority = [owner, child].map(session => observeAuthority(runtime, session))
    assert.equal(authority[0].activeLogicalRun.authorityKind, 'HumanRoot')
    assert.equal(authority[1].activeLogicalRun.authorityKind, 'AgentOwnerRoot')
    const execution = status.query(runtime.journal, owner, root.info.id)
    assert.deepEqual(execution, { accepted: true, providerStarted: true, terminal: false, disposition: null })
    const prompts = structuredClone(runtime.prompts)
    const abortedIds = [...runtime.abortedIds]
    const anchors = factPayloads(directory, 'PairProgrammingGuidelineAnchored')
    const priorLines = new Set(journalEventLines(directory))
    for (const [session, agent, callID, id, message] of [
      [child, 'engineer', 'child-evidence', 'root', 'This is peer information, not a new command.'],
      [owner, 'manager', 'owner-evidence', 'Ada', 'Inspect this observation against domain evidence.'],
    ]) {
      assert.match(await hooks.tool.publish.execute({ id, message }, context(session, callID, agent)), /Message accepted for concern/)
    }
    assert.deepEqual([owner, child].map(session => observeAuthority(runtime, session)), authority)
    assert.deepEqual(status.query(runtime.journal, owner, root.info.id), execution)
    assert.deepEqual(runtime.prompts, prompts)
    assert.deepEqual(runtime.abortedIds, abortedIds)
    assert.deepEqual(factPayloads(directory, 'MailboxSubscribed'), subscriptions)
    assert.deepEqual(factPayloads(directory, 'PairProgrammingGuidelineAnchored'), anchors)
    const publications = factPayloads(directory, 'MessagePublished')
    assert.equal(publications.length, 2)
    assert.deepEqual(publications.find(fact => fact.OccurrenceId === 'child-evidence'), {
      OccurrenceId: 'child-evidence', Generation: rootMailbox.Generation, Id: 'root',
      SenderSessionId: ['SessionId', child], Message: 'This is peer information, not a new command.',
    })
    assert.deepEqual(publications.find(fact => fact.OccurrenceId === 'owner-evidence'), {
      OccurrenceId: 'owner-evidence', Generation: childMailbox.Generation, Id: 'Ada',
      SenderSessionId: ['SessionId', owner], Message: 'Inspect this observation against domain evidence.',
    })
    const newFacts = journalEventLines(directory).filter(line => !priorLines.has(line)).map(line => JSON.parse(line).payload.Fact)
    assert.equal(newFacts.length, 2)
    assert.ok(newFacts.every(fact => fact[0] === 'Agent' && fact[1][0] === 'Concern' && fact[1][1][0] === 'MessagePublished'), 'publication appends only informational facts, never an obligation or authority')
  })
})

test.todo('WHAT[concern-routing-005] actual Pair Hint announcement and consumption preserve office entitlement and both participants authority across cold recovery (GAP-155)')
