import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import * as Strength from '../../../dist/Strength/Surface.js'
import { createLocalEventStore } from '../../verification-system/tests/support/local-event-store.mjs'
import { strengthDelegationChainEvents } from '../../verification-system/tests/support/strength-delegation-chain.mjs'

test('WHAT[durable-events-025] conflicting Prepared identity returns StorageInvalid without appending a semantic cut', async () => {
  const local = createLocalEventStore()
  try {
    const durability = Strength.durabilityCreate(local.store)
    const H = (text) => `H(${text})`
    const frame = Strength.frameTryBuild(H, [{
      requestOrdinal: 1,
      exchanges: [{ toolName: 'read', canonicalArguments: '{"filePath":"a"}', canonicalResult: 'alpha' }]
    }]).value

    const firstReq = {
      ownerSessionId: 'owner-de025',
      decisionId: 'd-de025',
      targetProviderRun: 'run-1',
      replicaSessionId: 'rep-1',
      anchorDigest: 'anchor-a',
      bundle: frame,
    }

    // The Prepared fact carries a deterministic parent edge to its DelegationBound
    // fact, so the causal chain must land first. The chain goes through the
    // durability port because durabilityPublishPrepared derives the Bound parent id
    // with the host digest, not with the test-local H.
    const chain = strengthDelegationChainEvents(Strength, {
      ownerSessionId: 'owner-de025',
      decisionId: 'd-de025',
      targetProviderRun: 'run-1',
      replicaSessionId: 'rep-1',
      anchorDigest: 'anchor-a',
    })

    for (const [label, event] of [['Requested', chain.requested], ['Bound', chain.bound]]) {
      const appended = await Strength.durabilityAppend(durability, event)
      assert.equal(appended.ok, true, `append Strength ${label} fact: ${JSON.stringify(appended.error)}`)
    }

    const firstPublished = await Strength.durabilityPublishPrepared(durability, firstReq)
    assert.equal(firstPublished.kind, 'Published')
    const eventsDirectory = join(local.commonDir, 'wanxiangshu/events')
    const before = readdirSync(eventsDirectory).map((name) => [name, readFileSync(join(eventsDirectory, name), 'utf8')])

    // Conflicting request with different replica/parameters for the same decisionId
    const conflictFrame = Strength.frameTryBuild(H, [{
      requestOrdinal: 1,
      exchanges: [{ toolName: 'grep', canonicalArguments: '{"pattern":"x"}', canonicalResult: 'a:1:x' }]
    }]).value
    const conflictReq = {
      ownerSessionId: 'owner-de025',
      decisionId: 'd-de025',
      targetProviderRun: 'run-1',
      replicaSessionId: 'rep-conflict',
      anchorDigest: 'anchor-b',
      bundle: conflictFrame,
    }

    const conflictOutcome = await Strength.durabilityPublishPrepared(durability, conflictReq)
    assert.equal(conflictOutcome.kind, 'StorageInvalid', 'conflicting prepared identity must return typed rejection')
    const after = readdirSync(eventsDirectory).map((name) => [name, readFileSync(join(eventsDirectory, name), 'utf8')])
    assert.deepEqual(after, before, 'identity collision does not commit either the conflicting fact or a ProjectionCutTail')
  } finally {
    local.close()
  }
})

test.todo('WHAT[durable-events-025] actual Prepared semantic cut prevents transaction file effects; Committed unknown is recovered without assuming not-written')
test.todo('WHAT[durable-events-025] durable typed rejection reaches its unique composition fatal owner through a required capability')
