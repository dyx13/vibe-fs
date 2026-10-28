import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { parse as parseToml } from 'smol-toml'
import { createRegistered, execute as executeTool } from '../../../dist/Repository/Programming/Js/OpenCode/ToolHostSurface.js'
import { takeView, clearAll } from '../../../dist/Repository/Programming/Js/Anchor/AnchorSurface.js'
import * as pair from '../../../dist/OpenCode/Host/PairProgrammingThoughtSurface.js'

const program = 'class Js extends JsProgram { async run() { return { ran: true }; } }'
const execute = (registered, args, context) => executeTool(
  registered,
  { name: 'carry-declaration-test', ...args },
  context,
)

const withTool = async (check, role = 'Coder') => {
  clearAll()
  const dir = mkdtempSync(join(tmpdir(), 'wxs-053-carry-'))
  const tool = (definition) => definition
  tool.schema = z
  try {
    await check(createRegistered({ tool }, role, 'en', dir, null), dir)
  } finally {
    clearAll()
    rmSync(dir, { recursive: true, force: true })
  }
}

const failureOf = (result) => {
  assert.equal(result.startsWith('# failed'), true, result)
  const document = parseToml(result)
  assert.equal(document.code, 'VIEW_DECLARATION_INVALID')
  assert.ok(document.reason.length > 0)
  return document
}

test('WHAT[repository-programming-053] prefixUntil and carry preserve literal order and exact text', async () => {
  await withTool(async (registered) => {
    const declaration = { prefixUntil: 0, carry: ['second', 'first\nlast', '', '  '] }
    const result = await execute(registered, { program, ...declaration }, { sessionID: 'ses-053-order' })
    assert.equal(result.startsWith('# ok'), true, result)
    assert.deepEqual(takeView('ses-053-order'), declaration)
  })
})

test('WHAT[repository-programming-053] retired names are rejected even beside a valid declaration', async () => {
  await withTool(async (registered) => {
    for (const legacy of [
      { view: {} },
      { prefixCount: 0 },
      { thenMap: {} },
      { reportMapping: {} },
      { thenMap: null },
      { thenMap: undefined },
    ]) {
      const result = await execute(
        registered,
        { program, prefixUntil: 0, carry: [], ...legacy },
        { sessionID: 'ses-053-retired' },
      )
      const document = failureOf(result)
      assert.match(document.reason, /prefixUntil/)
      assert.match(document.reason, /carry/)
      assert.equal(takeView('ses-053-retired'), null)
    }
  })
})

test('WHAT[repository-programming-053] a call missing the required declaration is refused and leaves pending view untouched', async () => {
  await withTool(async (registered) => {
    const context = { sessionID: 'ses-053-absent' }
    failureOf(await execute(registered, { program }, context))
    assert.equal(takeView(context.sessionID), null)
    const declaration = { prefixUntil: 0, carry: ['keep me'] }
    assert.equal((await execute(registered, { program, ...declaration }, context)).startsWith('# ok'), true)
    failureOf(await execute(registered, { program }, context))
    assert.deepEqual(takeView(context.sessionID), declaration)
  })
})

test('WHAT[repository-programming-053] invalid declarations cannot run the program or overwrite a valid pending view', async () => {
  await withTool(async (registered, dir) => {
    const context = { sessionID: 'ses-053-invalid' }
    const cases = [
      { prefixUntil: -1, carry: [] },
      { prefixUntil: 1.5, carry: [] },
      { prefixUntil: Number.MAX_SAFE_INTEGER + 1, carry: [] },
      { prefixCount: 0 },
      { carry: [] },
      { prefixUntil: 0, carry: {} },
      { prefixUntil: 0, carry: null },
      { prefixUntil: 0, carry: [null] },
      { prefixUntil: 0, carry: [true] },
      { prefixUntil: 0, carry: [-1] },
      { prefixUntil: 0, carry: [1.5] },
      { prefixUntil: 0, carry: [999] },
      { prefixUntil: 0, carry: [[]] },
      { prefixUntil: 0, carry: [{ toJSON: () => 'forged literal' }] },
    ]
    const probe = 'class Js extends JsProgram { async run() { await this.write("must-not-exist.txt", "ran"); return "ran"; } }'
    for (const args of cases) {
      const declaration = { prefixUntil: 0, carry: ['saved'] }
      await execute(registered, { program, ...declaration }, context)
      failureOf(await execute(registered, { program: probe, ...args }, context))
      assert.equal(existsSync(join(dir, 'must-not-exist.txt')), false)
      assert.deepEqual(takeView(context.sessionID), declaration)
    }
  })
})

