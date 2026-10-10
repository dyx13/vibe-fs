import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as identity from '../../../../dist/Participant/Persona/Surface.js'
import * as journal from '../../../../dist/Persistence/Journal/Surface.js'
import * as dispatch from '../../../../dist/Interaction/Dispatch/DispatchSurface.js'
import * as authority from '../../../../dist/Interaction/Authority/RuntimeSurface.js'
import * as executionStatus from '../../../../dist/Execution/Session/ChatExecution/StatusSurface.js'

const acceptanceResources = new WeakMap()

export const ownAcceptanceRegistration = (handle, registration) => {
  const resources = acceptanceResources.get(handle)
  assert.ok(resources, 'the real journal fixture owns its acceptance registrations')
  resources.add(registration)
}

const closeAcceptanceResources = handle => {
  const resources = acceptanceResources.get(handle)
  for (const registration of resources ?? []) dispatch.disposePhysicalAcceptanceObserver(registration)
  acceptanceResources.delete(handle)
}

const rootSelection = () => {
  const resolved = identity.resolveParticipantIdentityAtRoot('manager')
  assert.equal(resolved.ok, true, resolved.error)
  const value = resolved.identity
  return {
    kind: 'RootSelection', ownerSession: null, ownerLogicalRun: null, ownerAuthorityRoot: null,
    participantIdentity: {
      participant: value.name, role: value.role, persona: value.persona,
      personaCatalogVersion: value.catalogVersion, origin: value.origin,
    },
  }
}

export const withJournal = async (label, action) => {
  const directory = mkdtempSync(join(tmpdir(), `wxs-dispatch-${label}-`))
  let handle
  let incarnation = 0
  const open = async () => {
    incarnation += 1
    const result = await journal.JournalSurface_bootWithWriterId(directory, `writer-${label}-${incarnation}`, `runtime-${label}-${incarnation}`, 4242, '2026-09-26T00:00:00Z')
    assert.equal(result.ok, true, JSON.stringify(result.error))
    handle = result.journal
    acceptanceResources.set(handle, new Set())
    return handle
  }
  const reopen = async () => {
    closeAcceptanceResources(handle)
    journal.JournalSurface_dispose(handle)
    handle = null
    return open()
  }
  try { return await action(await open(), reopen, directory) }
  finally {
    if (handle) {
      closeAcceptanceResources(handle)
      journal.JournalSurface_dispose(handle)
    }
    rmSync(directory, { recursive: true, force: true })
  }
}

export const acceptOwner = async (handle, session = 'authority-owner') => {
  const result = await dispatch.acceptHumanRootSelection(handle, session, `root-${session}`, rootSelection())
  assert.equal(result.ok, true, JSON.stringify(result.error))
  return result.profile
}

export const hostPort = (send) => ({ SubscribeTerminal: () => ({ Dispose() {} }), SendPrompt: send })

export const journalBytes = directory => {
  const events = join(directory, 'wanxiangshu', 'events')
  const names = readdirSync(events).filter(name => name.endsWith('.ndjson')).sort()
  assert.ok(names.length > 0, 'the real journal must contain event files')
  return names.map(name => {
    const bytes = readFileSync(join(events, name))
    assert.ok(bytes.length > 0, 'the actual claim journal must not be empty')
    return { name, bytes }
  })
}

export const prepareAcceptanceObserver = async (handle, path, label) => {
  const session = `d0-${path}-${label}`
  const owner = await acceptOwner(handle, `owner-${session}`)
  const issued = authority.issueInheritedIdentitySeed('engineer', owner)
  assert.equal(issued.ok, true, issued.error)
  if (path === 'root') return { session, seed: issued.value, profile: null }
  const root = await dispatch.sendAgentOwnerRoot(
    hostPort(async () => dispatch.admittedWithReceipt(`bootstrap-${session}`)),
    handle, session, 'bootstrap this exact child', issued.value,
  )
  assert.equal(root.ok, true, root.error)
  const accepted = await dispatch.acceptManagedPromptClaim(
    handle, session, `bootstrap-physical-${session}`, root.key, 'engineer',
  )
  assert.equal(accepted.ok, true, accepted.error)
  const profile = dispatch.projectionObservation(handle, session).activeLogicalRun
  assert.equal(profile.session, session)
  assert.equal(dispatch.pendingClaimCount(handle, session), 0)
  return { session, seed: issued.value, profile }
}

export const sendWithAcceptanceObserver = (path, port, handle, context, onAccepted) => path === 'root'
  ? dispatch.sendAgentOwnerRootWithAcceptance(
      port, handle, context.session, 'observe the real detached acceptance',
      context.seed, 'Detached', onAccepted,
      registration => ownAcceptanceRegistration(handle, registration),
    )
  : dispatch.sendContinuationWithAcceptance(
      port, handle, context.session, 'observe the real detached successor',
      'DegenerationGuard', context.profile, 'Detached', onAccepted,
      registration => ownAcceptanceRegistration(handle, registration),
    )

export const acceptObservedPhysical = (handle, context, key, physical) => dispatch.acceptManagedPromptClaim(
  handle, context.session, physical, key, 'engineer',
)

export const acceptanceObservation = (handle, context, physical) => ({
  physical,
  pending: dispatch.pendingClaimCount(handle, context.session),
  accepted: executionStatus.query(handle, context.session, physical).accepted,
})
