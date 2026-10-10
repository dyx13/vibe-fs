import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as concern from '../../../dist/Interaction/Concern/Surface.js'
import { withExecutablePlugin, acceptAuthorityRoot, openIncumbency } from '../../verification-system/tests/support/plugin-fixture.mjs'
import { factPayloads, journalEventLines } from '../../verification-system/tests/e2e/support/journal-observer.js'
import { withReview, findings } from '../../relay-assessment/tests/support/plugin.mjs'
import { admit, context, user, toolBatch } from './support/plugin.mjs'

test('WHAT[concern-routing-006] retirement prevents old messages crossing into a same-concern replacement generation', () => {
  let state = concern.subscribe('owner-a', 'gen-1', 'build', 'build health', concern.empty()).state
  state = concern.publish('sender', 'msg-old', 'build', 'old message', state).state
  const oldBatch = concern.prepare('owner-a', state)
  state = concern.retire('owner-a', 'build', 'gen-1', state).state
  assert.equal(concern.publish('sender', 'after-retirement', 'build', 'too late', state).ok, false)
  assert.equal(concern.subscribe('owner-b', 'gen-2', 'build', 'changed meaning', state).ok, false)
  const rebound = concern.subscribe('owner-b', 'gen-2', 'build', 'build health', state)
  assert.equal(rebound.ok, true)
  assert.equal(rebound.appended, true)
  state = rebound.state
  assert.deepEqual(concern.prepare('owner-b', state).messages, [])
  assert.deepEqual(concern.prepare('owner-b', state).announcements, [{ id: 'build', concern: 'build health' }])
  assert.equal(concern.place('owner-a', oldBatch.announcedGenerations, oldBatch.deliveredMessages, state).ok, false)
  state = concern.applySubscribedClaim('owner-a', 'gen-1', 'build', 'build health', state).state
  const fresh = concern.publish('sender', 'msg-new', 'build', 'new generation', state)
  assert.equal(fresh.ok, true)
  assert.deepEqual(concern.prepare('owner-a', fresh.state).messages, [])
  assert.deepEqual(concern.prepare('owner-b', fresh.state).messages, [{ id: 'build', message: 'new generation' }])
})

test('WHAT[concern-routing-006] actual opening of an owner incumbency preserves its already subscribed mailbox generation', async () => {
  await withExecutablePlugin(async (hooks, directory, _created, runtime) => {
    const owner = 'mailbox-opening-owner'
    await acceptAuthorityRoot(runtime, owner, 'manager', `root-${owner}`)
    const root = user(owner)
    await hooks['chat.message']({ sessionID: owner, messageID: root.info.id, agent: 'manager' }, { message: root.info, parts: root.parts })
    const subscriptions = factPayloads(directory, 'MailboxSubscribed')
    assert.equal(subscriptions.length, 1)
    assert.deepEqual(subscriptions[0].OwnerSessionId, ['SessionId', owner])
    assert.match(await hooks.tool.publish.execute({ id: 'root', message: 'Accepted before opening.' }, context(owner, 'before-opening', 'manager')), /Message accepted/)
    await openIncumbency(runtime, owner)
    assert.deepEqual(factPayloads(directory, 'MailboxSubscribed'), subscriptions)
    assert.deepEqual(factPayloads(directory, 'MailboxRetired'), [])
    assert.match(await hooks.tool.publish.execute({ id: 'root', message: 'Accepted after opening.' }, context(owner, 'after-opening', 'manager')), /Message accepted/)
    const messages = factPayloads(directory, 'MessagePublished')
    assert.equal(messages.length, 2)
    assert.ok(messages.every(message => message.Generation === subscriptions[0].Generation && message.Id === 'root'))
    assert.deepEqual(messages.map(message => message.OccurrenceId).sort(), ['after-opening', 'before-opening'])
  })
})

test('WHAT[concern-routing-006] actual registered Manager Accepted retirement closes its mailbox before returning and replacement never inherits its pending message', async () => {
  await withReview(async ({ hooks, directory, runtime, session, execute }) => {
    const sender = 'mailbox-retirement-sender'
    await admit(runtime, sender)
    const oldMailbox = factPayloads(directory, 'MailboxSubscribed').find(fact => fact.Id === 'root')
    assert.deepEqual(oldMailbox.OwnerSessionId, ['SessionId', session])
    assert.match(await hooks.tool.publish.execute({ id: 'root', message: 'This pending message belongs only to the old life.' }, context(sender, 'old-life-message')), /Message accepted/)
    assert.match(await execute(findings('PERFECT')), /recorded = true/)
    const retirementContext = callID => ({ sessionID: session, callID, messageID: 'review-run', agent: 'manager' })
    assert.match(await hooks.tool.suicide.execute({}, retirementContext('mailbox-confirm')), /confirmation_required = true/)
    assert.deepEqual(factPayloads(directory, 'MailboxRetired'), [])
    assert.match(await hooks.tool.publish.execute({ id: 'root', message: 'Confirmation has not ended this life.' }, context(sender, 'confirmed-life-message')), /Message accepted/)
    assert.match(await hooks.tool.suicide.execute({}, retirementContext('mailbox-retire')), /finished = true/)
    const retirements = factPayloads(directory, 'RetirementCommitted')
    assert.equal(retirements.length, 1)
    assert.equal(retirements[0].Outcome[0], 'Accepted')
    const count = factPayloads(directory, 'MessagePublished').length
    const late = await hooks.tool.publish.execute({ id: 'root', message: 'Too late for the retired life.' }, context(sender, 'late-old-life'))
    assert.match(late, /Concern address `root` has no live mailbox; nothing was published/)
    assert.equal(factPayloads(directory, 'MessagePublished').length, count)
    const replacement = 'mailbox-replacement-owner'
    await admit(runtime, replacement, 'manager')
    const root = user(replacement)
    await hooks['chat.message']({ sessionID: replacement, messageID: root.info.id, agent: 'manager' }, { message: root.info, parts: root.parts })
    const freshMailbox = factPayloads(directory, 'MailboxSubscribed').find(fact => fact.Id === 'root' && fact.OwnerSessionId[1] === replacement)
    assert.ok(freshMailbox)
    assert.notEqual(freshMailbox.Generation, oldMailbox.Generation)
    assert.equal(freshMailbox.Concern, oldMailbox.Concern)
    assert.match(await hooks.tool.publish.execute({ id: 'root', message: 'This message belongs to the replacement life.' }, context(sender, 'fresh-life-message')), /Message accepted/)
    const output = { messages: toolBatch(replacement, 'replacement') }
    await hooks['experimental.chat.messages.transform']({}, output)
    const anchor = factPayloads(directory, 'PairProgrammingGuidelineAnchored').find(fact => fact.SessionId[1] === replacement)
    assert.ok(anchor)
    assert.deepEqual(anchor.ConcernPlacement, { AnnouncedGenerations: [freshMailbox.Generation], DeliveredMessages: ['fresh-life-message'] })
    assert.equal(anchor.MarkerText.includes('This pending message belongs only to the old life.'), false)
    assert.equal(anchor.MarkerText.includes('Confirmation has not ended this life.'), false)
    assert.ok(anchor.MarkerText.includes('This message belongs to the replacement life.'))
    assert.ok(output.messages.at(-1).parts[0].state.output.includes(anchor.MarkerText))
    assert.deepEqual(factPayloads(directory, 'RetirementCommitted'), retirements)
  })
})

