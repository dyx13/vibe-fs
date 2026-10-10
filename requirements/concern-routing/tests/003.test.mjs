import assert from 'node:assert/strict'
import test from 'node:test'
import * as concern from '../../../dist/Interaction/Concern/Surface.js'
import { withExecutablePlugin, observeAuthority } from '../../verification-system/tests/support/plugin-fixture.mjs'
import { admit, context, user } from './support/plugin.mjs'
import { factPayloads } from '../../verification-system/tests/e2e/support/journal-observer.js'
import { withAppendRefusal } from '../../../dist/Verification/JournalPortObservationSurface.js'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createOpencodeClient } from '@opencode-ai/sdk'

const admitRoot = async (hooks, runtime, session) => {
  await admit(runtime, session, 'manager')
  const message = user(session)
  await hooks['chat.message']({ sessionID: session, messageID: message.info.id, agent: 'manager' }, { message: message.info, parts: message.parts })
}

test('WHAT[concern-routing-003] publish fails closed for unknown and stale generations instead of retargeting', () => {
  assert.equal(concern.publish('sender', 'msg-0', 'missing', 'x', concern.empty()).ok, false)

  let state = concern.subscribe('owner-a', 'gen-1', 'build', 'build health', concern.empty()).state
  state = concern.retire('owner-a', 'build', 'gen-1', state).state
  state = concern.subscribe('owner-b', 'gen-2', 'build', 'build health', state).state
  const stale = concern.applyPublishedClaim('sender', 'msg-1', 'build', 'gen-1', 'old generation', state)
  assert.equal(stale.ok, false)
})

test('WHAT[concern-routing-003] message projection distinguishes replay, conflicting material and distinct occurrences with identical text', () => {
  const subscribed = concern.subscribe('owner', 'generation', 'address', 'health', concern.empty()).state
  const first = concern.publish('sender', 'message-1', 'address', 'evidence', subscribed)
  assert.equal(first.ok, true)
  const replay = concern.applyPublishedClaim('sender', 'message-1', 'address', 'generation', 'evidence', first.state)
  assert.equal(replay.ok, true)
  assert.equal(concern.prepare('owner', replay.state).messages.length, 1)
  for (const [sender, id, generation, message] of [
    ['other', 'address', 'generation', 'evidence'],
    ['sender', 'different', 'generation', 'evidence'],
    ['sender', 'address', 'other-generation', 'evidence'],
    ['sender', 'address', 'generation', 'changed evidence'],
  ]) {
    const conflict = concern.applyPublishedClaim(sender, 'message-1', id, generation, message, first.state)
    assert.equal(conflict.ok, false)
    assert.deepEqual(concern.prepare('owner', conflict.state), concern.prepare('owner', first.state))
  }
  const second = concern.publish('sender', 'message-2', 'address', 'evidence', first.state)
  assert.equal(second.ok, true)
  assert.equal(concern.prepare('owner', second.state).messages.length, 2)
})

test('WHAT[concern-routing-003] actual registered publish copies to live root before the SDK notification and preserves the exact message', async () => {
  await withExecutablePlugin(async (hooks, directory, _created, runtime) => {
    const session = 'notification-root'
    await admitRoot(hooks, runtime, session)
    const notifications = []
    runtime.client.tui = {
      async showToast(args) {
        assert.strictEqual(this, runtime.client.tui)
        assert.equal(args.responseStyle, 'fields')
        const copies = factPayloads(directory, 'MessagePublished')
        assert.equal(copies.length, 1, 'the root copy has settled before notification')
        notifications.push(args)
        return { data: true }
      },
    }
    const message = 'The inspected source now has a verified result.'
    const result = await hooks.tool.publish.execute({ id: 'user', message }, context(session, 'notification-call', 'manager'))
    assert.match(result, /Message accepted for concern `user`/)
    assert.equal(notifications.length, 1)
    assert.deepEqual(notifications[0].body, { title: '# Message for you\n', message, variant: 'info' })
    const copy = factPayloads(directory, 'MessagePublished')[0]
    assert.equal(copy.Id, 'root')
    assert.equal(copy.Message, message)
    assert.equal(copy.OccurrenceId, 'notification-call:root')
    assert.deepEqual(copy.SenderSessionId, ['SessionId', session])
    assert.deepEqual(runtime.prompts, [])
    assert.deepEqual(runtime.abortedIds, [])
  })
})

