import assert from 'node:assert/strict'
import test from 'node:test'
import fs, { writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { sandbox, createCase, casebook, eventStore, index, parse } from './support/casebook.mjs'
import * as bookkeeper from '../../../dist/Repository/Knowledge/Casebook/BookkeeperSurface.js'
import { CANONICAL_A, CANONICAL_Q, installBookkeeperRuntime, scriptedBookkeeperPort } from './support/bookkeeper-session-support.mjs'

test('WHAT[knowledge-reuse-015] actual fetch ignores unrelated file changes and makes one maintenance request for a related change', async () => {
  const local = sandbox()
  try {
    const { identity, shelfmark } = await createCase(local)
    const { port, createCalls } = scriptedBookkeeperPort()
    installBookkeeperRuntime(port, [identity])
    writeFileSync(join(local.dir, 'unrelated.txt'), 'new unrelated content')
    await local.fetch(shelfmark)
    assert.equal(createCalls.length, 0)
    writeFileSync(join(local.dir, 'subject.txt'), 'version-C')
    await local.fetch(shelfmark)
    assert.equal(createCalls.length, 1)
    assert.notEqual((await casebook.fetchCaseByIdentity(local.store, identity)).a, 'Answer B')
  } finally { bookkeeper.resetRuntime(); local.close() }
})

test('WHAT[knowledge-reuse-015] a tracked unrelated Git change is excluded from actual fetch maintenance', async () => {
  const local = sandbox()
  try {
    const { identity, shelfmark } = await createCase(local)
    writeFileSync(join(local.dir, 'unrelated.txt'), 'unrelated baseline')
    execFileSync('git', ['init', '--quiet', local.dir])
    execFileSync('git', ['-C', local.dir, 'add', 'subject.txt', 'unrelated.txt'])
    execFileSync('git', ['-C', local.dir, '-c', 'user.name=Casebook Test', '-c', 'user.email=casebook@example.invalid', 'commit', '--quiet', '-m', 'fixture baseline'])
    writeFileSync(join(local.dir, 'unrelated.txt'), 'unrelated changed content')
    const { port, createCalls, prompts } = scriptedBookkeeperPort()
    installBookkeeperRuntime(port, [identity])
    assert.equal(parse(await local.fetch(shelfmark)).answer, 'Answer B')
    assert.equal(createCalls.length, 0)
    writeFileSync(join(local.dir, 'subject.txt'), 'version-C')
    await local.fetch(shelfmark)
    assert.equal(createCalls.length, 1)
    const diff = parse(prompts[0]).diff.content
    assert.doesNotMatch(diff, /unrelated/)
    assert.match(diff, /-version-B/)
    assert.match(diff, /\+version-C/)
  } finally { bookkeeper.resetRuntime(); local.close() }
})

test('WHAT[knowledge-reuse-015] one physical target capture supplies the actual fetch diff and committed baseline despite a later edit', async () => {
  const local = sandbox()
  const readFile = fs.readFileSync
  try {
    const { identity, baseline, shelfmark } = await createCase(local)
    const { port, prompts, createCalls } = scriptedBookkeeperPort()
    installBookkeeperRuntime(port, [identity])
    const subject = join(fs.realpathSync(local.dir), 'subject.txt')
    writeFileSync(subject, 'version-C')
    let reads = 0
    fs.readFileSync = (path, ...args) => {
      const bytes = readFile(path, ...args)
      if (path === subject) {
        reads += 1
        if (reads === 1) writeFileSync(subject, 'version-D')
      }
      return bytes
    }
    syncBuiltinESMExports()
    assert.equal(parse(await local.fetch(shelfmark)).answer, CANONICAL_A)
    fs.readFileSync = readFile
    syncBuiltinESMExports()
    assert.equal(reads, 1, 'a fetch captures the related target file only once')
    assert.equal(createCalls.length, 1)
    const diff = parse(prompts[0]).diff.content
    assert.match(diff, /-version-B/)
    assert.match(diff, /\+version-C/)
    assert.doesNotMatch(diff, /version-D/)
    const maintained = await casebook.fetchCaseByIdentity(local.store, identity)
    assert.equal(maintained.completionFileState, baseline)
    const target = JSON.parse(maintained.maintenanceFileState)['subject.txt']
    assert.equal(target.sha256, casebook.contentHash('version-C'))
    assert.equal(new TextDecoder().decode(await eventStore.readPayload(local.store, target.payloadRef)), 'version-C')
    assert.equal(readFile(subject, 'utf8'), 'version-D')

    await local.fetch(index.shelfmarkFor(identity, CANONICAL_Q))
    assert.equal(createCalls.length, 2)
    const nextDiff = parse(prompts[1]).diff.content
    assert.match(nextDiff, /-version-C/)
    assert.match(nextDiff, /\+version-D/)
  } finally {
    fs.readFileSync = readFile
    syncBuiltinESMExports()
    bookkeeper.resetRuntime()
    local.close()
  }
})
