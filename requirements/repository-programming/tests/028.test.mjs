import assert from 'node:assert/strict'
import test from 'node:test'
import { assertYieldTimerReleased } from './support/yield-timer.mjs'

const { start } = await import('../../../dist/Repository/Programming/Js/RuntimeSurface.js')

for (const mode of ['complete', 'fail', 'invalid', 'park', 'yield']) {
  test(`WHAT[repository-programming-028] invocation yield timer is released after ${mode}`, async () => {
    await assertYieldTimerReleased(mode)
  })
}

const BASE = `class JsProgram {
  constructor(api) { this._api = api; }
  cat(path) { return this._api.cat(path); }
}`

// The program yields to the microtask queue before its first api call, so a
// caller can reset the deadline between start() resolving and the proxy read
// without depending on a macrotask timer inside the sandbox. The caller-
// controlled gate then parks the program until the test decides to release it.
const PROGRAM = `class Js extends JsProgram {
  async run() {
    await Promise.resolve();
    await this._api.wait();
    const r = await this.cat('a.txt');
    return { text: r.text };
  }
}`

const gatedApi = () => {
  const gate = {}
  gate.promise = new Promise((resolve) => { gate.resolve = resolve })
  return {
    api: { cat: async () => ({ text: 'hello' }), wait: () => gate.promise },
    gate,
  }
}

test('WHAT[repository-programming-028] start exposes an in-flight program promise that is not awaited to completion', async () => {
  const { api, gate } = gatedApi()
  const handle = await start(BASE, PROGRAM, api, 2000, Date.now() + 60_000, 1 << 20)
  assert.equal(typeof handle.promise?.then, 'function', 'handle.promise must be a thenable (the in-flight program promise)')
  assert.equal(typeof handle.resetDeadline, 'function', 'handle must expose a deadline reset')
  gate.resolve()
  const result = await handle.promise
  assert.equal(result.ok, true)
  assert.deepEqual(JSON.parse(result.value), { text: 'hello' })
})

test('WHAT[repository-programming-028] an expired deadline without reset aborts the first api call', async () => {
  const { api, gate } = gatedApi()
  const handle = await start(BASE, PROGRAM, api, 2000, Date.now() - 1000, 1 << 20)
  gate.resolve()
  const result = await handle.promise
  assert.equal(result.ok, false)
  assert.equal(result.code, 'PROGRAM_TIMEOUT')
})

test('WHAT[repository-programming-028] resetDeadline re-arms the async deadline of an in-flight program', async () => {
  // Park the program on the caller-controlled gate with a live deadline, then
  // reset the deadline into the past and re-arm it into the future before
  // releasing the gate: the program's first api read succeeds under the
  // re-armed deadline.
  const { api, gate } = gatedApi()
  const handle = await start(BASE, PROGRAM, api, 2000, Date.now() + 60_000, 1 << 20)
  handle.resetDeadline(Date.now() - 1000)
  handle.resetDeadline(Date.now() + 60_000)
  gate.resolve()
  const result = await handle.promise
  assert.equal(result.ok, true)
  assert.deepEqual(JSON.parse(result.value), { text: 'hello' })
})

test('WHAT[repository-programming-028] resetDeadline can also expire a live program', async () => {
  // Start with a far-future deadline, then reset it into the past before the
  // program's first api call: the proxy reads the expired deadline and aborts.
  const { api, gate } = gatedApi()
  const handle = await start(BASE, PROGRAM, api, 2000, Date.now() + 60_000, 1 << 20)
  handle.resetDeadline(Date.now() - 1000)
  gate.resolve()
  const result = await handle.promise
  assert.equal(result.ok, false)
  assert.equal(result.code, 'PROGRAM_TIMEOUT')
})
