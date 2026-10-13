import assert from 'node:assert/strict'
import test from 'node:test'
import * as planning from '../../../dist/Mission/Planning/Surface.js'

test('WHAT[planning-005] action gate permits the four tools uniformly across stages; stage is not an action gate', () => {
  assert.ok(typeof planning.isActionAllowed === 'function', 'gate.isActionAllowed must be an exported function')

  // The new toolset is { js-plan, ask, review, deliver }; every stage treats them alike.
  for (const stage of ['S1', 'S2', 'S3']) {
    assert.equal(
      planning.isActionAllowed({ stage, action: 'js-plan', hasDelivered: false, hasBlocker: false }),
      true,
      `${stage}: js-plan must be allowed on an active tenure`,
    )
    assert.equal(
      planning.isActionAllowed({ stage, action: 'ask', hasDelivered: false, hasBlocker: false }),
      true,
      `${stage}: ask must be allowed on an active tenure`,
    )
    assert.equal(
      planning.isActionAllowed({ stage, action: 'review', hasDelivered: false, hasBlocker: false }),
      true,
      `${stage}: review must be allowed on an active tenure`,
    )
    assert.equal(
      planning.isActionAllowed({ stage, action: 'deliver', hasDelivered: false, hasBlocker: false }),
      true,
      `${stage}: deliver must be allowed on an active tenure (relay when unauthorized)`,
    )
    // Retired tools must be denied on every stage
    for (const action of ['handoff', 'resume']) {
      assert.equal(
        planning.isActionAllowed({ stage, action, hasDelivered: false, hasBlocker: false }),
        false,
        `${stage}: retired tool ${action} must be denied`,
      )
    }
  }

  // Blocker presence rejects deliver
  for (const stage of ['S1', 'S2', 'S3']) {
    assert.equal(
      planning.isActionAllowed({ stage, action: 'deliver', hasDelivered: false, hasBlocker: true }),
      false,
      `${stage}: deliver must be denied when a blocker exists`,
    )
  }
})

test('WHAT[planning-005] delivered state permits only js-plan read and rejects ask, review, deliver until reopened', () => {
  // After Delivered: only js-plan.read is permitted; mutation tools are rejected
  for (const action of ['deliver', 'ask', 'review', 'js-plan.edit', 'js-plan.rewrite']) {
    assert.equal(
      planning.isActionAllowed({ stage: 'S3', action, hasDelivered: true, hasBlocker: false }),
      false,
      `delivered work must reject action ${action} until reopened`,
    )
  }
  assert.equal(
    planning.isActionAllowed({ stage: 'S3', action: 'js-plan.read', hasDelivered: true, hasBlocker: false }),
    true,
    'delivered work must still permit js-plan.read',
  )
  assert.equal(
    planning.isActionAllowed({ stage: 'S3', action: 'read', hasDelivered: true, hasBlocker: false }),
    true,
    'delivered work must still permit read',
  )
})

test('WHAT[planning-005] decideAction provides typed rejections for disallowed actions', () => {
  // Retired tool -> typed rejection
  const handoff = planning.decideAction('S1', 'handoff', false, false)
  assert.equal(handoff.ok, false)
  assert.equal(handoff.rejection, 'HandoffRetired')

  const resume = planning.decideAction('S2', 'resume', false, false)
  assert.equal(resume.ok, false)
  assert.equal(resume.rejection, 'ResumeRetired')

  // Blocker -> BlockedByLiveResources
  const blockedDeliver = planning.decideAction('S1', 'deliver', false, true)
  assert.equal(blockedDeliver.ok, false)
  assert.equal(blockedDeliver.rejection, 'BlockedByLiveResources')

  // Delivered mutation -> AlreadyDelivered
  const postDeliveredAsk = planning.decideAction('S3', 'ask', true, false)
  assert.equal(postDeliveredAsk.ok, false)
  assert.equal(postDeliveredAsk.rejection, 'AlreadyDelivered')

  // Unreviewed tenure mutation -> ReviewRequired
  for (const action of ['edit', 'rewrite', 'js-plan.edit', 'js-plan.rewrite']) {
    const unreviewedMutation = planning.decideAction('S1', action, false, false, false)
    assert.equal(unreviewedMutation.ok, false, `unreviewed tenure must reject mutation ${action}`)
    assert.equal(unreviewedMutation.rejection, 'ReviewRequired')

    assert.equal(
      planning.isActionAllowed({ stage: 'S1', action, hasDelivered: false, hasBlocker: false, hasReviewed: false }),
      false,
      `isActionAllowed must reject mutation ${action} when hasReviewed is false`,
    )
  }

  // Unreviewed tenure read -> Allowed
  for (const action of ['read', 'js-plan.read', 'js-plan']) {
    const unreviewedRead = planning.decideAction('S1', action, false, false, false)
    assert.equal(unreviewedRead.ok, true, `unreviewed tenure must permit read ${action}`)

    assert.equal(
      planning.isActionAllowed({ stage: 'S1', action, hasDelivered: false, hasBlocker: false, hasReviewed: false }),
      true,
      `isActionAllowed must permit read ${action} when hasReviewed is false`,
    )
  }

  // Reviewed tenure mutation -> Allowed
  for (const action of ['edit', 'rewrite', 'js-plan.edit', 'js-plan.rewrite']) {
    const reviewedMutation = planning.decideAction('S1', action, false, false, true)
    assert.equal(reviewedMutation.ok, true, `reviewed tenure must permit mutation ${action}`)

    assert.equal(
      planning.isActionAllowed({ stage: 'S1', action, hasDelivered: false, hasBlocker: false, hasReviewed: true }),
      true,
      `isActionAllowed must permit mutation ${action} when hasReviewed is true`,
    )
  }
})

test('WHAT[planning-005] allowedPermissions maps to the new ToolPermission set uniformly per stage', () => {
  // Every stage carries the same permission set: Ask, Deliver, JsPlan, Review
  const expected = ['Ask', 'Deliver', 'JsPlan', 'Review']
  for (const stage of ['S1', 'S2', 'S3']) {
    const perms = planning.allowedPermissions(stage, false, false)
    assert.deepEqual(perms, expected, `${stage} permissions must be the new four-tool set`)
  }

  // Delivered: only JsPlan
  const deliveredPerms = planning.allowedPermissions('S3', true, false)
  assert.deepEqual(deliveredPerms, ['JsPlan'])
})
