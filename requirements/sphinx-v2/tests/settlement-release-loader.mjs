import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {syncBuiltinESMExports} from 'node:module'

const commonDir = fs.realpathSync(process.env.SPHINX_COMMON_DIR)
const lock = path.join(commonDir, 'wanxiangshu.lock')
const arm = path.join(commonDir, 'settlement-arm.json')
const receipt = path.join(commonDir, 'settlement-release.json')
const originalRemove = fs.rmSync
const injected = new Error('Sphinx actual owned Release completed before its response failed')
let observed = false
let releaseCalls = 0
fs.rmSync = function (...args) {
  const armed = fs.existsSync(arm)
  const owned = typeof args[0] === 'string' && path.resolve(args[0]) === lock && (armed || observed)
  if (owned) assert.equal(JSON.parse(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8')).pid, process.pid)
  const result = Reflect.apply(originalRemove, this, args)
  if (owned) {
    observed = true
    releaseCalls += 1
    assert.equal(fs.existsSync(lock), false)
    if (armed) Reflect.apply(originalRemove, fs, [arm])
    const directory = path.join(commonDir, 'wanxiangshu', 'events')
    const files = fs.readdirSync(directory).filter(name => name.endsWith('.ndjson'))
    assert.equal(files.length, 1)
    const sourceFile = path.join(directory, files[0])
    fs.writeFileSync(receipt, JSON.stringify({pid: process.pid, sourceFile,
      bytes: fs.readFileSync(sourceFile, 'base64'), cause: injected.message, releaseCalls, lockReleased: true}))
    if (armed) throw injected
  }
  return result
}
syncBuiltinESMExports()
