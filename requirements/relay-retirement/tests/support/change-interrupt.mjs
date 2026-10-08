import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { withExecutablePlugin, acceptAuthorityRoot, configureManagedPlugin } from '../../../verification-system/tests/support/plugin-fixture.mjs'
import { scores } from '../../../relay-assessment/tests/support/plugin.mjs'
import * as dispatch from '../../../../dist/Interaction/Dispatch/DispatchSurface.js'
import * as journal from '../../../../dist/Persistence/Journal/Surface.js'

export const withChangeInterrupt = async (body, { interruptError, splitInstance = false } = {}) => withExecutablePlugin(async (hooks, directory, _created, runtime) => {
  execFileSync('git', ['-C', directory, 'add', '.'])
  execFileSync('git', ['-C', directory, '-c', 'user.name=retirement fixture', '-c', 'user.email=retirement@example.test',
    'commit', '--quiet', '-m', 'fixture'])
  const owner = 'retirement-change-orchestrator'
  const root = 'retirement-change-human-root'
  await acceptAuthorityRoot(runtime, owner, 'orchestrator', root)
  runtime.pushHostMessage(owner, { info: { id: root, role: 'user', sessionID: owner },
    parts: [{ type: 'text', text: 'Deliver the original change and its verification.' }] })
  const activated = Promise.withResolvers()
  const releaseActivation = Promise.withResolvers()
  const abortStarted = Promise.withResolvers()
  const releaseAbort = Promise.withResolvers()
  const sendStarted = Promise.withResolvers()
  const successorAccepted = Promise.withResolvers()
  const order = []
  const prompts = []
  let session
  let initialPhysical
  let managerHooks = hooks
  let managerDirectory = directory
  const send = runtime.client.session.promptAsync
  const abort = runtime.client.session.abort
  const sendThroughInstance = async args => {
    runtime.client.__hooks = args?.path?.id === session ? managerHooks : hooks
    return send(args)
  }
  runtime.client.session.promptAsync = async args => {
    const target = args?.path?.id
    if (!session && args?.body?.agent === 'manager') {
      session = target
      if (splitInstance) {
        managerDirectory = decodeURIComponent(args.headers['x-opencode-directory'])
        assert.notEqual(realpathSync(managerDirectory), realpathSync(directory), 'the Manager uses a real linked worktree')
        const commonDir = cwd => realpathSync(resolve(cwd,
          execFileSync('git', ['-C', cwd, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim()))
        assert.equal(commonDir(managerDirectory), commonDir(directory), 'both actual plugin instances own the same Git family')
        const { default: plugin } = await import('wanxiangshu')
        managerHooks = await plugin.server({ client: runtime.client, directory: managerDirectory,
          events: { listen: () => () => {} } })
        assert.notEqual(managerHooks, hooks)
        await configureManagedPlugin(managerHooks)
      }
      const result = await sendThroughInstance(args)
      initialPhysical = runtime.messages.at(-1).id
      activated.resolve()
      await releaseActivation.promise
      return result
    }
    if (target === session) {
      order.push('successor-send')
      prompts.push(args)
      sendStarted.resolve('send')
      const result = await sendThroughInstance(args)
      successorAccepted.resolve()
      return result
    }
    return sendThroughInstance(args)
  }
  runtime.client.session.abort = async args => {
    if (args?.path?.id !== session) return abort(args)
    order.push('interrupt-started')
    abortStarted.resolve('interrupt')
    await releaseAbort.promise
    if (interruptError) throw interruptError
    const result = await abort(args)
    order.push('interrupt-completed')
    return result
  }
  let commission
  let staleTransform
  try {
    commission = hooks.tool.commission.execute(
      { calling: 'lead', name: 'Original change', charge: 'Deliver the original change and its verification.' },
      { sessionID: owner, agent: 'orchestrator', callID: 'commission-change', messageID: 'orchestrator-run' },
    )
    await Promise.race([
      activated.promise,
      commission.then(result => assert.fail(`commission did not reach Manager activation: ${result}`)),
    ])
    const user = { info: { id: initialPhysical, role: 'user', sessionID: session,
      model: { providerID: 'provider', modelID: 'manager-model' } },
    parts: [{ type: 'text', text: 'Deliver the original change and its verification.' }] }
    runtime.pushHostMessage(session, { info: { id: 'manager-first-run', role: 'assistant', sessionID: session,
      parentID: initialPhysical, time: { created: 1 } }, parts: [] })
    await managerHooks['experimental.chat.messages.transform']({ sessionID: session }, { messages: [user] })
    const assessment = scores('REVISE')
    const review = { info: { id: 'manager-review-run', role: 'assistant', sessionID: session,
      parentID: initialPhysical, time: { created: 2 } }, parts: [
      { type: 'text', text: 'The original change still needs work.' },
      { type: 'tool', tool: 'review', callID: 'review-change', state: { status: 'pending', input: assessment } },
    ] }
    runtime.pushHostMessage(session, review)
    assert.match(await managerHooks.tool.review.execute(assessment,
      { sessionID: session, agent: 'manager', callID: 'review-change', messageID: review.info.id }), /recorded = true/)
    const retirement = { info: { id: 'manager-retirement-run', role: 'assistant', sessionID: session,
      parentID: initialPhysical, time: { created: 3 } }, parts: [
      { type: 'tool', tool: 'suicide', callID: 'retire-change', state: { status: 'completed', input: {}, output: 'finished = true' } },
    ] }
    runtime.pushHostMessage(session, retirement)
    assert.match(await managerHooks.tool.suicide.execute({},
      { sessionID: session, agent: 'manager', callID: 'retire-change', messageID: retirement.info.id }), /finished = true/)
    assert.deepEqual(order, [], 'the suicide body must not interrupt or send another prompt')
    const profile = dispatch.projectionObservation(runtime.journal, session).activeLogicalRun
    const before = journal.JournalSurface_snapshot(runtime.journal).sessionProjections[session].relay.roads[0]
    assert.equal(before.activeIncumbencyPresent, false)
    assert.equal(before.retiredIncumbencyCount, 1)
    const road = () => journal.JournalSurface_snapshot(runtime.journal).sessionProjections[session].relay.roads[0]
    const continueChange = async () => {
      releaseActivation.resolve()
      return Promise.race([abortStarted.promise, sendStarted.promise])
    }
    const startStaleTransform = () => {
      const output = { messages: structuredClone([user, review, retirement]) }
      staleTransform = managerHooks['experimental.chat.messages.transform']({ sessionID: session }, output)
      return staleTransform.then(() => assert.deepEqual(output.messages, []))
    }
    const activateChange = async () => {
      releaseActivation.resolve()
      const result = await commission
      assert.equal(typeof result, 'string', 'actual commission settles only after Change publication starts')
    }
    const openingCount = () => {
      const eventsDirectory = join(directory, '.git', 'wanxiang', 'events')
      return readdirSync(eventsDirectory).filter(name => name.endsWith('.ndjson'))
        .flatMap(name => readFileSync(join(eventsDirectory, name), 'utf8').trim().split('\n'))
        .map(line => JSON.parse(line))
        .filter(envelope => envelope.stream_id === `journal/session/${session}`
          && JSON.stringify(envelope.payload.Fact).includes('"IncumbencyOpened"')).length
    }
    await body({ runtime, session, profile, order, prompts, managerDirectory, continueChange, releaseAbort: () => releaseAbort.resolve(),
      abortStarted: abortStarted.promise, successorAccepted: successorAccepted.promise,
      startStaleTransform, stopLateTransform: startStaleTransform, activateChange, openingCount, road,
      joinResult: () => hooks.tool.join.execute({},
        { sessionID: owner, agent: 'orchestrator', callID: 'join-change', messageID: 'orchestrator-join-run' }) })
  } finally {
    releaseActivation.resolve()
    releaseAbort.resolve()
    if (commission) await commission
    if (staleTransform) await staleTransform.catch(() => {})
    runtime.client.__hooks = hooks
    runtime.client.session.promptAsync = send
    runtime.client.session.abort = abort
    if (managerHooks !== hooks) await managerHooks.dispose()
  }
})
