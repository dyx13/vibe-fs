import assert from 'node:assert/strict'
import test from 'node:test'
import * as prefix from '../../../dist/Context/Prefix/Surface.js'
import { integrationTest } from '../../verification-system/tests/support/tier-gate.mjs'

const candidate = ({ cutoff, prefixDigest = `prefix-${cutoff}`, digest = `frozen-${cutoff}`, seal = `seal-${cutoff}` }) =>
  prefix.snapshot({
    ref: `blob-frozen-${cutoff}`,
    frozenDigest: digest,
    cutoff,
    prefixDigest,
    sealRoot: seal,
    syntheticId: `synthetic-${seal}`,
  })

const rebase = (state, { previousEpoch, nextEpoch, cutoff, digest, seal, prefixDigest }) =>
  prefix.applyRebase(
    { previousEpoch, nextEpoch, candidate: candidate({ cutoff, digest, seal, prefixDigest }) },
    state,
  )

const reanchor = (state, { previousEpoch, nextEpoch, observedRun = 'msg_compaction' }) =>
  prefix.applyReanchor({ previousEpoch, nextEpoch, observedRun }, state)

test('WHAT[prefix-stability-005] CTX_012_a_replayed_rebase_is_reported_as_stale', () => {
  // CTX-012's recovery path re-attempts the commit after a restart: it cannot
  // know whether the append landed before the crash. The second attempt carries
  // the epoch it expected, which the projection has left.
  //
  // The projection says so; Fold turns that into an absorbed no-op. Keeping the
  // two layers distinct is what lets the frame projection treat the SAME shape of
  // refusal as fatal — see blog-projection.test.mjs.
  const once = rebase(prefix.empty, { previousEpoch: 0, nextEpoch: 1, cutoff: 4, seal: 'seal-P1' }).value

  const replay = rebase(once, { previousEpoch: 0, nextEpoch: 1, cutoff: 4, seal: 'seal-P1' })
  assert.deepEqual(replay, { ok: false, error: 'StalePrefixEpoch' })

  assert.equal(prefix.epochOf(once), 1n)
  assert.deepEqual(once.snapshot, candidate({ cutoff: 4, seal: 'seal-P1' }))
})

test.todo('WHAT[prefix-stability-005] actual next-attempt seal observes a durably committed rebase and refuses progression after append failure; GAP-106')

