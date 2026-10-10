import test from 'node:test'
import assert from 'node:assert/strict'
import { convergeExpiredAt } from '../../../dist/Git/Hook/Surface.js'

test('WHAT[time-capability-003] with an observed remote snapshot the Git gateway spends no transport or local stage at the injected deadline', async () => {
  for (const origin of [0, Date.UTC(2099, 0, 1)]) {
    assert.deepEqual(await convergeExpiredAt(origin, 600000, origin + 600000), {
      budgetExhausted: true, commands: 0, localStages: 0,
    })
    assert.deepEqual(await convergeExpiredAt(origin, 600000, origin + 600001), {
      budgetExhausted: true, commands: 0, localStages: 0,
    })
  }
})

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");

const process = await import('../../../dist/Process/Surface.js')
const deadline = await import('../../../dist/Process/DeadlineSurface.js')
const START_MS = Date.parse('2000-01-01T00:00:00Z')

test('WHAT[time-capability-003] TIME_003_virtual_clock_starts_at_fixed_epoch', () => {
  const clock = process.createVirtualClock()
  assert.equal(Number(process.clockNowMs(clock)), START_MS)
})
test('WHAT[time-capability-003] TIME_003_virtual_clock_advance_and_set_are_deterministic', () => {
  const clock = process.createVirtualClock()

  process.clockAdvanceMs(clock, 5000)
  assert.equal(Number(process.clockNowMs(clock)), START_MS + 5000)

  process.clockAdvanceMs(clock, 0)
  assert.equal(Number(process.clockNowMs(clock)), START_MS + 5000, 'zero advance must not move the clock')

  process.clockSet(clock, '2026-01-01T00:00:00Z')
  assert.equal(Number(process.clockNowMs(clock)), Date.parse('2026-01-01T00:00:00Z'))
})
}

{
const { default: assert } = await import("node:assert/strict");
const { default: test } = await import("node:test");
const { assertOpaque } = await import("../../verification-system/tests/support/js-contract.mjs");

const process = await import('../../../dist/Process/Surface.js')
const settle = () => new Promise((resolve) => setImmediate(resolve))

test('WHAT[time-capability-003] VERIFY_004_virtual_timer_fires_exactly_when_advanced_past_deadline', async () => {
  const timer = process.createVirtualTimer()
  const handle = process.timerDelay(timer, 100)
  assertOpaque(timer, 'virtual timer')
  assertOpaque(handle, 'deadline handle')
  let fired = 0
  process.timerAwait(handle).then(() => {
    fired += 1
  })

  process.timerAdvance(timer, 99)
  await settle()
  assert.equal(fired, 0, 'not due before deadline')
  assert.equal(process.timerNowMs(timer), 99)

  process.timerAdvance(timer, 1)
  await settle()
  assert.equal(fired, 1, 'fires once at deadline')
  assert.equal(process.timerNowMs(timer), 100)
  process.timerDispose(timer)
})
test('WHAT[time-capability-003] VERIFY_004_virtual_timer_cancel_before_fire_yields_zero_callbacks', async () => {
  const timer = process.createVirtualTimer()
  const handle = process.timerDelay(timer, 50)
  let fired = 0
  process.timerAwait(handle).then(() => {
    fired += 1
  })

  process.timerCancel(handle)
  process.timerAdvance(timer, 1000)
  await settle()
  assert.equal(fired, 0, 'cancel must leave Delay pending forever')
  process.timerDispose(timer)
})
test('WHAT[time-capability-003] VERIFY_004_virtual_timer_dispose_stops_all_pending_callbacks', async () => {
  const timer = process.createVirtualTimer()
  const first = process.timerDelay(timer, 10)
  const second = process.timerDelay(timer, 20)
  let fired = 0
  process.timerAwait(first).then(() => {
    fired += 1
  })
  process.timerAwait(second).then(() => {
    fired += 1
  })

  process.timerDispose(timer)
  process.timerAdvance(timer, 1000)
  await settle()
  assert.equal(fired, 0, 'dispose clears pending entries without firing')
})
test('WHAT[time-capability-003] VERIFY_004_virtual_timer_multiple_handles_fire_independently', async () => {
  const timer = process.createVirtualTimer()
  const order = []
  const short = process.timerDelay(timer, 10)
  const long = process.timerDelay(timer, 30)
  process.timerAwait(short).then(() => order.push('short'))
  process.timerAwait(long).then(() => order.push('long'))

  process.timerAdvance(timer, 10)
  await settle()
  assert.deepEqual(order, ['short'])

  process.timerAdvance(timer, 20)
  await settle()
  assert.deepEqual(order, ['short', 'long'])
  process.timerDispose(timer)
})

test('WHAT[time-capability-003] deadlines follow due time despite reverse registration and cancellation leaves other handles live', async () => {
  const timer = process.createVirtualTimer()
  try {
    const order = []
    const later = process.timerDelay(timer, 30)
    const cancelled = process.timerDelay(timer, 5)
    const earlier = process.timerDelay(timer, 10)
    process.timerAwait(later).then(() => order.push('later'))
    process.timerAwait(cancelled).then(() => order.push('cancelled'))
    process.timerAwait(earlier).then(() => order.push('earlier'))
    process.timerCancel(cancelled)
    process.timerCancel(cancelled)
    process.timerAdvance(timer, 10)
    await settle()
    assert.deepEqual(order, ['earlier'])
    process.timerCancel(earlier)
    process.timerAdvance(timer, 20)
    await settle()
    assert.deepEqual(order, ['earlier', 'later'])
    process.timerAdvance(timer, 100)
    await settle()
    assert.deepEqual(order, ['earlier', 'later'])
  } finally {
    process.timerDispose(timer)
  }
})

test('WHAT[time-capability-003] a disposed timer cannot fire newly requested handles', async () => {
  const timer = process.createVirtualTimer()
  process.timerDispose(timer)
  process.timerDispose(timer)
  let fired = false
  process.timerAwait(process.timerDelay(timer, 10)).then(() => { fired = true })
  process.timerAdvance(timer, 10)
  await settle()
  assert.equal(fired, false)
})

test('WHAT[time-capability-003] advancing one virtual timer or constructing physical ports does not advance another', async () => {
  const first = process.createVirtualTimer()
  const second = process.createVirtualTimer()
  const nodeTimer = process.createNodeTimer()
  try {
    const nodeClock = process.createNodeClock()
    assertOpaque(nodeClock, 'physical clock')
    assertOpaque(nodeTimer, 'physical timer')
    const fired = []
    process.timerAwait(process.timerDelay(first, 10)).then(() => fired.push('first'))
    process.timerAwait(process.timerDelay(second, 10)).then(() => fired.push('second'))
    await settle()
    assert.deepEqual(fired, [])
    process.timerAdvance(first, 10)
    await settle()
    assert.deepEqual(fired, ['first'])
    assert.equal(process.timerNowMs(second), 0)
    process.timerAdvance(second, 10)
    await settle()
    assert.deepEqual(fired, ['first', 'second'])
  } finally {
    process.timerDispose(first)
    process.timerDispose(second)
    process.nodeTimerDispose(nodeTimer)
  }
})
}
