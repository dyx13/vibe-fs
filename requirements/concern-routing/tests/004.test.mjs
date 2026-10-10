import assert from 'node:assert/strict'
import test from 'node:test'
import * as concern from '../../../dist/Interaction/Concern/Surface.js'
import { withExecutablePlugin } from '../../verification-system/tests/support/plugin-fixture.mjs'
import { factPayloads } from '../../verification-system/tests/e2e/support/journal-observer.js'
import { admit, context, user, toolBatch } from './support/plugin.mjs'

test('WHAT[concern-routing-004] pure prepare is non-consuming and successful placement updates coverage', () => {
  let state = concern.subscribe('owner-a', 'gen-1', 'build', 'build health', concern.empty()).state
  state = concern.publish('sender', 'msg-1', 'build', 'failure found', state).state

  const preparedA = concern.prepare('owner-a', state)
  const preparedB = concern.prepare('owner-a', state)
  assert.deepEqual(preparedA, preparedB, 'preparation from identical facts is stable and non-consuming')
  assert.deepEqual(preparedA.messages, [{ id: 'build', message: 'failure found' }])

  state = concern.place('owner-a', preparedA.announcedGenerations, preparedA.deliveredMessages, state).state
  assert.deepEqual(concern.prepare('owner-a', state).messages, [])
})

test('WHAT[concern-routing-004] invalid delivery rejects the entire placement including otherwise-valid announcement coverage', () => {
  let state = concern.subscribe('owner', 'generation', 'address', 'health', concern.empty()).state
  state = concern.publish('sender', 'message', 'address', 'evidence', state).state
  const pending = concern.prepare('owner', state)
  for (const [recipient, announcements, messages] of [
    ['owner', pending.announcedGenerations, ['message', 'missing']],
    ['other', pending.announcedGenerations, pending.deliveredMessages],
    ['owner', ['unknown-generation'], pending.deliveredMessages],
  ]) {
    const rejected = concern.place(recipient, announcements, messages, state)
    assert.equal(rejected.ok, false)
    assert.deepEqual(concern.prepare('owner', rejected.state), pending)
  }
})

test('WHAT[concern-routing-004] actual registered transform freezes an old Pair Hint and delivers new messages only in a later occurrence', async () => {
  await withExecutablePlugin(async (hooks, directory, _created, runtime) => {
    const owner = 'pair-mailbox-owner'
    const sender = 'pair-mailbox-sender'
    await admit(runtime, owner, 'manager')
    const root = user(owner)
    await hooks['chat.message']({ sessionID: owner, messageID: root.info.id, agent: 'manager' }, { message: root.info, parts: root.parts })
    await admit(runtime, sender)
    const subscriptions = factPayloads(directory, 'MailboxSubscribed')
    assert.equal(subscriptions.length, 1)
    assert.equal(subscriptions[0].Id, 'root')
    assert.deepEqual(subscriptions[0].OwnerSessionId, ['SessionId', owner])
    const publish = async (callID, message) => {
      const prompts = structuredClone(runtime.prompts)
      const abortedIds = [...runtime.abortedIds]
      const result = await hooks.tool.publish.execute({ id: 'root', message }, context(sender, callID))
      assert.match(result, /Message accepted for concern `root`/)
      assert.deepEqual(runtime.prompts, prompts)
      assert.deepEqual(runtime.abortedIds, abortedIds)
    }
    const project = async messages => {
      const output = { messages: structuredClone(messages) }
      await hooks['experimental.chat.messages.transform']({}, output)
      return output.messages
    }
    await publish('pair-first-publication', 'The first inspected result is available.')
    assert.deepEqual(factPayloads(directory, 'MessagePublished'), [{
      OccurrenceId: 'pair-first-publication', Id: 'root', Generation: subscriptions[0].Generation,
      SenderSessionId: ['SessionId', sender], Message: 'The first inspected result is available.',
    }])
    assert.deepEqual(factPayloads(directory, 'PairProgrammingGuidelineAnchored'), [])
    const original = toolBatch(owner, 'first')
    const first = await project(original)
    const firstFacts = factPayloads(directory, 'PairProgrammingGuidelineAnchored')
    assert.equal(firstFacts.length, 1)
    assert.equal(firstFacts[0].Ordinal, '1')
    assert.deepEqual(firstFacts[0].SessionId, ['SessionId', owner])
    assert.deepEqual(firstFacts[0].ResultGap, ['After', ['TranscriptMessageAddress', 'completed-first']])
    assert.deepEqual(firstFacts[0].ConcernPlacement, {
      AnnouncedGenerations: [subscriptions[0].Generation],
      DeliveredMessages: ['pair-first-publication'],
    })
    assert.ok(firstFacts[0].MarkerText.includes('The first inspected result is available.'))
    assert.ok(first.at(-1).parts[0].state.output.includes(firstFacts[0].MarkerText))
    await publish('pair-second-publication', 'The later result must wait for a new hint.')
    const publications = factPayloads(directory, 'MessagePublished')
    assert.equal(publications.length, 2)
    assert.deepEqual(publications.find(fact => fact.OccurrenceId === 'pair-second-publication'), {
      OccurrenceId: 'pair-second-publication', Id: 'root', Generation: subscriptions[0].Generation,
      SenderSessionId: ['SessionId', sender], Message: 'The later result must wait for a new hint.',
    })
    for (const input of [original, first]) {
      const replay = await project(input)
      assert.deepEqual(replay, first, 'old raw and decorated input replay the whole frozen payload')
      assert.equal(JSON.stringify(replay), JSON.stringify(first), 'the actual provider output retains identical serialized bytes')
    }
    assert.deepEqual(factPayloads(directory, 'PairProgrammingGuidelineAnchored'), firstFacts)
    const later = await project([...original, ...toolBatch(owner, 'second')])
    const facts = factPayloads(directory, 'PairProgrammingGuidelineAnchored').sort((left, right) => Number(left.Ordinal) - Number(right.Ordinal))
    assert.equal(facts.length, 2)
    assert.deepEqual(facts[0], firstFacts[0])
    assert.equal(facts[1].Ordinal, '2')
    assert.deepEqual(facts[1].SessionId, ['SessionId', owner])
    assert.deepEqual(facts[1].ResultGap, ['After', ['TranscriptMessageAddress', 'completed-second']])
    assert.deepEqual(facts[1].ConcernPlacement, {
      AnnouncedGenerations: [],
      DeliveredMessages: ['pair-second-publication'],
    })
    assert.ok(facts[1].MarkerText.includes('The later result must wait for a new hint.'))
    assert.equal(facts[1].MarkerText.includes('The first inspected result is available.'), false)
    assert.ok(later.at(-1).parts[0].state.output.includes(facts[1].MarkerText))
    const replay = await project(later)
    assert.deepEqual(replay, later)
    assert.equal(JSON.stringify(replay), JSON.stringify(later))
    assert.deepEqual(factPayloads(directory, 'PairProgrammingGuidelineAnchored').sort((left, right) => Number(left.Ordinal) - Number(right.Ordinal)), facts)
    assert.deepEqual(runtime.prompts.filter(prompt => [owner, sender].includes(prompt.sessionID)), [])
    assert.deepEqual(runtime.abortedIds.filter(session => [owner, sender].includes(session)), [])
  })
})
