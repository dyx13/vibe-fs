import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readCompileShardInventory } from '../../../../scripts/lib/compile-shards.mjs'
import { compileOwnerProject, planOwnerCompile, materializeOwnerCompile } from '../../../../scripts/lib/owner-compile.mjs'

const root = resolve(import.meta.dirname, '../../../..')
const sourceRoot = join(root, 'src/Wanxiangshu')
export const fixtureRoot = resolve(import.meta.dirname, '../fixtures/session-contract-boundary')
const erasedContracts = new Set(['OpenCode/Host/SessionHostPort.js', 'OpenCode/Host/SessionRuntimeOwner.js'])
const emittedFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const file = join(directory, entry.name)
  return entry.isDirectory() ? emittedFiles(file) : [file]
})

export const withHostCompiler = async (t, run) => {
  const scratch = mkdtempSync(join(tmpdir(), 'wxs-host-session-compile-'))
  const inventory = readCompileShardInventory({ repositoryRoot: root })
  const observedInputs = new Map()
  const capture = (file) => {
    const bytes = readFileSync(file)
    if (observedInputs.has(file)) assert.deepEqual(bytes, observedInputs.get(file), `compiler input changed: ${file}`)
    else observedInputs.set(file, bytes)
    return bytes
  }
  const assertUnchanged = () => {
    for (const [file, bytes] of observedInputs) assert.deepEqual(readFileSync(file), bytes, `compiler input changed: ${file}`)
  }
  const load = async (result, suffix) => {
    const matches = emittedFiles(result.outputPath).filter((file) => file.endsWith('/' + suffix))
    if (matches.length === 0 && erasedContracts.has(suffix)) return
    assert.equal(matches.length, 1, `the fresh compiler output must contain exactly one ${suffix}`)
    return import(pathToFileURL(matches[0]).href)
  }
  const compile = async (name, label, probeName, expectedMissing, modules) => {
    assertUnchanged()
    const projectPath = resolve(sourceRoot, name)
    const plan = planOwnerCompile({ projectPath, aggregatePath: null })
    for (const file of plan.projectPaths) assert.equal(capture(file).toString('utf8'), plan.projectContents.get(file))
    if (projectPath.startsWith(fixtureRoot + '/')) {
      const order = new Map(capture(join(sourceRoot, 'compile-order.txt')).toString('utf8').trim().split('\n')
        .map((file, index) => [join(sourceRoot, file.trim()), index]))
      plan.compileItems.sort((left, right) => (order.get(left) ?? Infinity) - (order.get(right) ?? Infinity))
    }
    const inputHash = createHash('sha256')
    const projectHash = createHash('sha256')
    for (const file of plan.projectPaths) projectHash.update(relative(root, file)).update('\0').update(capture(file)).update('\0')
    const sourceFiles = [...plan.compileItems, ...(probeName ? [join(fixtureRoot, probeName)] : [])]
    const compileItems = sourceFiles.map((file) => {
      const bytes = capture(file)
      inputHash.update(relative(root, file)).update('\0').update(bytes).update('\0')
      const sourcePath = file.startsWith(fixtureRoot + '/') ? join('CompilerProbe', basename(file)) : relative(sourceRoot, file)
      const destination = join(scratch, 'inputs', label, sourcePath)
      mkdirSync(dirname(destination), { recursive: true })
      writeFileSync(destination, bytes)
      return destination
    })
    const isolatedPlan = { ...plan, compileItems, forceCompileCache: false }
    const options = {
      projectPath, aggregatePath: null, scratchRoot: join(scratch, 'compiler'),
      rootPropsPath: join(sourceRoot, 'Directory.Build.props'), stdio: 'pipe', compilePlan: isolatedPlan,
    }
    const materialized = materializeOwnerCompile(isolatedPlan, options)
    const flatProject = readFileSync(materialized.projectPath, 'utf8')
    assert.doesNotMatch(flatProject, /<ProjectReference\b/)
    assert.equal((flatProject.match(/<Compile Include=/g) ?? []).length, compileItems.length)
    const result = await compileOwnerProject(options)
    assertUnchanged()
    const receipt = {
      label, root: relative(root, projectPath), shards: plan.projectPaths.length,
      sources: plan.compileItems.filter((file) => file.endsWith('.fs')).length,
      inputSha256: inputHash.digest('hex'), projectSha256: projectHash.digest('hex'),
      code: result.code, signal: result.signal, elapsedMs: result.elapsedMs, cached: result.cached,
    }
    t.diagnostic(JSON.stringify(receipt))
    const diagnostics = `${result.stdout}\n${result.stderr}`
    assert.equal(result.signal, null, 'a terminated compiler does not prove a capability boundary')
    if (expectedMissing) {
      assert.equal(result.ok, false, `${expectedMissing} must not be available through this contract`)
      assert.notEqual(result.code, 0)
      for (const capability of [expectedMissing].flat()) {
        assert.match(diagnostics, new RegExp(`The (?:type|value or constructor|value, namespace, type or module) '${capability}' is not defined`), diagnostics)
      }
      assert.ok(diagnostics.includes(probeName), 'the rejection must identify the capability probe')
      return { receipt, diagnostics }
    }
    assert.equal(result.ok, true, diagnostics)
    assert.equal(result.code, 0)
    const ownedModules = modules ?? inventory.projects.get(projectPath).implementationFiles
      .map((file) => relative(sourceRoot, file).replace(/\.fs$/, '.js'))
    if (ownedModules.includes('OpenCode/Plugin/Plugin.js')) {
      const metadata = emittedFiles(result.outputPath).filter((file) => file.endsWith('/Resources/PackageMetadata.js'))
      assert.equal(metadata.length, 1, 'the compiled plugin must have one physical package resource root')
      const packageRoot = resolve(dirname(metadata[0]), '../..')
      for (const resource of ['host/pair-programming-guideline', 'tool/bash-honeypot/description']) {
        for (const language of ['en', 'zh-CN']) {
          const file = join('resources/provider', resource, language + '.md')
          const destination = join(packageRoot, file)
          mkdirSync(dirname(destination), { recursive: true })
          writeFileSync(destination, capture(join(root, file)))
          assert.deepEqual(readFileSync(destination), capture(join(root, file)))
        }
      }
    }
    for (const suffix of ownedModules) await load(result, suffix)
    if (probeName) {
      const probe = await load(result, 'CompilerProbe/' + probeName.replace(/\.fs$/, '.js'))
      if (['LegalSession.fs', 'LegalMessageEvidence.fs', 'LegalMessageConversion.fs'].includes(probeName)) probe.verify()
    }
    return { receipt, load: (suffix) => load(result, suffix) }
  }
  try {
    for (const file of ['Directory.Build.props', 'src/Wanxiangshu/Directory.Build.props', 'src/Wanxiangshu/compile-order.txt', '.config/dotnet-tools.json', 'global.json', 'package-lock.json']) capture(join(root, file))
    const packageConfig = JSON.parse(capture(join(root, 'package.json')))
    writeFileSync(join(scratch, 'package.json'), JSON.stringify({ type: 'module', imports: packageConfig.imports }))
    symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'), 'dir')
    const envelope = capture(join(root, 'resources/degeneration-guard/envelope/LoopDetectorEnvelope.js'))
    const envelopePath = join(scratch, 'dist/Execution/Session/LoopDetectorEnvelope.js')
    mkdirSync(dirname(envelopePath), { recursive: true })
    writeFileSync(envelopePath, envelope)
    assert.deepEqual(readFileSync(envelopePath), envelope)
    await run(compile)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
    assertUnchanged()
  }
}
