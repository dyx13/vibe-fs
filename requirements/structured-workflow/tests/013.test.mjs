import test from 'node:test'
import { integrationTest } from '../../verification-system/tests/support/tier-gate.mjs'

{
const { default: assert } = await import("node:assert/strict");
const { readFileSync } = await import("node:fs");
const { default: test } = await import("node:test");
const { buildSubsystemInventory } = await import("../../../scripts/checks/subsystems.mjs");

const closure = (inventory, root) => {
  const visited = new Set()
  const visit = (path) => {
    if (visited.has(path)) return
    visited.add(path)
    for (const reference of inventory.projects.get(path).references) visit(reference)
  }
  visit(root.projectPath)
  return [...visited].flatMap((path) => inventory.projects.get(path).implementationFiles)
}

test('WHAT[structured-workflow-013] attention tools consume their own port without durable aggregate or runtime containers', () => {
  const inventory = buildSubsystemInventory()
  assert.ok(inventory.ok, inventory.violations.join('\n'))
  const tools = [...inventory.projects.values()].find((project) =>
    project.implementationFiles.some((file) => file.endsWith('/OpenCode/Tools/AttentionTools.fs')))
  assert.ok(tools, 'the real AttentionTools consumer must have a compile shard')
  assert.equal(tools.subsystem, 'interaction')
  for (const file of closure(inventory, tools)) {
    assert.doesNotMatch(file, /\/(?:Composition\/Durable|Persistence\/Journal)\//,
      `attention tool closure must not acquire aggregate persistence: ${file}`)
    assert.doesNotMatch(file, /\/(?:PluginRuntimeScope|ToolRuntimeScope)\.fs$/,
      `attention tool closure must not acquire an application runtime container: ${file}`)
  }
  for (const file of [...tools.implementationFiles, ...tools.signatureFiles]) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /\b(?:AgentJournal|AgentFact|ProjectionSet|AgentProjectionSet)\b/,
      `attention tool boundary must not expose a foreign aggregate: ${file}`)
  }
  const port = [...inventory.projects.values()].find((project) =>
    project.implementationFiles.some((file) => file.endsWith('/Interaction/Attention/JournalPort.fs')))
  assert.equal(port?.subsystem, 'interaction', 'the port vocabulary belongs to the consumer domain')
  const adapter = [...inventory.projects.values()].find((project) =>
    project.implementationFiles.some((file) => file.endsWith('/Composition/Durable/AttentionConcernJournalAdapter.fs')))
  assert.equal(adapter?.subsystem, 'durable-composition', 'outer routing belongs to durable composition')
  const registry = [...inventory.projects.values()].find((project) =>
    project.implementationFiles.some((file) => file.endsWith('/OpenCode/Tools/ToolRegistry.fs')))
  assert.ok(registry.references.includes(adapter.projectPath), 'the real registry must wire the durable adapter')
  const registryFile = registry.implementationFiles.find((file) => file.endsWith('/OpenCode/Tools/ToolRegistry.fs'))
  assert.doesNotMatch(readFileSync(registryFile, 'utf8'), /AgentFact\.Attention\b/,
    'the registry must not take ownership of durable routing')
})
}

{
const { default: assert } = await import("node:assert/strict");
const { EventEmitter } = await import("node:events");
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join, relative, resolve } = await import("node:path");
const { default: test } = await import("node:test");
const { checkSubsystems } = await import("../../../scripts/checks/subsystems.mjs");
const { planOwnerCompile, materializeOwnerCompile, compileOwnerProject } = await import("../../../scripts/lib/owner-compile.mjs");

const ROOT = resolve(import.meta.dirname, '../../..')
const SRC = join(ROOT, 'src/Wanxiangshu')
const FIXTURE = join(ROOT, 'requirements/structured-workflow/tests/fixtures/owner-project-boundary')
const inventory = checkSubsystems()
assert.ok(inventory.ok, inventory.violations.join('\n'))
function productionProject(projectName) {
  const project = inventory.projects.get(join(SRC, projectName))
  assert.ok(project, `missing production compile shard ${projectName}`)
  return project
}
function compileItems(projectName) {
  const project = productionProject(projectName)
  return [...project.signatureFiles, ...project.implementationFiles].map((path) => relative(SRC, path))
}
function references(projectName) {
  return productionProject(projectName).references.map((path) => relative(SRC, path))
}

