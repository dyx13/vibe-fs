// Node hands `source` either as a string or as bytes depending on version and
// format. Decode once so the mutation operates on real text, and re-encode on the
// way out only when the loader gave us bytes.
const decodeSource = (source) =>
  typeof source === 'string' ? source : new TextDecoder().decode(source)

const reencodeSource = (template, mutated) =>
  typeof template === 'string' ? mutated : new TextEncoder().encode(mutated)

// The loader hook can run more than once for the same module (loader thread and
// main thread). Apply the mutation exactly once; later passes see the mutated
// text and pass it through.
const mutatedUrls = new Set()

export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context)
  if (!url.endsWith('/dist/Context/Prefix/Wire.js') || mutatedUrls.has(url)) return loaded
  const source = decodeSource(loaded.source)
  const expression = 'ProjectionRenderer_cutoffDigest(sha256Hex, snapshot, cutoff)'
  if (source.split(expression).length !== 2) {
    throw new Error('production Wire digest expression must occur exactly once')
  }
  const replacement = process.env.WANXIANGSHU_PREFIX_DIGEST_MUTATION === 'hash'
    ? 'ProjectionRenderer_cutoffDigest(() => "incorrect-digest", snapshot, cutoff)'
    : 'ProjectionRenderer_cutoffDigest(sha256Hex, snapshot, cutoff - 1)'
  mutatedUrls.add(url)
  return { ...loaded, source: reencodeSource(loaded.source, source.replace(expression, replacement)) }
}