test('WHAT[concern-routing-003] actual installed SDK receives the explicit fields response style even when its client defaults to data', async () => {
  const requests = []
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    requests.push({ method: request.method, url: request.url, body: JSON.parse(Buffer.concat(chunks).toString()) })
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end('true')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    await withExecutablePlugin(async (hooks, directory, _created, runtime) => {
      const session = 'installed-sdk-notification-root'
      await admitRoot(hooks, runtime, session)
      const client = createOpencodeClient({ baseUrl: `http://127.0.0.1:${server.address().port}`, responseStyle: 'data' })
      runtime.client.tui = client.tui
      const message = 'The actual SDK accepts this notification.'
      assert.match(await hooks.tool.publish.execute({ id: 'user', message }, context(session, 'installed-sdk-notification', 'manager')), /Message accepted for concern `user`/)
      assert.deepEqual(requests, [{ method: 'POST', url: '/tui/show-toast', body: { title: '# Message for you\n', message, variant: 'info' } }])
      assert.equal(factPayloads(directory, 'MessagePublished').length, 1)
    })
  } finally {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('WHAT[concern-routing-003] actual user publication reports a missing notification transport instead of success after copying to root', async () => {
  await withExecutablePlugin(async (hooks, directory, _created, runtime) => {
    const session = 'missing-notification-root'
    await admitRoot(hooks, runtime, session)
    const result = await hooks.tool.publish.execute({ id: 'user', message: 'A notification requires its actual transport.' }, context(session, 'missing-notification', 'manager'))
    assert.match(result, /notification.*unavailable/i)
    assert.equal(factPayloads(directory, 'MessagePublished').length, 1)
    assert.deepEqual(runtime.prompts, [])
    assert.deepEqual(runtime.abortedIds, [])
  })
})

test('WHAT[concern-routing-003] actual user publication waits for the SDK acceptance without creating a prompt or authority', async () => {
  await withExecutablePlugin(async (hooks, directory, _created, runtime) => {
    const session = 'paused-notification-root'
    await admitRoot(hooks, runtime, session)
    const authority = observeAuthority(runtime, session)
    let notify
    const entered = new Promise(resolve => { notify = resolve })
    let release
    const response = new Promise(resolve => { release = resolve })
    runtime.client.tui = { showToast: () => { notify(); return response } }
    let returned = false
    const publication = hooks.tool.publish.execute({ id: 'user', message: 'Await the real notification response.' }, context(session, 'paused-notification', 'manager'))
      .then(result => { returned = true; return result })
    let timeout
    try {
      await Promise.race([entered, new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('notification transport was not entered')), 1500)
      })])
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(returned, false, 'a prepared notification cannot be reported as accepted')
      assert.equal(factPayloads(directory, 'MessagePublished').length, 1)
      assert.deepEqual(observeAuthority(runtime, session), authority)
      assert.deepEqual(runtime.prompts, [])
      assert.deepEqual(runtime.abortedIds, [])
      release({ data: true })
      assert.match(await publication, /Message accepted for concern `user`/)
    } finally {
      clearTimeout(timeout)
      release({ data: true })
      await Promise.allSettled([publication])
    }
  })
})

for (const [name, notifier] of [
  ['missing method', {}],
  ['non-callable method', { showToast: true }],
  ['false', { showToast: async () => ({ data: false }) }],
  ['null', { showToast: async () => null }],
  ['undefined', { showToast: async () => undefined }],
  ['empty result', { showToast: async () => ({}) }],
  ['non-boolean data', { showToast: async () => ({ data: 'true' }) }],
  ['SDK error', { showToast: async () => ({ error: { message: 'transport rejected' } }) }],
  ['contradictory SDK error', { showToast: async () => ({ data: true, error: { message: 'transport rejected' } }) }],
  ['synchronous throw', { showToast: () => { throw new Error('notification adapter failed') } }],
  ['rejected promise', { showToast: async () => { throw new Error('notification transport failed') } }],
  ['null rejection', { showToast: () => Promise.reject(null) }],
  ['undefined rejection', { showToast: () => Promise.reject(undefined) }],
]) {
  test(`WHAT[concern-routing-003] actual user publication rejects ${name} and retains its accepted root copy`, async () => {
    await withExecutablePlugin(async (hooks, directory, _created, runtime) => {
      const session = 'rejected-notification-root'
      await admitRoot(hooks, runtime, session)
      runtime.client.tui = notifier
      const result = await hooks.tool.publish.execute({ id: 'user', message: 'Keep the durable copy when notification fails.' }, context(session, 'rejected-notification', 'manager'))
      assert.match(result, /notification.*unavailable/i)
      assert.equal(factPayloads(directory, 'MessagePublished').length, 1)
      assert.deepEqual(runtime.prompts, [])
      assert.deepEqual(runtime.abortedIds, [])
    })
  })
}

