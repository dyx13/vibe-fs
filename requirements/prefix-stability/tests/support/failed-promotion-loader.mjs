export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context)
  if (!url.endsWith('/dist/Interaction/Dispatch/PrefixWorkflow.js')) return loaded
  const source = loaded.source.toString()
  if (source.includes('/* registered-failed-promotion-mutant */')) return loaded
  const entry = 'function PrefixWorkflow_settleAttemptPlan(port, attempts, sessionId, providerRun, outcome, plan) {'
  if (source.split(entry).length !== 2) {
    throw new Error('the production attempt settlement entry must occur exactly once')
  }
  return {
    ...loaded,
    source: source.replace(entry, `${entry}
    /* registered-failed-promotion-mutant */
    if (globalThis.__wanxiangshu_failed_prefix_promotion === true) {
        outcome = AttemptOutcome.Completed;
    }`),
  }
}
