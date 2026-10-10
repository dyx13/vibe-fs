import assert from 'node:assert/strict'

// Node hands `source` either as a string or as bytes depending on version and
// format. Decode once so the mutation operates on real text, and re-encode on the
// way out only when the loader gave us bytes.
const decodeSource = (source) =>
  typeof source === 'string' ? source : new TextDecoder().decode(source)

const reencodeSource = (template, mutated) =>
  typeof template === 'string' ? mutated : new TextEncoder().encode(mutated)

// The loader hook can run more than once for the same module (loader thread and
// main thread). Each mutation must be applied to the production bytes exactly
// once; later passes observe the already-mutated text and pass it through.
const mutatedUrls = new Set()

export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context)
  const mutation = process.env.WANXIANGSHU_GROUNDING_COMPOSITION_MUTATION
  if (mutation === undefined || mutatedUrls.has(url)) return loaded
  if (url.endsWith('/dist/OpenCode/Host/PairProgrammingThoughtTransform.js') && mutation === 'reversed-delivery') {
    const source = decodeSource(loaded.source)
    const placement = '= projectCapturedGuidance(captures, markerTexts, message)'
    assert.equal(source.split(placement).length - 1, 1, 'mutation identifies the production canonical guidance placement')
    mutatedUrls.add(url)
    return { ...loaded, source: reencodeSource(loaded.source, source.replace(placement, '= undefined')) }
  }
  if (!url.endsWith('/dist/OpenCode/Plugin/PluginTransforms.js')) return loaded
  const guidance = 'caps.InjectPairGuideline(projectionSessionIdOpt, sessionStartedAt, outObj)'
  const grounding = 'caps.ProjectRequirementGrounding(projectionSessionIdOpt, outObj)'
  const source = decodeSource(loaded.source)
  assert.equal(source.split(guidance).length - 1, 1, 'mutation identifies the actual production guidance call')
  assert.equal(source.split(grounding).length - 1, 1, 'mutation identifies the actual production grounding call')
  mutatedUrls.add(url)
  switch (mutation) {
    case 'missing-guidance':
      return { ...loaded, source: reencodeSource(loaded.source, source.replace(guidance, 'Promise.resolve()')) }
    case 'missing-grounding':
      return { ...loaded, source: reencodeSource(loaded.source, source.replace(grounding, 'Promise.resolve()')) }
    case 'reversed-calls':
    case 'reversed-delivery':
      return {
        ...loaded,
        source: reencodeSource(
          loaded.source,
          source.replace(guidance, '__GROUNDING_FIRST__').replace(grounding, guidance).replace('__GROUNDING_FIRST__', grounding),
        ),
      }
    default:
      throw new Error('unknown grounding composition mutation')
  }
}
