import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import * as prompts from '../../../dist/Resources/PromptSurface.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../../..')
const resourcesDir = path.join(rootDir, 'resources/provider')

test('WHAT[planning-014] plan role, stages, and tool resources exist in paired English and Simplified Chinese markdown files', () => {
  // WHAT[planning-014]: the plan surface is { js-plan, ask, review, deliver }.
  const resourceBases = [
    'role/plan',
    'planning/s1',
    'planning/s2',
    'planning/s3',
    'tool/js-plan',
    'tool/ask',
    'tool/review',
    'tool/deliver',
  ]

  for (const base of resourceBases) {
    const enFile = path.join(resourcesDir, base, 'en.md')
    const zhFile = path.join(resourcesDir, base, 'zh-CN.md')

    // Both language files must exist on disk
    assert.ok(fs.existsSync(enFile), `Expected ${base}/en.md to exist`)
    assert.ok(fs.existsSync(zhFile), `Expected ${base}/zh-CN.md to exist`)

    // Both files must have non-empty content
    const enContent = fs.readFileSync(enFile, 'utf8').trim()
    const zhContent = fs.readFileSync(zhFile, 'utf8').trim()

    assert.ok(enContent.length > 0, `${base}/en.md must not be empty`)
    assert.ok(zhContent.length > 0, `${base}/zh-CN.md must not be empty`)
  }

  // Retired plan tools must not keep loadable tool resources
  for (const retired of ['tool/resume', 'tool/handoff']) {
    const enFile = path.join(resourcesDir, retired, 'en.md')
    const zhFile = path.join(resourcesDir, retired, 'zh-CN.md')
    assert.ok(!fs.existsSync(enFile), `${retired}/en.md must not exist: the tool is retired from the plan surface`)
    assert.ok(!fs.existsSync(zhFile), `${retired}/zh-CN.md must not exist: the tool is retired from the plan surface`)
  }
})

test('WHAT[planning-014] the prompt catalog carries a localized PlanSystemPrompt for real system transform wiring', () => {
  // WHAT[planning-014]: ProviderSystemTransform must really assemble the plan
  // prompt; the catalog is the assembly source, so it must expose the plan
  // system prompt in both languages.
  for (const language of ['en', 'zh-CN']) {
    const catalog = prompts.loadForLanguage(language)
    assert.ok(catalog != null, `loadForLanguage(${language}) must return a catalog`)
    const planPrompt = catalog.PlanSystemPrompt
    assert.ok(
      typeof planPrompt === 'string' && planPrompt.trim().length > 0,
      `the ${language} prompt catalog must carry a non-empty PlanSystemPrompt`,
    )
  }
})