test('WHAT[repository-programming-053] a failed call cannot inherit a different message or call identity', async () => {
  await withTool(async (registered) => {
    const sessionID = 'ses-053-strip-owner'
    const messageID = 'shared-assistant'
    const history = [{ info: { id: 'old-user', role: 'user' }, parts: [{ type: 'text', text: 'old evidence' }] }]
    pair.applyAnchorView(sessionID, history)
    const accepted = { name: 'carry-declaration-test', program, prefixUntil: 0, carry: ['shared literal'] }
    const refused = {
      ...accepted,
      program: 'class Js extends JsProgram { async run() { throw new Error("program failed"); } }',
    }
    const succeeded = await execute(registered, accepted, {
      sessionID, messageID, callID: 'accepted-call', agent: 'engineer',
    })
    const failed = await execute(registered, refused, {
      sessionID, messageID, callID: 'failed-call', agent: 'engineer',
    })
    const reusedCall = await execute(registered, refused, {
      sessionID, messageID: 'later-assistant', callID: 'accepted-call', agent: 'engineer',
    })
    assert.equal(succeeded.startsWith('# ok'), true, succeeded)
    assert.equal(failed.startsWith('# failed'), true, failed)
    assert.equal(reusedCall.startsWith('# failed'), true, reusedCall)
    const current = {
      info: { id: messageID, role: 'assistant' },
      parts: [
        { type: 'tool', tool: 'todowrite-for-engineer', callID: 'accepted-call', state: { status: 'completed', input: structuredClone(accepted), output: succeeded } },
        { type: 'tool', tool: 'todowrite-for-engineer', callID: 'failed-call', state: { status: 'completed', input: structuredClone(refused), output: failed } },
      ],
    }
    const later = {
      info: { id: 'later-assistant', role: 'assistant' },
      parts: [
        { type: 'tool', tool: 'todowrite-for-engineer', callID: 'accepted-call', state: { status: 'completed', input: structuredClone(refused), output: reusedCall } },
      ],
    }
    const expanded = [...history, current, later]
    const saved = structuredClone(expanded)
    for (let replay = 0; replay < 2; replay++) {
      const result = pair.applyAnchorView(sessionID, expanded)
      const retained = result.messages.find((row) => row.info.id === messageID)
      assert.equal(Object.hasOwn(retained.parts[0].state.input, 'carry'), false)
      assert.deepEqual(retained.parts[1].state.input, refused)
      const laterMessage = result.messages.find((row) => row.info.id === 'later-assistant')
      assert.deepEqual(laterMessage.parts[0].state.input, refused)
    }
    assert.deepEqual(expanded, saved)
  }, 'Engineer')
})

test('WHAT[repository-programming-053] an asynchronous call commits the declaration accepted before execution', async () => {
  await withTool(async (registered, dir) => {
    const carry = ['accepted literal']
    const context = { sessionID: 'ses-053-snapshot' }
    const ready = join(dir, 'admission-ready')
    const release = join(dir, 'admission-release')
    const command = `node -e '
const fs = require("node:fs")
const interval = setInterval(() => {
  if (fs.existsSync("admission-release")) {
    clearInterval(interval)
    clearTimeout(deadline)
  }
}, 5)
const deadline = setTimeout(() => {
  clearInterval(interval)
  process.exitCode = 2
}, 8000)
fs.writeFileSync("admission-ready", "ready")
'`
    const planB = 'If the admission barrier command cannot run, stop this verification and report that the original carry array could not be mutated while a real admitted program was suspended; preserve the pending declaration and do not replace this check with a synthetic delay.'
    const pending = execute(registered, {
      program: 'class Js extends JsProgram { async run() { return await this.call(' + JSON.stringify(command) + ', ' + JSON.stringify(planB) + '); } }',
      prefixUntil: 0,
      carry,
    }, context)

    let admitted = false
    try {
      for (let attempt = 0; attempt < 1000 && !existsSync(ready); attempt++) {
        await delay(5)
      }
      admitted = existsSync(ready)
      if (admitted) {
        carry[0] = 'changed during execution'
        carry.push('late value')
      }
    } finally {
      writeFileSync(release, 'release')
    }

    const result = await pending
    assert.equal(admitted, true, 'the real command must reach the admission barrier: ' + result)
    assert.equal(result.startsWith('# ok'), true, result)
    assert.deepEqual(takeView(context.sessionID), { prefixUntil: 0, carry: ['accepted literal'] })
  }, 'DevOps')
})