test('WHAT[concern-routing-006] actual registered Manager Continue retirement preserves its mailbox generation for the continuing Road', async () => {
  await withReview(async ({ hooks, directory, runtime, session, execute }) => {
    const sender = 'continue-mailbox-sender'
    await admit(runtime, sender)
    const subscriptions = factPayloads(directory, 'MailboxSubscribed')
    assert.equal(subscriptions.length, 1)
    assert.match(await execute(findings('REVISE')), /recorded = true/)
    const retirementContext = callID => ({ sessionID: session, callID, messageID: 'review-run', agent: 'manager' })
    assert.match(await hooks.tool.suicide.execute({}, retirementContext('continue-confirm')), /confirmation_required = true/)
    assert.match(await hooks.tool.publish.execute({ id: 'root', message: 'Accepted after confirmation.' }, context(sender, 'continue-confirmed-message')), /Message accepted/)
    assert.match(await hooks.tool.suicide.execute({}, retirementContext('continue-retire')), /finished = true/)
    const retirements = factPayloads(directory, 'RetirementCommitted')
    assert.equal(retirements.length, 1)
    assert.equal(retirements[0].Outcome, 'Continue')
    assert.match(await hooks.tool.publish.execute({ id: 'root', message: 'The Road continues with the same mailbox.' }, context(sender, 'continue-retired-message')), /Message accepted/)
    assert.deepEqual(factPayloads(directory, 'MailboxSubscribed'), subscriptions)
    assert.deepEqual(factPayloads(directory, 'MailboxRetired'), [])
    const messages = factPayloads(directory, 'MessagePublished')
    assert.equal(messages.length, 2)
    assert.ok(messages.every(message => message.Generation === subscriptions[0].Generation))
  })
})

test('WHAT[concern-routing-006] actual Accepted retirement alone restores a closed mailbox with no pending delivery in a new process', async () => {
  await withReview(async ({ hooks, directory, runtime, session, execute }) => {
    const sender = 'cold-mailbox-sender'
    await admit(runtime, sender)
    const mailbox = factPayloads(directory, 'MailboxSubscribed').find(fact => fact.Id === 'root')
    assert.match(await hooks.tool.publish.execute({ id: 'root', message: 'Do not inherit this old life message.' }, context(sender, 'cold-old-message')), /Message accepted/)
    assert.match(await execute(findings('PERFECT')), /recorded = true/)
    const retirementContext = callID => ({ sessionID: session, callID, messageID: 'review-run', agent: 'manager' })
    assert.match(await hooks.tool.suicide.execute({}, retirementContext('cold-mailbox-confirm')), /confirmation_required = true/)
    assert.match(await hooks.tool.suicide.execute({}, retirementContext('cold-mailbox-retire')), /finished = true/)
    assert.deepEqual(factPayloads(directory, 'MailboxRetired'), [], 'the original retirement fact closes the mailbox without a second append')
    const originalLines = journalEventLines(directory)
    const cold = JSON.parse(execFileSync(process.execPath, [
      fileURLToPath(new URL('./support/mailbox-cold-child.mjs', import.meta.url)), directory, session, mailbox.Generation,
    ], { encoding: 'utf8' }))
    assert.notEqual(cold.pid, process.pid)
    assert.deepEqual(cold, { pid: cold.pid, view: {
      mailbox: { id: 'root', concern: mailbox.Concern, generation: mailbox.Generation, owner: session, active: false },
      pendingOccurrenceIds: [], pendingMessages: [],
    } })
    const after = new Set(journalEventLines(directory))
    assert.ok(originalLines.every(line => after.has(line)), 'cold acquisition retains every original event byte')
    assert.deepEqual(factPayloads(directory, 'MailboxRetired'), [])
    assert.equal(factPayloads(directory, 'RetirementCommitted').length, 1)
    assert.equal(factPayloads(directory, 'MessagePublished').length, 1)
  })
})

test.todo('WHAT[concern-routing-006] same Session new life, abnormal terminal, and historical post-Accepted publications reconcile exact mailbox generations (GAP-155)')
