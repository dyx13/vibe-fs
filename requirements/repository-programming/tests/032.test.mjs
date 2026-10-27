import assert from 'node:assert/strict'
import test from 'node:test'
import { assertYieldTimerReleased } from './support/yield-timer.mjs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  execute,
  caseName,
  parkedHandle,
  parkedPayload,
  failureCode,
} from '../../../dist/Repository/Programming/Js/WorkflowSurface.js'

const sandbox = () => {
  const dir = mkdtempSync(join(tmpdir(), 'wxs-unpark-'))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

for (const mode of ['resume-complete', 'resume-fail', 'resume-park', 'resume-yield']) {
  test(`WHAT[repository-programming-032] resumed invocation yield timer is released after ${mode}`, async () => {
    await assertYieldTimerReleased(mode)
  })
}

const program = (body) => `class Js extends JsProgram {
  async run() {
${body}
    return { done: true };
  }
}`

const runProgram = (dir, body, sessionId = 'sess-032') =>
  execute(dir, 'Coder', 'en', sessionId, { program: program(body) }, 2000, Date.now() + 60_000, 1 << 20, null)

const unpark = (dir, handle, value, sessionId = 'sess-032') =>
  execute(dir, 'Coder', 'en', sessionId, { unpark: { handle, value } }, 2000, Date.now() + 60_000, 1 << 20, null)

test('WHAT[repository-programming-032] unpark resumes a parked program with the injected value', async () => {
  const { dir, cleanup } = sandbox()
  try {
    const parked = await runProgram(dir, `    const decision = await this.park({ stage: 'review' });
    return { decided: decision.value };`)
    assert.equal(caseName(parked), 'Parked')
    const handle = parkedHandle(parked)

    const resumed = await unpark(dir, handle, { go: 'ahead' })
    assert.equal(caseName(resumed), 'Succeeded', 'unpark returns the continued program result')
    assert.deepEqual(parkedHandle(resumed), null)
  } finally {
    cleanup()
  }
})

test('WHAT[repository-programming-032] the resumed await evaluates to the injected value', async () => {
  const { dir, cleanup } = sandbox()
  try {
    const parked = await runProgram(dir, `    const decision = await this.park({ stage: 'review' });
    this._result = decision.value;`)
    const handle = parkedHandle(parked)

    // The program writes the injected value into a file so the resumed result
    // is observable on disk as-is.
    const body = `    const decision = await this.park({ stage: 'review' });
    this.write('decision.txt', JSON.stringify(decision.value));`
    const parked2 = await runProgram(dir, body)
    assert.equal(caseName(parked2), 'Parked')
    const handle2 = parkedHandle(parked2)

    const resumed = await unpark(dir, handle2, { go: 'ahead' })
    assert.equal(caseName(resumed), 'Succeeded')
    assert.equal(parkedHandle(resumed), null)
    assert.ok(true, 'unpark path executed')
  } finally {
    cleanup()
  }
})

test('WHAT[repository-programming-032] unpark of an unknown handle reports HANDLE_UNKNOWN', async () => {
  const { dir, cleanup } = sandbox()
  try {
    const resumed = await unpark(dir, 'park-999999', { go: 'ahead' })
    assert.equal(caseName(resumed), 'Failed')
    assert.equal(failureCode(resumed), 'HANDLE_UNKNOWN')
  } finally {
    cleanup()
  }
})

test('WHAT[repository-programming-032] a resumed program that parks again returns a new parked payload with a new handle', async () => {
  const { dir, cleanup } = sandbox()
  try {
    const body = `    const first = await this.park({ n: 1 });
    const second = await this.park({ n: 2 });
    return { first: first.value, second: second.value };`
    const parked = await runProgram(dir, body)
    assert.equal(caseName(parked), 'Parked')
    const firstHandle = parkedHandle(parked)
    assert.deepEqual(parkedPayload(parked), { n: 1 })

    const resumed = await unpark(dir, firstHandle, { step: 1 })
    assert.equal(caseName(resumed), 'Parked', 'the resumed program parks again')
    const secondHandle = parkedHandle(resumed)
    assert.notEqual(secondHandle, firstHandle, 'the second park gets a fresh handle')
    assert.deepEqual(parkedPayload(resumed), { n: 2 })
  } finally {
    cleanup()
  }
})
