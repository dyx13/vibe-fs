import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as forkTool from '../../../dist/Execution/Delegation/Fork/OpenCode/ToolSurface.js'
import { placeEngineer, withForkRuntime } from './support/fork-runtime.mjs'

process.env.WANXIANGSHU_PROVIDER_LANGUAGE = 'en'

test('WHAT[participant-horizon-011] real cancellation keeps an accepted child and its undelivered consequence visible', async (context) => {
  await withForkRuntime(async ({ runtime, owner }) => {
    await context.test('accepted child is visible without its physical identity', async () => {
      const child = await placeEngineer(runtime, owner, 'Ada')
      const active = await forkTool.executeHorizon(runtime, owner)
      assert.match(active, /Ada.*still away/)
      assert.ok(!active.includes(child), 'physical child identity stays private')
    })
    await context.test('cancellation keeps the undelivered consequence visible', async () => {
      await forkTool.cancelOwnerChildren(runtime, owner)
      assert.match(await forkTool.executeHorizon(runtime, owner), /Ada.*did not return/)
      assert.equal(forkTool.abortCount(runtime), 1)
    })
  })
})

test('WHAT[participant-horizon-011] a restarted process does not present the previous process abandoned child', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wxs-horizon-restart-abandoned-'))
  const owner = 'manager-horizon-restart-abandoned'
  const first = await forkTool.createRuntime(directory, [{ sessionId: owner, agent: 'manager' }])

  try {
    await placeEngineer(first, owner, 'Ada')
    await forkTool.cancelOwnerChildren(first, owner)
    assert.match(await forkTool.executeHorizon(first, owner), /Ada.*did not return/)
  } finally {
    forkTool.disposeRuntime(first)
  }

  const restarted = await forkTool.createRuntime(directory, [{ sessionId: owner, agent: 'manager' }])

  try {
    const horizon = await forkTool.executeHorizon(restarted, owner)
    assert.doesNotMatch(horizon, /Ada/)
  } finally {
    forkTool.disposeRuntime(restarted)
    rmSync(directory, { recursive: true, force: true })
  }
})

test.todo('WHAT[participant-horizon-011] Join delivers the abandoned consequence and retires the handle; real scenario stalls at Join after successful cancellation, root cause still under investigation (GAP-080)')
test.todo('WHAT[participant-horizon-011] latest durable record selection and corrupt-latest rejection must exercise journal/blob reads; a separately implemented HorizonSurface renderer is insufficient (GAP-079)')
