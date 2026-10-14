export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context)
  if (url.endsWith('/dist/Interaction/Dispatch/PrefixWorkflow.js') && process.env.WXS_PREFIX_EARLY_CONSUME === '1') {
    const source = loaded.source.toString()
    if (source.includes('/* prefix-early-consume-mutant */')) return loaded
    const entry = 'function PrefixWorkflow_settleAttemptPlan(port, attempts, sessionId, providerRun, outcome, plan) {'
    if (source.split(entry).length !== 2) throw new Error('the real settlement entry must occur exactly once')
    return { ...loaded, source: source.replace(entry, `${entry}\n    /* prefix-early-consume-mutant */\n    if (globalThis.__wanxiangshu_prefix_early_consume) attempts.ConsumeAttemptPlan(sessionId, providerRun);`) }
  }
  if (!url.endsWith('/dist/OpenCode/Host/PluginRecoveryScope.js')) return loaded
  const source = loaded.source.toString()
  if (source.includes('/* prefix-plan-observation */')) return loaded
  const freeze = 'export function PluginRecoveryScope__FreezePendingAttemptPlan(_, sessionId, physicalUserMessageId, plan) {'
  const consume = 'export function PluginRecoveryScope__ConsumeAttemptPlan(this$, sessionId, providerRun) {'
  for (const entry of [freeze, consume]) {
    if (source.split(entry).length !== 2) throw new Error('the real plan observation entry must occur exactly once')
  }
  return {
    ...loaded,
    source: source
      .replace(freeze, `${freeze}\n    /* prefix-plan-observation */\n    globalThis.__wanxiangshu_prefix_plan_observe?.('freeze', _, SessionIdModule_value(sessionId), PhysicalUserMessageIdModule_value(physicalUserMessageId));`)
      .replace(consume, `${consume}\n    globalThis.__wanxiangshu_prefix_plan_observe?.('consume', this$, SessionIdModule_value(sessionId), ProviderRunIdentityModule_value(providerRun));`),
  }
}
