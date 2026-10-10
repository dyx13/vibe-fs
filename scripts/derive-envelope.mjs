#!/usr/bin/env node
// Manual derivation entry for the loop detector repository envelope
// (degeneration-guard-004). The build never derives this artifact; when the
// tracked corpus changes, run this command explicitly to refresh it.
import { writeLoopDetectorEnvelopeArtifact } from './lib/derive-loop-detector-envelope.mjs'

const result = await writeLoopDetectorEnvelopeArtifact()
console.log(`derived ${result.generatedArtifact.artifact_path}`)
console.log(`corpus tokens: ${result.corpusTokens}`)
console.log(`normal prior: ${result.normalPrior.toFixed(6)}`)
console.log(`minimum: ${result.minimum.toFixed(6)}`)
console.log(`maximum: ${result.maximum.toFixed(6)}`)
