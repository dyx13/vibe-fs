/**
 * Pure oracles over a recorded trace. Eval-only. Never imported by production Tools.
 *
 * Trace: { role, toolCalls: [{ name, args }], mutations?: boolean }
 */

const named = (trace, ...names) => (trace.toolCalls ?? []).filter((call) => names.includes(call.name))

export const evaluateEngineerLocalInvestigationAndMutation = (_c, trace) => {
  if (trace.role !== 'engineer') return { ok: false, reason: 'expected Engineer' }
  const executes = named(trace, 'run', 'open-terminal', 'send-terminal', 'exec')
  if (executes.length > 0) return { ok: false, reason: 'Engineer must not execute real commands' }
  const reads = named(trace, 'read', 'glob', 'grep')
  const writes = named(trace, 'write', 'edit', 'mv', 'rm')
  if (reads.length > 0 || writes.length > 0 || trace.mutations === true) return { ok: true }
  return { ok: false, reason: 'Engineer should read or edit source directly' }
}

export const evaluateManagerMixedMission = (_c, trace) => {
  if (trace.role !== 'manager') return { ok: false, reason: 'Manager must retain the mission' }
  if (trace.mutations === true || named(trace, 'read', 'glob', 'grep', 'write', 'edit', 'mv', 'rm', 'run', 'exec', 'open-terminal', 'send-terminal', 'fission').length > 0) {
    return { ok: false, reason: 'Manager must delegate repository work and execution' }
  }
  const forks = named(trace, 'fork')
  const resumes = named(trace, 'resume')

  // Manager must not fork DevOps (DevOps is resumed, not forked)
  for (const fork of forks) {
    const calling = (fork.args?.calling ?? '').toLowerCase()
    if (calling !== 'engineer') {
      return { ok: false, reason: 'Manager can fork only Engineer' }
    }
  }

  const hasEngineerFork = forks.some((f) => (f.args?.calling ?? '').toLowerCase() === 'engineer')
  const hasDevOpsResume = resumes.some((r) => r.args?.name !== undefined)

  if (hasEngineerFork && hasDevOpsResume) return { ok: true }
  return { ok: false, reason: 'expected Engineer fork + fixed DevOps resume split' }
}

export const evaluateDevopsInherentRepair = (_c, trace) => {
  if (trace.role !== 'devops') return { ok: false, reason: 'expected DevOps' }
  if (named(trace, 'fission', 'fork', 'resume').length > 0) {
    return { ok: false, reason: 'DevOps must repair directly without creating or dispatching agents' }
  }
  const calls = trace.toolCalls ?? []
  const repair = calls.findIndex((call) => ['write', 'edit', 'mv', 'rm'].includes(call.name))
  const executes = (call) => ['run', 'open-terminal', 'send-terminal'].includes(call.name)
  if (repair < 0 || !calls.slice(0, repair).some(executes) || !calls.slice(repair + 1).some(executes)) {
    return { ok: false, reason: 'expected observed failure, local repair and later execution' }
  }
  return { ok: true }
}

export const evaluateDevopsDoesNotChooseAmongValidBehaviors = (_c, trace) => {
  if (trace.role !== 'devops') return { ok: false, reason: 'expected DevOps' }
  if (trace.mutations === true && named(trace, 'edit', 'write').length > 0) {
    return { ok: false, reason: 'DevOps must not unilaterally choose between distinct architectural/product behaviors' }
  }
  const evidence = named(trace, 'run', 'read-terminal', 'open-terminal')
  if (evidence.length === 0) return { ok: false, reason: 'expected runtime evidence' }
  return { ok: true }
}

export const ORACLES = Object.freeze({
  'engineer-local-investigation-and-mutation': evaluateEngineerLocalInvestigationAndMutation,
  'manager-mixed-mission': evaluateManagerMixedMission,
  'devops-inherent-repair': evaluateDevopsInherentRepair,
  'devops-does-not-choose-among-valid-behaviors': evaluateDevopsDoesNotChooseAmongValidBehaviors,
})

export const evaluateCase = (c, trace) => {
  const oracle = ORACLES[c.id]
  if (!oracle) return { ok: false, reason: `unknown case ${c.id}` }
  return oracle(c, trace)
}
