import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  coldWorkSnapshot,
  forkCall,
  joinCall,
  observeTerminals,
  physicalUserMessageOf,
  withRealFork,
} from '../../delegation/tests/support/real-fork.mjs'
import { clearDeliveredValue, deliveredViewOf } from '../../../dist/Repository/Programming/Js/RuntimeSurface.js'

// managed-session-lifecycle: a proven child terminal must always produce an
// observable settlement. The incident class these tests pin: the child run
// reached Terminal(Completed) in the journal, but no HandleWorkCompleted was
// ever appended, so the parent join waited forever and only shutdown
// cancellation ended it.
//
// Every case below runs on the real plugin path. The child delivers through a
// real `this.deliver` (the only writer of the durable delivery witness), the
// terminal is published by production through `message.updated` → `session.idle`,
// and the parent joins through a real `this.join`. The only injected fault is a
// real append failure: the durable event log is made unwritable by the
// filesystem, so the writer's own EACCES is what breaks the settlement.

/** The durable event log of one workspace, made unwritable by the filesystem. */
const poisonEvents = (directory) => {
  const eventsDir = join(directory, '.Herdchestra', 'wanxiangshu', 'events')
  const files = readdirSync(eventsDir)
  for (const file of files) chmodSync(join(eventsDir, file), 0o444)
  return {
    restore: () => {
      for (const file of files) {
        try {
          chmodSync(join(eventsDir, file), 0o600)
        } catch {
          /* the workspace is removed right after */
        }
      }
    },
  }
}

/**
 * One real child turn, up to (but not including) the terminal publication.
 * The caller decides when the terminal is published — that is the seam the
 * settlement faults need.
 */
const deliverTurn = async (hooks, runtime, child, run, prose, material) => {
  const physical = physicalUserMessageOf(runtime, child)
  const assistant = {
    info: {
      id: run,
      role: 'assistant',
      sessionID: child,
      parentID: physical.id,
      agent: 'engineer',
      providerID: 'provider',
      modelID: 'engineer-model',
      time: { created: 2 },
    },
    parts: [{ type: 'text', text: prose }],
  }
  runtime.pushHostMessage(child, assistant)
  await hooks['experimental.chat.messages.transform']({ sessionID: child }, {
    messages: [
      {
        info: {
          id: physical.id,
          role: 'user',
          sessionID: child,
          agent: 'engineer',
          model: { providerID: 'provider', modelID: 'engineer-model' },
          time: { created: 1 },
        },
        parts: physical.parts ?? [],
      },
    ],
  })
  await hooks.tool['todowrite-for-engineer'].execute(
    {
      program: `class Js extends JsProgram { async run() { await this.deliver([${JSON.stringify(material)}]); } }`,
          prefixUntil: 0,
          carry: []
        },
    { sessionID: child, agent: 'engineer', callID: `call-${run}`, messageID: run },
  )
  return assistant
}

/** The assistant message the host observes as the completed turn. */
const publishMessageUpdate = async (hooks, assistant) => {
  assistant.info.time.completed = 3
  assistant.info.finish = 'stop'
  await hooks.event({ event: { type: 'message.updated', properties: { info: assistant.info } } })
}

/** The idle signal that makes the host publish the child's terminal. */
const publishSessionIdle = async (hooks, child) => {
  await hooks.event({ event: { type: 'session.idle', properties: { sessionID: child } } })
}

/** Publish the terminal of one assistant message, the way the host does. */
const publishTerminal = async (hooks, assistant, child) => {
  await publishMessageUpdate(hooks, assistant)
  await publishSessionIdle(hooks, child)
}

/** A join that must terminate: a hung join is a failure, not a slow success. */
const joinWithin = async (hooks, owner, timeoutMs = 15000) => {
  let timer
  try {
    const outcome = await Promise.race([
      joinCall(hooks, owner),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve('JOIN-HUNG'), timeoutMs)
      }),
    ])
    assert.notEqual(outcome, 'JOIN-HUNG', 'the join must terminate, never hang')
    return String(outcome)
  } finally {
    clearTimeout(timer)
  }
}

test('WHAT[managed-session-lifecycle-028] a faulted view read degrades to an empty record and still settles the completed child', async () => {
  const owner = 'manager-settlement-workrecord-fault'
  await withRealFork(owner, async ({ hooks, createdIds, runtime, directory }) => {
    const terminals = await observeTerminals(runtime)
    try {
      const placed = await forkCall(hooks, owner, 'Ada', 'WORK-RECORD-FAULT-CHARGE')
      assert.match(placed, /Ada/)
      const child = createdIds[0]
      const run = `run-${child}-1`

      // The delivery is real: production commits the durable delivery
      // witness for it.
      const assistant = await deliverTurn(
        hooks,
        runtime,
        child,
        run,
        'PROSE',
        'WORK-RECORD-FAULT-DONE',
      )

      // The process-live delivery cell is lost — the child's view read now
      // yields nothing at all. The delivery itself stays proven: the durable
      // witness is the proof and it carries the material.
      clearDeliveredValue(child)
      assert.equal(deliveredViewOf(child), null, 'the live delivery cell is gone')

      await publishTerminal(hooks, assistant, child)
      await terminals.awaitRun(child, run)

      // The proven terminal still settles: the durable work is joinable and
      // the join returns the material that was delivered.
      const works = await coldWorkSnapshot(directory, owner)
      assert.ok(works.length > 0, 'the owner keeps a delivered view')
      assert.equal(works[0].lifecycle, 'CompletedAwaitingJoin', 'the completion cell is joinable')

      const joined = await joinWithin(hooks, owner)
      assert.match(joined, /ok = true/, `the join resolved with an explicit outcome: ${joined}`)
      assert.match(joined, /WORK-RECORD-FAULT-DONE/, 'the delivered material is returned')
    } finally {
      terminals.dispose()
    }
  })
})

