import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  focusedSuiteFiles,
  focusedVerificationSteps,
  verificationSteps,
} from '../../scripts/verify.mjs'
import { walk } from '../../scripts/lib/walk.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const suite = 'time-capability'
const [step] = focusedVerificationSteps({ root, suites: suite, env: {} })
const childOutput = execFileSync(process.execPath, [
  '--input-type=module',
  '-e',
  'console.log(JSON.stringify({ selectedFiles: process.env.TESTS_MJS_FILES ?? null }))',
], { cwd: root, env: step.env, encoding: 'utf8' })
const mixed = focusedSuiteFiles(root, [suite, 'missing-suite-does-not-exist'])
const formal = verificationSteps({ root, env: { TESTS_MJS_FILES: 'foreign-file.mjs' } })
const discovered = walk(path.join(root, 'requirements'), ['.test.mjs'])
  .filter(file => !file.includes('/tests/e2e/') && !file.includes('/tests/integration/'))

console.log(JSON.stringify({
  scope: 'Planning probe only; no requirement tests or build executed.',
  nodeVersion: process.version,
  platform: process.platform,
  architecture: process.arch,
  verificationSourceSha256: createHash('sha256')
    .update(fs.readFileSync(path.join(root, 'scripts/verify.mjs'))).digest('hex'),
  focused: {
    suite,
    plannedFiles: step.focusedFiles,
    plannedFileCount: step.focusedFiles.length,
    childSelection: JSON.parse(childOutput).selectedFiles,
    defaultDiscoveryFileCount: discovered.length,
  },
  mixedUnknownSuite: {
    requestedSuites: mixed.suites,
    acceptedFileCount: mixed.files.length,
  },
  formalSelectionStripped: formal
    .filter(candidate => ['unit', 'integration'].includes(candidate.label))
    .every(candidate => candidate.env.TESTS_MJS_FILES === undefined),
}, null, 2))
