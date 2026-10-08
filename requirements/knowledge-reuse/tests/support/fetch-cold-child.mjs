import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as eventStore from '../../../../dist/Persistence/EventStore/Surface.js'
import * as casebook from '../../../../dist/Repository/Knowledge/Casebook/Surface.js'

const [directory, identity] = process.argv.slice(2)
const handle = eventStore.create(directory, 'fetch-independent-cold')
try {
  const current = await casebook.fetchCaseByIdentity(handle, identity)
  const payloads = {}
  for (const [path, entry] of Object.entries(JSON.parse(current.maintenanceFileState))) {
    if (entry.kind === 'Present') payloads[path] = Buffer.from(await eventStore.readPayload(handle, entry.payloadRef)).toString('base64')
  }
  assert.equal(readdirSync(join(directory, 'wanxiang', 'events')).includes('fetch-independent-cold.ndjson'), false)
  assert.equal(existsSync(join(directory, 'wanxiang.lock')), false)
  process.stdout.write(JSON.stringify({ pid: process.pid, payloads,
    current: { ...current, accessOrder: current.accessOrder.toString(), lastAccessOrder: current.lastAccessOrder.toString() } }))
} finally { eventStore.dispose(handle) }