for (const refused of [false, true]) {
  test(`WHAT[prefix-stability-005] the real Journal ${refused ? 'refuses the whole prefix transition' : 'publishes the prefix epoch and auxiliary retirement together'}`, async () => {
    const { execFileSync } = await import('node:child_process')
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const observation = await import('../../../dist/Verification/JournalPortObservationSurface.js')
    const directory = mkdtempSync(join(tmpdir(), 'wxs-prefix-atomic-'))
    execFileSync('git', ['init', '--quiet', directory])
    try {
      const result = await observation.prefixRebaseScenario(join(directory, '.git'), 'prefix-atomic', refused)
      assert.deepEqual(result.before, { epoch: 0n, tip: true, guidelines: 1, grounding: 1 })
      if (refused) {
        assert.equal(result.refusal.refused, 1)
        assert.equal(result.refusal.value.committed, false)
        assert.equal(result.revisionUnchanged, true)
        assert.deepEqual(result.after, result.before)
      } else {
        assert.equal(result.committed, true)
        assert.equal(result.parkedRevisionUnchanged, true)
        assert.deepEqual(result.parked, result.before)
        assert.deepEqual(result.after, { epoch: 1n, tip: false, guidelines: 0, grounding: 0 })
        assert.equal(result.advancedOnce, true)
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
}

integrationTest('WHAT[prefix-stability-005] real Fable isolates prefix construction and settlement and keeps plans until both commits succeed', async t => {
  const { createHash } = await import('node:crypto')
  const { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { basename, dirname, join, relative, resolve } = await import('node:path')
  const { pathToFileURL } = await import('node:url')
  const { planOwnerCompile, materializeOwnerCompile, compileOwnerProject } = await import('../../../scripts/lib/owner-compile.mjs')
  const root = resolve(import.meta.dirname, '../../..')
  const sourceRoot = join(root, 'src/Wanxiangshu')
  const scratch = mkdtempSync(join(tmpdir(), 'wxs-prefix-workflow-'))
  const captured = new Map()
  const capture = file => {
    const bytes = readFileSync(file)
    if (captured.has(file)) assert.deepEqual(bytes, captured.get(file), `input changed: ${file}`)
    else captured.set(file, bytes)
    return bytes
  }
  const checkInputs = () => {
    for (const [file, bytes] of captured) assert.deepEqual(readFileSync(file), bytes, `input changed: ${file}`)
  }
  const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
  const compile = async (owner, label, probe, reject = false, modulePath) => {
    checkInputs()
    const projectPath = join(sourceRoot, `Wanxiangshu.Owner.${owner}.fsproj`)
    const plan = planOwnerCompile({ projectPath, aggregatePath: null })
    for (const file of plan.projectPaths) assert.equal(capture(file).toString('utf8'), plan.projectContents.get(file))
    const digest = createHash('sha256')
    const compileItems = [...plan.compileItems, ...(probe ? [join(import.meta.dirname, 'fixtures', probe)] : [])].map(file => {
      const bytes = capture(file)
      digest.update(relative(root, file)).update('\0').update(bytes).update('\0')
      const sourcePath = file.startsWith(sourceRoot + '/') ? relative(sourceRoot, file) : join('CompilerProbe', basename(file))
      const destination = join(scratch, 'inputs', label, sourcePath)
      mkdirSync(dirname(destination), { recursive: true })
      writeFileSync(destination, bytes)
      return destination
    })
    const compilePlan = { ...plan, compileItems, forceCompileCache: false }
    const options = { projectPath, aggregatePath: null, compilePlan, scratchRoot: join(scratch, 'compiler'),
      rootPropsPath: join(scratch, 'config/src/Wanxiangshu/Directory.Build.props'), stdio: 'pipe' }
    const flat = materializeOwnerCompile(compilePlan, options)
    const flatText = readFileSync(flat.projectPath, 'utf8')
    assert.doesNotMatch(flatText, /<ProjectReference\b/)
    assert.equal((flatText.match(/<Compile Include=/g) ?? []).length, compileItems.length)
    const result = await compileOwnerProject(options)
    checkInputs()
    t.diagnostic(JSON.stringify({ label, shards: plan.projectPaths.length, sources: plan.compileItems.filter(file => file.endsWith('.fs')).length,
      sourcesSha256: digest.digest('hex'), code: result.code, signal: result.signal, elapsedMs: result.elapsedMs }))
    const diagnostics = `${result.stdout}\n${result.stderr}`
    assert.equal(result.signal, null, 'termination is not a boundary proof')
    if (reject) {
      assert.equal(result.code, 1, diagnostics)
      assert.equal(result.ok, false)
      assert.match(diagnostics, /The type 'AgentJournal' is not defined/, diagnostics)
      assert.ok(diagnostics.includes(probe))
    } else {
      assert.equal(result.code, 0, diagnostics)
      assert.equal(result.ok, true)
      const suffix = probe ? 'CompilerProbe/' + probe.replace(/\.fs$/, '.js') : modulePath
      const modules = files(result.outputPath).filter(file => file.endsWith('/' + suffix))
      assert.equal(modules.length, 1, `missing fresh module ${suffix}`)
      return import(pathToFileURL(modules[0]).href)
    }
  }
  try {
    for (const file of ['Directory.Build.props', 'src/Wanxiangshu/Directory.Build.props']) {
      const destination = join(scratch, 'config', file)
      mkdirSync(dirname(destination), { recursive: true })
      writeFileSync(destination, capture(join(root, file)))
    }
    for (const file of ['global.json', '.config/dotnet-tools.json', 'package-lock.json', 'src/Wanxiangshu/compile-order.txt', 'scripts/lib/owner-compile.mjs']) capture(join(root, file))
    const config = JSON.parse(capture(join(root, 'package.json')))
    writeFileSync(join(scratch, 'package.json'), JSON.stringify({ type: 'module', imports: config.imports }))
    symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'), 'dir')
    const envelope = join(scratch, 'dist/Execution/Session/LoopDetectorEnvelope.js')
    mkdirSync(dirname(envelope), { recursive: true })
    writeFileSync(envelope, capture(join(root, 'resources/degeneration-guard/envelope/LoopDetectorEnvelope.js')))
    await compile('durable-composition.durable-adapter-prefix', 'legal-journal', 'ForbiddenJournal.fs')
    await compile('durable-composition.durable-adapter-prefix', 'adapter', null, false, 'Composition/Durable/PrefixJournalAdapter.js')
    const workflow = await compile('dispatch-protocol.dispatch-prefix-workflow', 'workflow', 'PrefixWorkflowProbe.fs')
    await workflow.verify()
    await compile('dispatch-protocol.dispatch-prefix-port', 'port', null, false, 'Interaction/Dispatch/PrefixPort.js')
    await compile('prefix-stability.context-prefix-materialization', 'materialization', null, false, 'Context/Prefix/Materialization.js')
    await compile('prefix-stability.context-prefix-wire-surface', 'surface', null, false, 'Context/Prefix/XWireSurface.js')
    for (const owner of ['dispatch-protocol.dispatch-prefix-workflow', 'prefix-stability.context-prefix-materialization', 'prefix-stability.context-prefix-wire-surface']) {
      await compile(owner, 'forbidden-' + owner, 'ForbiddenJournal.fs', true)
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
    checkInputs()
  }
})