test('WHAT[structured-workflow-013] GitGateway exposes a narrow dependency-inverted compiler boundary', () => {
  const providerName = 'Wanxiangshu.Owner.change-integration.git-gateway.fsproj'
  const provider = productionProject(providerName)
  assert.equal(provider.shard, 'git-gateway')
  assert.equal(provider.subsystem, 'change')
  assert.deepEqual(compileItems(providerName), ['Git/Gateway.fsi', 'Git/Gateway.fs'])

  const consumer = references('Wanxiangshu.Owner.durable-convergence.git-hook-sync.fsproj')
  assert.ok(consumer.includes(providerName))
  assert.ok(!consumer.includes('Wanxiangshu.Owner.change-integration.git-integrationgate.fsproj'))

  const signature = readFileSync(join(SRC, 'Git/Gateway.fsi'), 'utf8')
  assert.doesNotMatch(signature, /SyncActiveEnv|discoverRemote/)
})
test('WHAT[structured-workflow-013] request kind and fallback facts remain disjoint compile shards', () => {
  const requestProject = 'Wanxiangshu.Owner.provider-attempt-recovery.participant-provider-attempt-requestkind.fsproj'
  const factsProject = 'Wanxiangshu.Owner.provider-attempt-recovery.participant-provider-attempt-fallback-facts.fsproj'

  assert.deepEqual(compileItems(requestProject), [
    'Participant/Provider/Attempt/RequestKind.fsi',
    'Participant/Provider/Attempt/RequestKind.fs',
  ])
  assert.deepEqual(compileItems(factsProject), [
    'Participant/Provider/Attempt/Fallback/Facts.fsi',
    'Participant/Provider/Attempt/Fallback/Facts.fs',
  ])

  const capabilityRefs = references(
    'Wanxiangshu.Owner.capability-enforcement.opencode-host-managedagentconfig.fsproj',
  )
  assert.ok(capabilityRefs.includes(requestProject))
  assert.ok(!capabilityRefs.includes(factsProject))

  const durableFactRefs = references('Wanxiangshu.Owner.durable-events.composition-durable-fact.fsproj')
  assert.ok(durableFactRefs.includes(factsProject))
  assert.ok(!durableFactRefs.includes(requestProject))

  const durableCodecRefs = references('Wanxiangshu.Owner.durable-events.persistence-journal-promptfactcodec.fsproj')
  assert.ok(durableCodecRefs.includes(factsProject))
  assert.ok(!durableCodecRefs.includes(requestProject))

  const verificationRefs = references(
    'Wanxiangshu.Owner.verification-system.verification-eventstorewritersurface.fsproj',
  )
  assert.ok(verificationRefs.includes(factsProject))
  assert.ok(!verificationRefs.includes(requestProject))

  const ownerFallbackRefs = references(
    'Wanxiangshu.Owner.provider-attempt-recovery.participant-provider-attempt-fallback-fact.fsproj',
  )
  assert.ok(ownerFallbackRefs.includes(requestProject))
  assert.ok(ownerFallbackRefs.includes(factsProject))

})
}

