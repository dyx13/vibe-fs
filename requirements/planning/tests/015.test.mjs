import assert from 'node:assert/strict'
import test from 'node:test'
import { isAllowed } from '../../../dist/Participant/Persona/OfficeCapabilitySurface.js'
import * as completedTurn from '../../../dist/Interaction/Repair/CompletedTurnSurface.js'

// WHAT[planning-015] keeps every non-Plan path byte-identical. Two
// observable faces are asserted here: non-Plan roles never receive the
// Plan-only permission projection, and non-Plan empty stops keep requiring
// interaction repair (the full classification suite lives in 009.test.mjs
// under planning-009). Manager's review tool is reached through the
// ReviewAssessment permission and the shared shell of planning-022; the
// Plan-backend Review label itself never appears in a non-Plan projection.
// The Baton isolation trigger is gated by ownerRole = Plan inside the
// transform pipeline (PluginTransforms planSessionOf); its live proof
// belongs to the physical host canary tracked by GAP-230, not to this pure
// surface.

test('WHAT[planning-015] non-Plan roles never receive the Plan-only tool projection', () => {
  const planOnlyPermissions = ['JsPlan', 'Ask', 'Deliver', 'Review']
  const nonPlanRoles = ['manager', 'engineer', 'devops', 'orchestrator', 'blogger']
  // Each role label must resolve to a real role, so the deny below is a
  // genuine projection fact and not an unknown-role fallback.
  const roleWitness = {
    manager: 'Fork',
    engineer: 'Write',
    devops: 'Exec',
    orchestrator: 'Fork',
    blogger: 'Chronicle',
  }
  for (const role of nonPlanRoles) {
    assert.equal(isAllowed(role, roleWitness[role]), true, `${role} must resolve as a real role`)
    for (const perm of planOnlyPermissions) {
      assert.equal(isAllowed(role, perm), false, `${role} must be denied ${perm}`)
    }
  }
})

test('WHAT[planning-015] non-Plan empty stops keep requiring interaction repair', () => {
  // Reference companion to planning-009: the natural-stop exemption is
  // granted to the plan role only; other roles keep their empty-stop repair
  // behavior byte-for-byte.
  assert.equal(completedTurn.needsInteractionRepair('engineer', true, 'stop', []), true)
  assert.equal(completedTurn.needsInteractionRepair('manager', true, 'stop', []), true)
})
