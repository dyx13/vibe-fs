import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { Worker } from 'node:worker_threads'
import { encode } from 'gpt-tokenizer/encoding/o200k_base'
import { deriveLoopDetectorEnvelope, encodeParallel, loadLoopDetectorRepositoryCorpusV1, writeLoopDetectorEnvelopeArtifact } from '../../../scripts/lib/derive-loop-detector-envelope.mjs'
import { loopDetectorRepositoryInputFiles } from '../../../scripts/lib/loop-detector-repository-corpus.mjs'
import { runBuild } from '../../../scripts/build.mjs'
import { integrationTest } from '../../verification-system/tests/support/tier-gate.mjs'

test('WHAT[degeneration-guard-004] selector admits tracked source documents and excludes generated vendor fixture structured deleted and untracked paths', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'wanxiangshu-loop-selector-'))
  try {
    execFileSync('git', ['init', '-q'], { cwd: root })
    const files = ['src/code.fs', 'note.md', 'deleted.md', 'node_modules/module.js', 'vendor/lib.py', 'fixtures/case.md', 'golden/result.md', 'generated/code.fs', 'data.json', 'events.jsonl', 'values.csv']
    for (const file of files) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      writeFileSync(path.join(root, file), 'text\n')
    }
    execFileSync('git', ['add', '-f', ...files], { cwd: root })
    unlinkSync(path.join(root, 'deleted.md'))
    writeFileSync(path.join(root, 'untracked.md'), 'untracked\n')
    const selected = loopDetectorRepositoryInputFiles(root)
    assert.ok(selected.every(path.isAbsolute))
    assert.deepEqual(selected.map(file => path.relative(root, file)), ['note.md', 'src/code.fs'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('WHAT[degeneration-guard-004] selected bytes are tracked before UTF-8 and generated-marker filtering', () => {
  const reads = []
  const bytes = new Map([
    ['a.md', Buffer.from('first source\n')],
    ['b.fs', Buffer.from('module Second\nlet value = 2\n')],
    ['c.md', Buffer.from([0xc3, 0x28])],
    ['d.fs', Buffer.from('// auto-generated\nlet generated = 3\n')],
  ])
  const corpus = loadLoopDetectorRepositoryCorpusV1('/fixture-root', {
    selectInputFiles: () => [...bytes.keys()].reverse().map(file => `/fixture-root/${file}`),
    readFile: file => { const name = file.slice('/fixture-root/'.length); reads.push(name); return bytes.get(name) },
  })
  assert.deepEqual(reads, [...bytes.keys()])
  assert.deepEqual(corpus.selectedInputs.map(({ path }) => path), [...bytes.keys()])
  assert.deepEqual(corpus.texts, ['first source\n', 'module Second\nlet value = 2\n'])
  assert.ok(corpus.selectedInputs.every(({ blob_digest }) => /^sha256:[0-9a-f]{64}$/.test(blob_digest)))
  let outsideRead = false
  assert.throws(() => loadLoopDetectorRepositoryCorpusV1('/fixture-root', {
    selectInputFiles: () => ['/outside-root/secret.md'],
    readFile: () => { outsideRead = true; return Buffer.from('unreachable') },
  }), { code: 'generated-selected-input-outside-root' })
  assert.equal(outsideRead, false)
})

test('WHAT[degeneration-guard-004] tracked input byte changes affect derived input digests without a numeric snapshot', async () => {
  const derive = text => deriveLoopDetectorEnvelope('/fixture-root', {
    selectInputFiles: () => ['/fixture-root/a.md'], readFile: () => Buffer.from(text),
  })
  const first = await derive('ordinary source text\n')
  const same = await derive('ordinary source text\n')
  const changed = await derive('different source text\n')
  assert.deepEqual(first, same)
  assert.notEqual(first.selectedInputs[0].blob_digest, changed.selectedInputs[0].blob_digest)
})

test('WHAT[degeneration-guard-004] parallel tokenization equals whole-stream tokenization across safe and unsafe newline candidates', async () => {
  const fixture = ['export class OrderProcessor {', '  // comment with slash /', '  /// doc comment', '  async processOrder(orderId: string) {}', '}', '', 'const message = "你好，世界！🚀";', '// 中文与多行换行', '', 'let count = 42;', '// ' + 'long text payload '.repeat(100)].join('\n')
  const expected = Array.from(encode(fixture))
  assert.deepEqual(await encodeParallel(fixture, 1), expected)
  assert.deepEqual(await encodeParallel(fixture, 4), expected)
})

test('WHAT[degeneration-guard-004] worker failure rejects only after all spawned workers have terminated', async () => {
  const spawned = []
  const fixture = 'class Alpha {\nrun() { return 1; }\n}\nclass Beta {\ncompute() { return 2; }\n}\nlet value = 12345;'
  await assert.rejects(() => encodeParallel(fixture, 4, {
    workerFactory: (source, options) => {
      const worker = spawned.length === 1 ? new Worker('process.exit(42)', { eval: true }) : new Worker(source, options)
      spawned.push(worker)
      return worker
    },
  }), /loop detector tokenize worker exited with 42/)
  assert.ok(spawned.length > 0)
  for (const worker of spawned) assert.equal(worker.threadId, -1)
})

integrationTest('WHAT[degeneration-guard-004] clean and full Fable rebuilds preserve explicit envelope bytes and restore them after a later artifact failure', async (t) => {
  for (const clean of [true, false]) {
    await t.test(`WHAT[degeneration-guard-004] ${clean ? 'clean' : 'full'} rebuild does not derive or lose the prepared envelope`, async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'wanxiangshu-explicit-envelope-build-'))
      const sourceRoot = path.join(root, 'src/Wanxiangshu')
      const envelopePath = path.join(root, 'dist/Execution/Session/LoopDetectorEnvelope.js')
      try {
        mkdirSync(sourceRoot, { recursive: true })
        writeFileSync(path.join(sourceRoot, 'Fixture.fs'), 'module Fixture\nlet value = 1\n')
        writeFileSync(path.join(sourceRoot, 'Wanxiangshu.Shard.Fixture.fsproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup><ItemGroup><Compile Include="Fixture.fs"/></ItemGroup></Project>\n')
        writeFileSync(path.join(sourceRoot, 'compile-order.txt'), 'Fixture.fs\n')
        writeFileSync(path.join(root, 'Directory.Build.props'), `<Project><Import Project="${path.resolve(import.meta.dirname, '../../../Directory.Build.props')}"/></Project>\n`)
        writeFileSync(path.join(root, 'note.md'), 'This fixture owns the selected repository source.\n')
        execFileSync('git', ['init', '-q'], { cwd: root })
        execFileSync('git', ['add', 'src', 'Directory.Build.props', 'note.md'], { cwd: root })
        const prepared = await writeLoopDetectorEnvelopeArtifact(root)
        assert.ok(prepared.selectedInputs.some(({ path: selected }) => selected === 'note.md'))
        assert.ok(prepared.selectedInputs.every(({ path: selected }) => !path.isAbsolute(selected)))
        const envelopeBytes = readFileSync(envelopePath)
        writeFileSync(path.join(root, 'note.md'), 'The corpus changed after explicit preparation.\n'.repeat(128))
        await writeLoopDetectorEnvelopeArtifact(root)
        assert.notDeepEqual(readFileSync(envelopePath), envelopeBytes)
        writeFileSync(envelopePath, envelopeBytes)
        await assert.rejects(runBuild({ targetRoot: root, clean, stdio: 'pipe' }), /missing entry artifact: .*OpenCode\/Plugin\/Plugin\.js/)
        assert.deepEqual(readFileSync(envelopePath), envelopeBytes)
        assert.equal(existsSync(path.join(root, '.fable-build/dist.staged-backup')), false)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
  }
})

test.todo('WHAT[degeneration-guard-004] actual build binds generator selector selected bytes and runtime traversal to one staged input (GAP-145)')