{
const { default: assert } = await import("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { basename, join, resolve } = await import("node:path");
const { default: test } = await import("node:test");
const { buildSubsystemInventory } = await import("../../../scripts/checks/subsystems.mjs");
const { readCompileShardInventory } = await import("../../../scripts/lib/compile-shards.mjs");

const ROOT = resolve(import.meta.dirname, '../../..')
const project = (inventory, name) => {
  const match = [...inventory.projects.values()].find((entry) => basename(entry.projectPath) === name)
  assert.ok(match, `missing compile shard ${name}`)
  return match
}
const sources = (entry) => entry.implementationFiles.map((path) => path.replace(ROOT.replace(/\\/g, '/') + '/', '').replace(/\\/g, '/')).sort()
const refs = (entry) => entry.references.map((path) => basename(path)).sort()
const fakeShard = (name, { subsystem = '', shard = '', owner = '', locality = '', refs = [] } = {}) => ({
  projectPath: `/fake/${name}`,
  projectRepoPath: `src/Wanxiangshu/${name}`,
  explicitSubsystem: subsystem,
  explicitCompileShard: shard,
  legacyOwner: owner,
  legacyLocality: locality,
  references: refs.map((ref) => `/fake/${ref}`),
})
const fakeCompileInventory = (entries) => ({
  projects: new Map(entries.map((entry) => [entry.projectPath, entry])),
  sourceCount: entries.length,
  projectReferenceCount: entries.reduce((sum, entry) => sum + entry.references.length, 0),
})
const fakePolicy = (ids, legacyPairs = []) => ({ ids: new Set(ids), legacyOwnerSubsystem: new Map(legacyPairs) })
const SHARD_XML = ({ owner, locality, refs = [], files = [] }) => `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <WanxiangshuSemanticOwner>${owner}</WanxiangshuSemanticOwner>
    <WanxiangshuOwnerLocality>${locality}</WanxiangshuOwnerLocality>
    <WanxiangshuOwnerLocalityKind>contract</WanxiangshuOwnerLocalityKind>
  </PropertyGroup>
  <ItemGroup>
${[...refs.map((ref) => `    <ProjectReference Include="${ref}" />`), ...files.map((file) => `    <Compile Include="${file}" />`)].join('\n')}
  </ItemGroup>
</Project>
`
const AGGREGATE_XML = (files) => `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
${files.map((file) => `    <Compile Include="${file}" />`).join('\n')}
  </ItemGroup>
</Project>
`
const makeShardRepo = (shards) => {
  const dir = mkdtempSync(join(tmpdir(), 'wanxiangshu-subsystem-boundaries-'))
  const aggregate = []
  for (const shard of shards) {
    const files = []
    for (const module of shard.modules) {
      writeFileSync(join(dir, `${module}.fsi`), `module ${module}\n`, 'utf8')
      writeFileSync(join(dir, `${module}.fs`), `module ${module}\n`, 'utf8')
      files.push(`${module}.fsi`, `${module}.fs`)
    }
    aggregate.push(...files)
    writeFileSync(join(dir, shard.name), SHARD_XML({ owner: shard.owner, locality: shard.locality, refs: shard.refs ?? [], files }), 'utf8')
  }
  writeFileSync(join(dir, 'Wanxiangshu.fsproj'), AGGREGATE_XML(aggregate), 'utf8')
  return dir
}
const readRepo = (dir) => readCompileShardInventory({ repositoryRoot: dir, sourceRoot: dir, aggregatePath: join(dir, 'Wanxiangshu.fsproj') })
const withShardRepo = (t, shards) => {
  const dir = makeShardRepo(shards)
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('WHAT[structured-workflow-013] reusable platform shards depend on no domain subsystem', () => {
  const inventory = buildSubsystemInventory()
  let checkedPlatformShards = 0
  for (const entry of inventory.projects.values()) {
    if (entry.subsystem !== 'runtime-platform') continue
    checkedPlatformShards += 1
    for (const reference of entry.references) {
      const provider = inventory.projects.get(reference)
      assert.equal(provider.subsystem, 'runtime-platform', `${entry.shardKey} depends on ${provider.subsystem}/${provider.shard}`)
    }
  }
  assert.ok(checkedPlatformShards > 0, 'runtime-platform shards must be present and verified')

  const policy = fakePolicy(
    ['runtime-platform', 'dispatch'],
    [['legacy-platform-owner', 'runtime-platform'], ['dispatch-protocol', 'dispatch']],
  )
  const check = (consumer, provider) => buildSubsystemInventory({
    compileInventory: fakeCompileInventory([consumer, provider]),
    policyState: policy,
  })
  const explicitPrimitive = fakeShard('Wanxiangshu.Owner.test-primitives.fsproj', { subsystem: 'runtime-platform', shard: 'primitives' })
  const legacyPrimitive = fakeShard('Wanxiangshu.Owner.legacy-platform-owner.primitives.fsproj', { owner: 'legacy-platform-owner', locality: 'primitives' })
  const domainShard = fakeShard('Wanxiangshu.Owner.dispatch-protocol.runtime-nudge.fsproj', { subsystem: 'dispatch', shard: 'runtime-nudge' })

  const explicitLegal = check(
    fakeShard('Wanxiangshu.Owner.test-tool.fsproj', { subsystem: 'runtime-platform', shard: 'tool', refs: ['Wanxiangshu.Owner.test-primitives.fsproj'] }),
    explicitPrimitive,
  )
  assert.equal(explicitLegal.ok, true, explicitLegal.violations.join('\n'))

  const explicitRed = check(
    fakeShard('Wanxiangshu.Owner.test-tool.fsproj', { subsystem: 'runtime-platform', shard: 'tool', refs: ['Wanxiangshu.Owner.dispatch-protocol.runtime-nudge.fsproj'] }),
    domainShard,
  )
  assert.equal(explicitRed.ok, false, 'an explicit platform shard with a domain dependency must go red')
  assert.match(explicitRed.violations.join('\n'), /reusable runtime-platform shard depends on domain subsystem dispatch\/runtime-nudge/)

  const legacyLegal = check(
    fakeShard('Wanxiangshu.Owner.legacy-platform-owner.tool.fsproj', { owner: 'legacy-platform-owner', locality: 'tool', refs: ['Wanxiangshu.Owner.legacy-platform-owner.primitives.fsproj'] }),
    legacyPrimitive,
  )
  assert.equal(legacyLegal.ok, true, legacyLegal.violations.join('\n'))
  assert.equal(
    legacyLegal.projects.get('/fake/Wanxiangshu.Owner.legacy-platform-owner.tool.fsproj').subsystem,
    'runtime-platform',
    'legacy mapping must resolve the platform shard before the dependency rule applies',
  )

  const legacyRed = check(
    fakeShard('Wanxiangshu.Owner.legacy-platform-owner.tool.fsproj', { owner: 'legacy-platform-owner', locality: 'tool', refs: ['Wanxiangshu.Owner.dispatch-protocol.runtime-nudge.fsproj'] }),
    domainShard,
  )
  assert.equal(legacyRed.ok, false, 'a legacy-mapped platform shard with a domain dependency must go red')
  assert.match(legacyRed.violations.join('\n'), /reusable runtime-platform shard depends on domain subsystem dispatch\/runtime-nudge/)
})
}

integrationTest('WHAT[structured-workflow-013] the real Change program and recovery run through narrow contracts and reject physical implementations', async (t) => {
  const { default: assert } = await import('node:assert/strict')
  const { createHash } = await import('node:crypto')
  const { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { dirname, join, relative, resolve } = await import('node:path')
  const { pathToFileURL } = await import('node:url')
  const { planOwnerCompile, materializeOwnerCompile, compileOwnerProject } = await import('../../../scripts/lib/owner-compile.mjs')

  const root = resolve(import.meta.dirname, '../../..')
  const sourceRoot = join(root, 'src/Wanxiangshu')
  const scratchRoot = mkdtempSync(join(tmpdir(), 'wanxiangshu-change-contract-'))
  const programPath = join(sourceRoot, 'Wanxiangshu.Owner.change-integration.change-program.fsproj')
  const recoveryPath = join(sourceRoot, 'Wanxiangshu.Owner.change-integration.change-recovery.fsproj')
  const portContractPath = join(sourceRoot, 'Wanxiangshu.Owner.change-integration.change-orchestrator-port-contract.fsproj')
  const providerPath = join(sourceRoot, 'Wanxiangshu.Owner.change-integration.git-integrationgate.fsproj')
  const behaviorProbe = join(root, 'requirements/change-integration/tests/fixtures/ProgramProbe.fs')
  const recoveryProbe = join(root, 'requirements/change-integration/tests/fixtures/RecoveryProbe.fs')
  const capabilityProbe = join(root, 'requirements/structured-workflow/tests/fixtures/change-contract-boundary/ForbiddenCapabilities.fs')
  const forbiddenSources = [
    join(sourceRoot, 'Persistence/Journal/AgentJournal.fs'),
    join(sourceRoot, 'Git/WorktreeResource.fs'),
    join(sourceRoot, 'Change/Runtime.fs'),
  ]
  const observedInputs = new Map()
  const captureInput = (file) => {
    const bytes = readFileSync(file)
    if (observedInputs.has(file)) assert.deepEqual(bytes, observedInputs.get(file), `input changed during compiler proof: ${file}`)
    else observedInputs.set(file, bytes)
    return bytes
  }
  const assertInputsUnchanged = () => {
    for (const [file, bytes] of observedInputs) {
      assert.deepEqual(readFileSync(file), bytes, `input changed during compiler proof: ${file}`)
    }
  }
  const compileProbe = async (projectPath, probe, label) => {
    assertInputsUnchanged()
    const plan = planOwnerCompile({ projectPath, aggregatePath: null })
    for (const project of plan.projectPaths) {
      assert.equal(captureInput(project).toString('utf8'), plan.projectContents.get(project))
    }
    const inputHash = createHash('sha256')
    const compileItems = [...plan.compileItems, ...(probe ? [probe] : [])].map((file) => {
      const bytes = captureInput(file)
      const path = relative(root, file)
      assert.ok(!path.startsWith('..'), `compiler input must belong to this repository: ${file}`)
      inputHash.update(path).update('\0').update(bytes).update('\0')
      const destination = join(scratchRoot, 'inputs', label, path)
      mkdirSync(dirname(destination), { recursive: true })
      writeFileSync(destination, bytes)
      return destination
    })
    const isolatedPlan = { ...plan, compileItems, forceCompileCache: false }
    const options = {
      projectPath,
      aggregatePath: null,
      scratchRoot: join(scratchRoot, 'compiler'),
      rootPropsPath: join(root, 'Directory.Build.props'),
      stdio: 'pipe',
      compilePlan: isolatedPlan,
    }
    const materialized = materializeOwnerCompile(isolatedPlan, options)
    const projectXml = readFileSync(materialized.projectPath, 'utf8')
    assert.doesNotMatch(projectXml, /<ProjectReference\b/)
    assert.equal((projectXml.match(/<Compile Include=/g) ?? []).length, compileItems.length)
    const result = await compileOwnerProject(options)
    assertInputsUnchanged()
    t.diagnostic(JSON.stringify({
      label,
      root: relative(root, projectPath),
      shards: plan.projectPaths.length,
      sources: plan.compileItems.filter((file) => file.endsWith('.fs')).length,
      sourcesSha256: inputHash.digest('hex'),
      code: result.code,
      signal: result.signal,
      elapsedMs: result.elapsedMs,
      immutableInputsProven: false,
    }))
    return result
  }
  const assertCompiled = (result) => {
    assert.equal(result.signal, null, `compiler was terminated: ${result.signal}`)
    assert.equal(result.ok, true, `${result.stdout}\n${result.stderr}`)
    assert.equal(result.code, 0)
  }
  const emittedFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name)
    return entry.isDirectory() ? emittedFiles(file) : [file]
  })

  try {
    writeFileSync(join(scratchRoot, 'package.json'), '{"type":"module"}\n')
    for (const file of [
      'Directory.Build.props',
      'src/Wanxiangshu/Directory.Build.props',
      'src/Wanxiangshu/compile-order.txt',
      '.config/dotnet-tools.json',
      'global.json',
      'package-lock.json',
      'scripts/lib/owner-compile.mjs',
    ]) captureInput(join(root, file))
    const programPlan = planOwnerCompile({ projectPath: programPath, aggregatePath: null })
    const recoveryPlan = planOwnerCompile({ projectPath: recoveryPath, aggregatePath: null })
    const providerPlan = planOwnerCompile({ projectPath: providerPath, aggregatePath: null })
    for (const file of forbiddenSources) {
      assert.ok(!programPlan.compileItems.includes(file), `the Change program must not acquire ${relative(sourceRoot, file)}`)
      assert.ok(!recoveryPlan.compileItems.includes(file), `Change recovery must not acquire ${relative(sourceRoot, file)}`)
      assert.ok(providerPlan.compileItems.includes(file), `the legal provider must contain ${relative(sourceRoot, file)}`)
    }

    const program = await compileProbe(programPath, behaviorProbe, 'program')
    assertCompiled(program)
    const modules = emittedFiles(program.outputPath).filter((file) => file.endsWith('/ProgramProbe.js'))
    assert.equal(modules.length, 1, 'the fresh compiler output must contain exactly one ProgramProbe module')
    const probe = await import(pathToFileURL(modules[0]).href)
    assert.equal(typeof probe.verify, 'function')
    await probe.verify()
    t.diagnostic('the fresh Change program passed its capability-based behavior probe')

    const recovery = await compileProbe(recoveryPath, recoveryProbe, 'recovery')
    assertCompiled(recovery)
    const recoveryModules = emittedFiles(recovery.outputPath).filter((file) => file.endsWith('/RecoveryProbe.js'))
    assert.equal(recoveryModules.length, 1, 'the fresh compiler output must contain exactly one RecoveryProbe module')
    const recoveryBehavior = await import(pathToFileURL(recoveryModules[0]).href)
    assert.equal(typeof recoveryBehavior.verify, 'function')
    await recoveryBehavior.verify()

    const portContract = await compileProbe(portContractPath, null, 'orchestrator-port-contract')
    assertCompiled(portContract)

    const provider = await compileProbe(providerPath, capabilityProbe, 'legal-provider')
    assertCompiled(provider)

    const rejected = await compileProbe(programPath, capabilityProbe, 'forbidden-capabilities')
    const diagnostics = `${rejected.stdout}\n${rejected.stderr}`
    assert.equal(rejected.signal, null, 'a terminated compiler is not a rejected capability')
    assert.equal(rejected.ok, false, 'the narrow Change program must not acquire a Journal, worktree or engine implementation')
    assert.notEqual(rejected.code, 0)
    assert.match(diagnostics, /The type 'AgentJournal' is not defined/, diagnostics)
    assert.match(diagnostics, /The type 'WorktreeResource' is not defined/, diagnostics)
    assert.match(diagnostics, /The type 'Orchestrator' is not defined/, diagnostics)

    const rejectedRecovery = await compileProbe(recoveryPath, capabilityProbe, 'forbidden-recovery-capabilities')
    const recoveryDiagnostics = `${rejectedRecovery.stdout}\n${rejectedRecovery.stderr}`
    assert.equal(rejectedRecovery.signal, null, 'a terminated compiler is not a rejected capability')
    assert.equal(rejectedRecovery.ok, false, 'pure recovery must not acquire a Journal, worktree or engine implementation')
    assert.notEqual(rejectedRecovery.code, 0)
    assert.match(recoveryDiagnostics, /The type 'AgentJournal' is not defined/, recoveryDiagnostics)
    assert.match(recoveryDiagnostics, /The type 'WorktreeResource' is not defined/, recoveryDiagnostics)
    assert.match(recoveryDiagnostics, /The type 'Orchestrator' is not defined/, recoveryDiagnostics)
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true })
    assertInputsUnchanged()
  }
})

