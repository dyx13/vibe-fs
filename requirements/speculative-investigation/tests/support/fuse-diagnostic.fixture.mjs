import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import * as Strength from '../../../../dist/Strength/Surface.js'
import {
  acceptAuthorityRoot,
  withExecutablePlugin,
} from '../../../verification-system/tests/support/plugin-fixture.mjs'

const firstReason = 'projection-conflict original cause'
let scope
const observation = {}
try {
  await withExecutablePlugin(async (hooks, directory, _createdIds, runtime) => {
    const sessionId = 'ses-fuse-diagnostic'
    const physical = 'user-fuse-diagnostic'
    await acceptAuthorityRoot(runtime, sessionId, 'engineer', physical)
    const user = {
      info: { id: physical, role: 'user', sessionID: sessionId },
      parts: [{ type: 'text', text: 'inspect the file' }],
    }
    const assistant = {
      info: { id: 'run-fuse-diagnostic', role: 'assistant', sessionID: sessionId, parentID: physical, time: { created: 1 } },
      parts: [{ type: 'tool', tool: 'read', callID: 'call-fuse-diagnostic',
        state: { status: 'completed', input: { filePath: 'a.md', estimated_readonly_rounds: 1 }, output: 'alpha' } }],
    }
    await hooks['chat.message']({ sessionID: sessionId, messageID: physical, agent: 'engineer' }, { message: user, parts: user.parts })
    runtime.pushHostMessage(sessionId, user)
    runtime.pushHostMessage(sessionId, assistant)
    const key = join(realpathSync(join(directory, '.git')), 'wanxiangshu-next', 'runtimes')
    scope = Strength.scopeAcquireShared(key)
    assert.equal(Strength.scopeFuseReason(scope), null)
    Strength.scopeTripFuse(scope, firstReason)
    await hooks['experimental.chat.messages.transform']({}, { messages: [user, assistant] })
    observation.afterFirst = Strength.scopeFuseReason(scope)
    Strength.scopeTripFuse(scope, 'later-noise')
    Strength.scopeClearSession(scope, 'unrelated-session')
    await hooks['experimental.chat.messages.transform']({}, { messages: [user, assistant] })
    observation.afterLaterFailureAndCleanup = Strength.scopeFuseReason(scope)
  })
  observation.afterPluginDispose = Strength.scopeFuseReason(scope)
  process.stdout.write(JSON.stringify(observation) + '\n')
} finally {
  if (scope) Strength.scopeReleaseShared(scope)
}
