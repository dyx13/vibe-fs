/**
 * Append named verification-system-004 gate facts into the local process EventStore.
 * Shock-cut model: `.git/wanxiangshu/events/<WriterId>.ndjson`; no Git ODB/ref append.
 */

import { join } from 'node:path'

import * as eventStore from '../../../../../dist/Persistence/EventStore/Surface.js'

export const hexId = (n) => n.toString(16).padStart(40, '0')

export function openGateFactStore(workDir) {
  const store = eventStore.create(join(workDir, '.git'), `verification-gate-${process.pid}`)
  let seq = 0
  let lastId = null
  let serial = Promise.resolve()

  const appendNamedFact = (name, n) => {
    const run = serial.then(async () => {
      seq += 1
      const id = hexId(seq)
      const parents = lastId === null ? [] : [lastId]
      const result = await eventStore.append(store, [
        {
          id,
          stream: 'gate/wait-fact',
          type: 'JobRequested',
          parents,
          payload: { type: name, n },
          payloadRefs: [],
        },
      ])
      if (!result.ok) throw new Error(`EventStore.append(${name}) failed: ${JSON.stringify(result.error)}`)
      lastId = id
    })
    serial = run
    return run
  }

  return { appendNamedFact, count: () => seq }
}