{
  const { default: assert } = await import('node:assert/strict')
  const { createHash } = await import('node:crypto')
  const { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { basename, dirname, join, relative, resolve } = await import('node:path')
  const { pathToFileURL } = await import('node:url')
  const { planOwnerCompile, materializeOwnerCompile, compileOwnerProject } = await import('../../../scripts/lib/owner-compile.mjs')

  const root = resolve(import.meta.dirname, '../../..')
  const sourceRoot = join(root, 'src/Wanxiangshu')
  const fixtureRoot = join(import.meta.dirname, 'fixtures/attempt-contract-boundary')
  const plannerProject = 'Wanxiangshu.Owner.dispatch-protocol.dispatch-attempt-planner.fsproj'
  const scopeProject = 'Wanxiangshu.Owner.host-boundary.opencode-host-sharedstatesurface.fsproj'
  const wireProject = 'Wanxiangshu.Owner.prefix-stability.context-prefix-wire.fsproj'
  const emittedFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name)
    return entry.isDirectory() ? emittedFiles(file) : [file]
  })

  const withAttemptCompiler = async (t, run) => {
    const scratch = mkdtempSync(join(tmpdir(), 'wxs-attempt-contract-'))
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
      assert.equal(matches.length, 1, `the fresh compiler output must contain exactly one ${suffix}`)
      return import(pathToFileURL(matches[0]).href)
    }
    const compile = async (name, label, probeName, rejectScope = false, modules = ['Context/Prefix/Wire.js']) => {
      assertUnchanged()
      const projectPath = join(sourceRoot, name)
      const plan = planOwnerCompile({ projectPath, aggregatePath: null })
      for (const file of plan.projectPaths) assert.equal(capture(file).toString('utf8'), plan.projectContents.get(file))
      const inputHash = createHash('sha256')
      const compileItems = [...plan.compileItems, ...(probeName ? [join(fixtureRoot, probeName)] : [])].map((file) => {
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
        projectPath,
        aggregatePath: null,
        scratchRoot: join(scratch, 'compiler'),
        rootPropsPath: join(scratch, 'config/src/Wanxiangshu/Directory.Build.props'),
        stdio: 'pipe',
        compilePlan: isolatedPlan,
      }
      const materialized = materializeOwnerCompile(isolatedPlan, options)
      const flatProject = readFileSync(materialized.projectPath, 'utf8')
      assert.doesNotMatch(flatProject, /<ProjectReference\b/)
      assert.equal((flatProject.match(/<Compile Include=/g) ?? []).length, compileItems.length)
      const result = await compileOwnerProject(options)
      assertUnchanged()
      t.diagnostic(JSON.stringify({
        label, root: name, shards: plan.projectPaths.length,
        sources: plan.compileItems.filter((file) => file.endsWith('.fs')).length,
        sourcesSha256: inputHash.digest('hex'), code: result.code, signal: result.signal,
        elapsedMs: result.elapsedMs, immutableInputsProven: false,
      }))
      const diagnostics = `${result.stdout}\n${result.stderr}`
      assert.equal(result.signal, null, 'a terminated compiler does not prove a capability boundary')
      if (rejectScope) {
        assert.equal(result.ok, false, 'the consumer must not acquire the physical recovery scope')
        assert.equal(result.code, 1, diagnostics)
        assert.match(diagnostics, /The type 'PluginRecoveryScope' is not defined/, diagnostics)
        assert.ok(diagnostics.includes(probeName), 'the rejection must identify the scope probe')
        return
      }
      assert.equal(result.ok, true, diagnostics)
      assert.equal(result.code, 0)
      if (modules.includes('OpenCode/Plugin/Plugin.js')) {
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
      if (probeName) return load(result, 'CompilerProbe/' + probeName.replace(/\.fs$/, '.js'))
      for (const module of modules) await load(result, module)
    }
    try {
      for (const file of [
        'Directory.Build.props', 'src/Wanxiangshu/Directory.Build.props', 'src/Wanxiangshu/compile-order.txt',
        '.config/dotnet-tools.json', 'global.json', 'package-lock.json', 'scripts/lib/owner-compile.mjs',
      ]) capture(join(root, file))
      for (const file of ['Directory.Build.props', 'src/Wanxiangshu/Directory.Build.props']) {
        const destination = join(scratch, 'config', file)
        mkdirSync(dirname(destination), { recursive: true })
        writeFileSync(destination, capture(join(root, file)))
      }
      for (const resource of ['host/pair-programming-guideline', 'tool/bash-honeypot/description']) {
        for (const language of ['en', 'zh-CN']) capture(join(root, 'resources/provider', resource, language + '.md'))
      }
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

  integrationTest('WHAT[structured-workflow-013] real Fable runs the pure attempt admission contract and rejects the physical recovery scope', async (t) => {
    await withAttemptCompiler(t, async (compile) => {
      const probe = await compile(plannerProject, 'planner', 'AttemptAdmissionProbe.fs')
      assert.equal(typeof probe.verify, 'function')
      probe.verify()
      await compile(scopeProject, 'legal-scope', 'ForbiddenRecoveryScope.fs')
      await compile(plannerProject, 'forbidden-planner-scope', 'ForbiddenRecoveryScope.fs', true)
    })
  })

  integrationTest('WHAT[structured-workflow-013] real Fable compiles prefix Wire without granting the physical recovery scope', async (t) => {
    await withAttemptCompiler(t, async (compile) => {
      await compile(wireProject, 'wire')
      await compile(scopeProject, 'legal-scope', 'ForbiddenRecoveryScope.fs')
      await compile(wireProject, 'forbidden-wire-scope', 'ForbiddenRecoveryScope.fs', true)
    })
  })

  integrationTest('WHAT[structured-workflow-013] real Fable compiles the attempt admission surface and plugin consumers', async (t) => {
    await withAttemptCompiler(t, async (compile) => {
      await compile('Wanxiangshu.Owner.host-boundary.opencode-host-pluginrecoveryscopesurface.fsproj',
        'scope-surface', null, false, ['OpenCode/Host/PluginRecoveryScopeSurface.js'])
      await compile('Wanxiangshu.Owner.opencode-plugin.plugin-composition.fsproj',
        'plugin', null, false, ['OpenCode/Plugin/PluginTransforms.js', 'OpenCode/Plugin/Plugin.js'])
    })
  })

  integrationTest('WHAT[structured-workflow-013] real Fable compiles the candidate result contract and its selection owner', async (t) => {
    await withAttemptCompiler(t, async (compile) => {
      await compile('Wanxiangshu.Owner.prefix-stability.context-prefix-candidate.fsproj',
        'candidate', null, false, ['Context/Prefix/Candidate.js'])
      await compile('Wanxiangshu.Owner.prefix-stability.mission-obligation-todo-prefixepoch.fsproj',
        'selection', null, false, ['Context/Prefix/ProbeSelection.js'])
    })
  })
}
