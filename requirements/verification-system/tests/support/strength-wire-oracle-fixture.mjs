import assert from 'node:assert/strict'
import * as Strength from '../../../../dist/Strength/Surface.js'
import { createLocalEventStore } from './local-event-store.mjs'
import { withHumanRootLoopFixture } from './humanroot-loop-fixture.mjs'

const call = (id, args) => ({ role: 'assistant', tool_calls: [{ id, type: 'function', function: { name: 'js-manager', arguments: JSON.stringify(args) } }] })
const result = (id, content) => ({ role: 'tool', tool_call_id: id, content })
const request = (sessionID, messages, replica = false) => Object.defineProperties({ model: 'test-model-b', messages,
  tools: replica ? [{ type: 'function', function: { name: 'js-predictor', parameters: { type: 'object', properties: {} } } }] : [],
}, { sessionID: { value: sessionID }, providerID: { value: 'test', configurable: true } })

export async function withStrengthWireOracleFixture(action) {
  await withHumanRootLoopFixture(async ({ workDir }) => {
    const local = createLocalEventStore({ commonDir: workDir + '/.git', writerId: 'strength-wire-oracle' })
    try {
      const durability = Strength.durabilityCreate(local.store)
      const legs = []
      const requests = []
      for (const [index, rounds] of [2, 1].entries()) {
        const ownerSessionId = `wire-owner-${index}`
        const replicaSessionId = `wire-replica-${index}`
        const physical = `wire-root-${index}`
        const sourceProviderRun = `wire-source-${index}`
        const targetProviderRun = `wire-target-${index}`
        const sourceCallId = `wire-source-call-${index}`
        const targetCallId = `wire-target-call-${index}`
        const args = { program: 'class Js extends JsProgram { async run() { return { inspected: true } } }',
          estimated_readonly_rounds: rounds, self_note: `survey-${index}` }
        const zero = { program: args.program, estimated_readonly_rounds: 0 }
        for (const event of [Strength.eventRequested({ decisionId: `wire-decision-${index}`, ownerSessionId,
          ownerLogicalRun: { logicalRunId: `wire-logical-${index}`, authorityRootUserMessageId: physical },
          sourcePhysicalUserMessageId: physical, sourceProviderRun, sourceToolCallIds: [sourceCallId],
          requestedRounds: rounds, contractRevision: Strength.protocolRevision }),
          Strength.eventBound(`wire-decision-${index}`, targetProviderRun, replicaSessionId, (index === 0 ? 'a' : 'b').repeat(64))]) {
          const appended = await Strength.durabilityAppend(durability, event)
          assert.equal(appended.ok, true, appended.error)
        }
        const originalText = index === 0
          ? 'STRENGTH_HOST_CANARY: inspect README.md through the real nested Replica path.'
          : 'STRENGTH_RECOVERY: resume the readonly delegation after a provider failure.'
        const user = { role: 'user', content: originalText }
        const sourceMessages = [user, call(sourceCallId, args), result(sourceCallId, '# ok\n\n[data]\ninspected = true')]
        const materialMessages = [...sourceMessages,
          call(`wire-probe-${index}`, { program: 'readonly probe', estimated_readonly_rounds: 0 }),
          result(`wire-probe-${index}`, 'LARGE_READ_PROBE_MARKER actual file bytes'),
          ...(index === 0 ? [{ role: 'assistant', content: '', reasoning_content: 'Read-only survey complete; returning the gathered evidence.' }] : [])]
        const initial = request(ownerSessionId, [user])
        const targetRequest = request(ownerSessionId, materialMessages)
        const final = request(ownerSessionId, [...materialMessages, call(targetCallId, zero), result(targetCallId, '# ok\n\n[data]\ninspected = true')])
        const ownerRequests = [initial, targetRequest, ...(index === 1 ? [request(ownerSessionId, materialMessages)] : []), final]
        const replicaRequests = Array.from({ length: rounds }, () => request(replicaSessionId, [{ role: 'user', content: 'Readonly investigation' }], true))
        requests.push(initial, ...replicaRequests, ...ownerRequests.slice(1))
        const tool = (callID, input) => ({ type: 'tool', tool: 'js-manager', callID, state: { status: 'completed', input } })
        const snapshot = [
          { info: { id: physical, role: 'user' }, parts: [{ type: 'text', text: originalText }] },
          { info: { id: sourceProviderRun, role: 'assistant', parentID: physical }, parts: [tool(sourceCallId, args)] },
          { info: { id: targetProviderRun, role: 'assistant', parentID: physical }, parts: [tool(targetCallId, zero)] },
          { info: { id: `wire-manager-root-${index}`, role: 'user' }, parts: [{ type: 'text', text: `# Manager successor root ${index}` }] },
        ]
        legs.push({ ownerSessionId, replicaSessionId, ownerRequests, replicaRequests, targetRequest, originalText, snapshot, sourceCallId, targetCallId, args })
      }
      for (const leg of legs) {
        requests.push(request(leg.ownerSessionId, [...leg.ownerRequests.at(-1).messages,
          { role: 'user', content: `# Manager successor root ${leg.ownerSessionId}` }]))
      }
      const scenario = { host: { workDir }, provider: { requests }, client: {
        messages: async owner => ({ ok: true, data: legs.find(leg => leg.ownerSessionId === owner)?.snapshot ?? [] }),
      } }
      await action({ scenario, legs, requests })
    } finally { local.close() }
  })
}
