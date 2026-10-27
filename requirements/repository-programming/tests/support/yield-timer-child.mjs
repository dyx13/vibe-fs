import assert from 'node:assert/strict'
import { createHook } from 'node:async_hooks'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import {
  execute, caseName, parkedHandle, parkedPayload, clearParkedSites,
} from '../../../../dist/Repository/Programming/Js/WorkflowSurface.js'

const mode = process.argv[2]
const directory = mkdtempSync(join(tmpdir(), 'wxs-yield-timer-'))
const timers = new Set()
let timerCount = 0
const hook = createHook({
  init(id, type) {
    if (type === 'Timeout') {
      timers.add(id)
      timerCount += 1
    }
  },
  destroy(id) { timers.delete(id) },
})
const invoke = input => execute(directory, 'DevOps', 'en', 'yield-timer', input,
  2000, Date.now() + 60_000, 1 << 20, null)
const source = body => `class Js extends JsProgram { async run() { ${body} } }`
const planB = 'x'.repeat(200)
const bodies = {
  complete: 'return { done: true };',
  fail: 'throw new Error("owned timer failure");',
  park: 'await this.park({ step: 2 }); return { done: true };',
  yield: 'return await this.call("sleep 0.2", "wait for the real child to exit");',
}
hook.enable()
try {
  const resumed = mode.startsWith('resume-')
  const action = resumed ? mode.slice('resume-'.length) : mode
  assert.ok(action === 'invalid' || Object.hasOwn(bodies, action))
  const body = bodies[action]
  let outcome
  if (action === 'invalid') {
    await assert.rejects(() => invoke({ name: 'yield-timer', program: 'class Js extends', planB }),
      { name: 'SyntaxError' })
  } else if (resumed) {
    const initial = await invoke({ name: 'yield-timer',
      program: source(`await this.park({ step: 1 }); ${body}`) })
    assert.equal(caseName(initial), 'Parked')
    assert.deepEqual(parkedPayload(initial), { step: 1 })
    outcome = await invoke({ unpark: { handle: parkedHandle(initial), value: { continue: true } },
      planB: action === 'yield' ? 'ab' : planB })
  } else {
    outcome = await invoke({ name: 'yield-timer',
      program: source(body),
      planB: action === 'yield' ? 'ab' : planB })
  }
  if (action !== 'invalid') {
    const expected = action === 'complete' ? 'Succeeded' : action === 'fail' ? 'Failed' : 'Parked'
    assert.equal(caseName(outcome), expected)
  }
  if (action === 'yield') {
    const payload = parkedPayload(outcome)
    assert.equal(payload.__jsYield, true)
    assert.equal(payload.planB, 'ab')
    assert.equal(payload.budgetMs, 100)
    const completed = await invoke({ unpark: { handle: parkedHandle(outcome), value: null } })
    assert.equal(caseName(completed), 'Succeeded')
  }
  if (action === 'park') {
    assert.deepEqual(parkedPayload(outcome), { step: 2 })
    const completed = await invoke({ unpark: { handle: parkedHandle(outcome), value: null } })
    assert.equal(caseName(completed), 'Succeeded')
  }
} finally {
  clearParkedSites()
  rmSync(directory, { recursive: true, force: true })
}
await setImmediate()
await setImmediate()
hook.disable()
assert.ok(timerCount > 0, 'the real invocation must create a native timer')
assert.equal(timers.size, 0, 'settled invocations must destroy their native timers, including unref timers')
console.log(JSON.stringify({ mode, timersCreated: timerCount, timersRemaining: timers.size }))
