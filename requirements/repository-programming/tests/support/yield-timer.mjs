import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const child = fileURLToPath(new URL('./yield-timer-child.mjs', import.meta.url))

export async function assertYieldTimerReleased(mode) {
  const { stdout, stderr } = await run(process.execPath, [child, mode], { timeout: 5000 })
  assert.equal(stderr, '')
  const result = JSON.parse(stdout)
  assert.equal(result.mode, mode)
  assert.equal(result.timersRemaining, 0)
}