test('WHAT[concern-routing-003] a failed user notification can retry the same occurrence while conflicting material sends nothing', async () => {
  await withExecutablePlugin(async (hooks, directory, _created, runtime) => {
    const session = 'retry-notification-root'
    await admitRoot(hooks, runtime, session)
    const call = context(session, 'retry-notification', 'manager')
    const args = { id: 'user', message: 'Retry the same accepted publication.' }
    assert.match(await hooks.tool.publish.execute(args, call), /notification.*unavailable/i)
    let notifications = 0
    runtime.client.tui = { showToast: async () => { notifications += 1; return { data: true } } }
    assert.match(await hooks.tool.publish.execute(args, call), /Message accepted for concern `user`/)
    assert.equal(notifications, 1)
    assert.equal(factPayloads(directory, 'MessagePublished').length, 1)
    assert.match(await hooks.tool.publish.execute({ ...args, message: 'Conflicting retry.' }, call), /conflict/i)
    assert.equal(notifications, 1)
    assert.equal(factPayloads(directory, 'MessagePublished')[0].Message, args.message)
  })
})

test('WHAT[concern-routing-003] a refused root publication sends no user notification and reports durable unavailability', async () => {
  await withExecutablePlugin(async (hooks, directory, _created, runtime) => {
    const session = 'refused-notification-root'
    await admitRoot(hooks, runtime, session)
    let notifications = 0
    runtime.client.tui = { showToast: async () => { notifications += 1; return { data: true } } }
    const refused = await withAppendRefusal(runtime.journal, 'publication', () => hooks.tool.publish.execute(
      { id: 'user', message: 'A refused root copy cannot authorize notification.' }, context(session, 'refused-notification', 'manager')))
    assert.equal(refused.refused, 1)
    assert.match(refused.value, /durable participant state could not be recorded/i)
    assert.equal(notifications, 0)
    assert.deepEqual(factPayloads(directory, 'MessagePublished'), [])
  })
})

test('WHAT[concern-routing-003] user publication still uses the notification transport when root has no live mailbox', async () => {
  await withExecutablePlugin(async (hooks, directory, _created, runtime) => {
    const session = 'notification-without-root'
    await admit(runtime, session, 'manager')
    assert.deepEqual(factPayloads(directory, 'MailboxSubscribed'), [])
    let notifications = 0
    runtime.client.tui = { showToast: async () => { notifications += 1; return { data: true } } }
    assert.match(await hooks.tool.publish.execute({ id: 'user', message: 'Notify even without a root mailbox.' }, context(session, 'no-root-notification', 'manager')), /Message accepted for concern `user`/)
    assert.equal(notifications, 1)
    assert.deepEqual(factPayloads(directory, 'MessagePublished'), [])
  })
})

test('WHAT[concern-routing-003] reserved user address has no live mailbox at projection level', () => {
  let state = concern.subscribe('root-owner', 'gen-root', 'root', 'user-facing session', concern.empty()).state
  const toUser = concern.publish('sender', 'msg-user', 'user', 'hello human', state)
  assert.equal(toUser.ok, false)
  assert.deepEqual(concern.prepare('root-owner', toUser.state), concern.prepare('root-owner', state))
})

test('WHAT[concern-routing-003] publish to root without a live mailbox is rejected with a diagnosis', () => {
  const before = concern.empty()
  const result = concern.publish('sender', 'msg-root', 'root', 'hello root', before)
  assert.equal(result.ok, false)
  assert.match(result.error, /no live mailbox/)
  assert.deepEqual(concern.prepare('sender', result.state), concern.prepare('sender', before))
})

test('WHAT[concern-routing-003] publish to a live root mailbox is accepted and routed only to the root owner', () => {
  let state = concern.subscribe('root-owner', 'gen-root', 'root', 'user-facing session', concern.empty()).state
  const result = concern.publish('sender', 'msg-copy', 'root', 'hello root', state)
  assert.equal(result.ok, true)
  assert.deepEqual(concern.prepare('root-owner', result.state).messages, [{ id: 'root', message: 'hello root' }])
  assert.deepEqual(concern.prepare('bystander', result.state).messages, [])
})