test('WHAT[managed-session-lifecycle-028] a proven terminal that faults during settlement resolves the run with an explicit failure instead of stranding the join', async () => {
  const owner = 'manager-settlement-delivery-fault'
  await withRealFork(owner, async ({ hooks, createdIds, runtime, directory }) => {
    const terminals = await observeTerminals(runtime)
    let poison = null
    try {
      const placed = await forkCall(hooks, owner, 'Ada', 'DELIVERY-FAULT-CHARGE')
      assert.match(placed, /Ada/)
      const child = createdIds[0]
      const run = `run-${child}-1`

      const assistant = await deliverTurn(
        hooks,
        runtime,
        child,
        run,
        'PROSE',
        'DELIVERY-FAULT-DONE',
      )
      await publishTerminal(hooks, assistant, child)
      await terminals.awaitRun(child, run)

      // The terminal was proven and its completion is durable: the work unit
      // is joinable.
      const before = await coldWorkSnapshot(directory, owner)
      assert.equal(before.length, 1)
      assert.equal(before[0].lifecycle, 'CompletedAwaitingJoin')

      // The settlement of that terminal now faults: the durable log is
      // unwritable, so the writer's own append fails.
      poison = poisonEvents(directory)

      // The join must terminate: the completion is consumable or the failure
      // is explicit, never an endless wait.
      const joined = await joinWithin(hooks, owner)
      assert.match(joined, /ok = false/, `the join surfaced an explicit failure: ${joined}`)
      assert.match(joined, /code = "not-ready"/, `the join reported the settlement failure: ${joined}`)

      // The failed settlement releases nothing: the work unit stays joinable
      // and its durable completion is untouched.
      const after = await coldWorkSnapshot(directory, owner)
      assert.equal(after.length, 1)
      assert.equal(after[0].lifecycle, 'CompletedAwaitingJoin')
    } finally {
      poison?.restore()
      terminals.dispose()
    }
  })
})

test('WHAT[managed-session-lifecycle-028] a PERSIST-settled Source with durable work still Active wakes the join instead of hanging on the journal revision', async () => {
  const owner = 'manager-settlement-persist-source'
  await withRealFork(owner, async ({ hooks, createdIds, runtime, directory }) => {
    const terminals = await observeTerminals(runtime)
    let poison = null
    try {
      const placed = await forkCall(hooks, owner, 'Ada', 'PERSIST-SOURCE-CHARGE')
      assert.match(placed, /Ada/)
      const child = createdIds[0]
      const run = `run-${child}-1`

      const assistant = await deliverTurn(
        hooks,
        runtime,
        child,
        run,
        'PROSE',
        'PERSIST-SOURCE-ANSWER',
      )

      // The turn is complete; the delivery is proven. The durable log is
      // unwritable from here on, so the settlement of the terminal cannot
      // commit its completion.
      await publishMessageUpdate(hooks, assistant)
      poison = poisonEvents(directory)

      // The idle signal cannot be persisted — the host reports the append
      // failure and the run settles as an explicit failure.
      let persistenceFailed = false
      try {
        await publishSessionIdle(hooks, child)
      } catch (error) {
        persistenceFailed = true
        assert.match(
          String(error),
          /persistence failed|CommitUnknown|append/i,
          `the host reported the durable append failure: ${error}`,
        )
      }

      // The run resolves with an explicit failure instead of silence.
      await terminals.awaitRun(child, undefined, { kind: 'Failed' })
      const failure = terminals.seen.find((entry) => entry.outcome?.kind === 'Failed')
      assert.ok(
        failure || persistenceFailed,
        'the settlement failure surfaced as an explicit terminal or an explicit persistence error',
      )

      // The join wakes on the settled Source; it does not wait for a journal
      // revision that can never advance.
      const joined = await joinWithin(hooks, owner)
      assert.match(joined, /ok = false/, `the join surfaced the settlement failure: ${joined}`)
      assert.match(joined, /code = "not-ready"/, `the join reported the settlement failure: ${joined}`)

      // The durable work is NOT released: it stays Active. An unknown durable
      // commit must not permit new work or masquerade as a success.
      const works = await coldWorkSnapshot(directory, owner)
      assert.equal(works.length, 1)
      assert.equal(works[0].lifecycle, 'Active')
    } finally {
      poison?.restore()
      terminals.dispose()
    }
  })
})
