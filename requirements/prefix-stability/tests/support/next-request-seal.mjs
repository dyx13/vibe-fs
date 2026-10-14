import assert from 'node:assert/strict'
import { withAppendBarrier, withAppendRefusal } from '../../../../dist/Verification/JournalPortObservationSurface.js'
import * as Scope from '../../../../dist/OpenCode/Host/PluginRecoveryScopeSurface.js'
import { configureManagedPlugin, withRestartablePlugin } from '../../../verification-system/tests/support/plugin-fixture.mjs'
import { coveredSession, continuation, failAttempt, facts, observeFact, recordCompletedToolAttempt, state } from './registered-prefix.mjs'

const waitForBarrier = (entered, pending) => Promise.race([
  entered.promise,
  pending.then(() => assert.fail('the real append did not reach its barrier')),
])

export const registeredSealScenario = async target => {
  const sessionID = `ses-next-seal-${target}`
  const nextPhysical = 'msg-seal-next'
  let scope
  let solvingRun
  let runtime
  let directory
  const observed = []
  const observe = () => {
    const current = state(runtime, sessionID)
    return {
      epoch: current.prefixEpoch?.epochId ?? 0n,
      failures: current.providerFailures.consecutiveFailureCount,
      plan: Scope.peekAttempt(scope, sessionID, solvingRun),
      rebases: facts(directory, 'PrefixRebaseCommitted').filter(fact => fact.SessionId[1] === sessionID),
      successes: facts(directory, 'SuccessRecorded').filter(fact => fact.SessionId[1] === sessionID),
      nextStarts: facts(directory, 'ProviderStarted').filter(fact => fact.Key.PhysicalUserMessageId[1] === nextPhysical),
    }
  }
  globalThis.__wanxiangshu_prefix_plan_observe = (kind, actualScope, session, identity) => {
    if (session !== sessionID) return
    scope = actualScope
    if (!solvingRun) return
    if ((kind === 'consume' && identity === solvingRun) || (kind === 'freeze' && identity === nextPhysical)) {
      observed.push({ kind, identity, state: observe() })
    }
  }
  try {
    await withRestartablePlugin(async (start, workspace, host) => {
      directory = workspace
      const hooks = await start()
      await configureManagedPlugin(hooks)
      await host.withRuntime(async journalRuntime => {
        runtime = { ...journalRuntime, ...host }
        const session = await coveredSession(hooks, runtime, directory, sessionID)
        const first = await continuation(hooks, runtime, session, 'msg-seal-first')
        await observeFact(directory, 'FailureRecorded', () => failAttempt(hooks, runtime, session, first, 'Failed'))
        assert.equal(state(runtime, sessionID).providerFailures.consecutiveFailureCount, 1)
        const retry = await continuation(hooks, runtime, session, 'msg-seal-retry', 'ProviderRetryAttempt')
        solvingRun = retry.run.info.id
        const frozen = observe()
        assert.equal(frozen.plan.found, true, 'the observer must see the real plugin scope')
        assert.equal(frozen.plan.view.choice, 'UsePrefixProbe')
        assert.equal(frozen.epoch, 0n)
        assert.equal(frozen.failures, 1)
        assert.equal(frozen.rebases.length, 0)
        const tentativeMemory = retry.projected.messages.filter(message => message.info?.source === 'companion-memory')
        assert.equal(tentativeMemory.length, 1)
        globalThis.__wanxiangshu_prefix_early_consume = process.env.WXS_PREFIX_EARLY_CONSUME === '1'
        recordCompletedToolAttempt(session, retry)
        const nextRequest = () => continuation(hooks, runtime, session, nextPhysical)
        let nextProjection
        if (target === 'success') {
          const rebaseEntered = Promise.withResolvers()
          const rebaseRelease = Promise.withResolvers()
          const successEntered = Promise.withResolvers()
          const successRelease = Promise.withResolvers()
          const pending = withAppendBarrier(runtime.journal, 'prefix-rebase', async () => {
            rebaseEntered.resolve()
            await rebaseRelease.promise
          }, () => withAppendBarrier(runtime.journal, 'provider-success', async () => {
            successEntered.resolve()
            await successRelease.promise
          }, nextRequest))
          try {
            await waitForBarrier(rebaseEntered, pending)
            const parked = observe()
            assert.equal(parked.epoch, 0n)
            assert.equal(parked.failures, 1)
            assert.deepEqual(parked.plan, frozen.plan, 'a parked rebase must retain the frozen plan')
            assert.equal(parked.rebases.length, 0)
            assert.equal(parked.successes.length, 0)
            assert.equal(parked.nextStarts.length, 0)
            assert.deepEqual(observed, [], 'the next seal and consumption must wait for rebase')
            rebaseRelease.resolve()
            await waitForBarrier(successEntered, pending)
            const accounting = observe()
            assert.equal(accounting.epoch, 1n)
            assert.equal(accounting.failures, 1)
            assert.deepEqual(accounting.plan, frozen.plan)
            assert.equal(accounting.rebases.length, 1)
            assert.equal(accounting.successes.length, 0)
            assert.equal(accounting.nextStarts.length, 0)
            assert.deepEqual(observed, [], 'the next seal and consumption must wait for success accounting')
          } finally {
            rebaseRelease.resolve()
            successRelease.resolve()
            nextProjection = (await pending).projected
          }
        } else {
          const refusal = await withAppendRefusal(runtime.journal, target, async () => {
            await assert.rejects(nextRequest, error => {
              assert.match(error.message, target === 'prefix-rebase' ? /prefix rebase commit failed/ : /provider success commit failed/)
              return true
            })
            return true
          })
          assert.equal(refusal.refused, 1, 'the exact real writer append must be refused')
          const refused = observe()
          assert.equal(refused.epoch, target === 'prefix-rebase' ? 0n : 1n)
          assert.equal(refused.rebases.length, target === 'prefix-rebase' ? 0 : 1)
          assert.equal(refused.failures, 1)
          assert.equal(refused.successes.length, 0)
          assert.deepEqual(refused.plan, frozen.plan, 'append refusal must retain the original frozen plan')
          assert.equal(refused.nextStarts.length, 0)
          assert.deepEqual(observed, [], 'append refusal must prevent consumption and the next seal')
          nextProjection = await session.transform(hooks)
        }
        const settled = observe()
        assert.equal(settled.epoch, 1n)
        assert.equal(settled.failures, 0)
        assert.equal(settled.plan.found, false)
        assert.equal(settled.rebases.length, 1, 'retry must not duplicate the committed prefix fact')
        assert.equal(settled.successes.length, 1)
        assert.deepEqual(settled.rebases[0].SolvingProviderRun, ['ProviderRunIdentity', solvingRun])
        assert.deepEqual(settled.successes[0].ProviderRun, ['ProviderRunIdentity', solvingRun])
        const consumed = observed.filter(event => event.kind === 'consume' && event.state.plan.found)
        assert.equal(consumed.length, 1)
        assert.equal(consumed[0].state.epoch, 1n)
        assert.equal(consumed[0].state.failures, 0)
        assert.equal(consumed[0].state.plan.found, true)
        assert.equal(consumed[0].state.successes.length, 1)
        const seals = observed.filter(event => event.kind === 'freeze')
        assert.ok(seals.length > 0, 'the registered transform must freeze the actual next request')
        assert.equal(observed[0].kind, 'consume')
        for (const seal of seals) {
          assert.equal(seal.state.epoch, 1n)
          assert.equal(seal.state.failures, 0)
          assert.equal(seal.state.plan.found, false)
        }
        assert.equal(settled.nextStarts.length, 1)
        assert.deepEqual(settled.nextStarts[0].Evidence.ProviderRun, ['ProviderRunIdentity', `run-${nextPhysical}`])
        assert.equal(settled.nextStarts[0].Evidence.ProjectionChoice, 'UseCommittedEpoch')
        const committedMemory = nextProjection.messages.filter(message => message.info?.source === 'companion-memory')
        assert.equal(committedMemory.length, 1)
        assert.equal(committedMemory[0].info.id, settled.rebases[0].SyntheticMessageId)
        assert.deepEqual(committedMemory[0].parts, tentativeMemory[0].parts, 'the next seal must retain the successful frozen prefix bytes')
      })
    })
  } finally {
    delete globalThis.__wanxiangshu_prefix_plan_observe
    delete globalThis.__wanxiangshu_prefix_early_consume
  }
}
