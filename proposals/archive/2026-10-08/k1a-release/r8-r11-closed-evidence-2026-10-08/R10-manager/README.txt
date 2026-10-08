Scope: requirements/relay-incumbency/tests/006.test.mjs, not verification-system/tests/006.test.mjs.

Apply manager-loop-red.patch first. It extends the registered existing
ManagerWorkflowSurface only with a direct forwarding wrapper to production
ManagerWorkflow.maybeDeliverLoop. The production continuation rule remains old.
Run the official fresh Fable build and formal 006; retain the complete red log.
The intended failures are invalid-accepted and invalid-accepted-active: zero
physical sends instead of one. This prediction is not a test receipt.

Then apply manager-loop-green.patch. It changes only requiresContinuation to
accept Continue or the exact invalidated Accepted certificate. It does not
introduce state, reopen an Accepted certificate that is still valid, revive a
retired incumbent, replace the Root, interrupt a provider, or add a new dispatcher.
Change/Host.continueLoop already uses this same domain rule.

Eight production paths are covered, in addition to the two original pure tests:
- Continue without an active successor: production creates the deterministic opening.
- Continue with an already opened successor: production sends without another opening.
- Valid Accepted: no opening or send.
- Matching invalidated Accepted without an active successor: ordinary opening and send.
- Matching invalidated Accepted with an already opened successor: send on that successor.
- Missing current certificate: Accepted A -> invalidate A -> successor -> REVISE.
- Different valid current certificate: Accepted A -> invalidate A -> successor -> PERFECT B.
- Different invalid current certificate: same sequence, then invalidate B.

All fixture transitions are canonical durable Relay facts cold-replayed by the
real Journal fold. No private Road representation is injected. The original
Manager AgentOwnerRoot is established through real Dispatcher root claim and
physical acceptance; its profile is compared after send and cold replay. The
Host callback checks the durable ManagerGuard claim already contains that exact
logical run and Root before returning a real physical-message outcome. Reentry
and cold replay must leave the physical send count at one. The existing terminal
event subscription remains live, and abort/interrupt entry points are forbidden.
This is controlled production-owner coverage, not installation/OS restart or a
complete Host/change-Join subscription proof; the actual Long Stroke E2E remains
required with its original five-iteration, outcome, event and budget assertions.

Static draft checks only: node --check for the formal test and support helper,
plus git apply --check for both patches, exit 0. No test or build was run by this
subagent. Parent owns official red/green, related suites, E2E and final receipts.

Actual failed run: handle-work-estimate-e2e.log, gen332, 71.344s outer, physical
leaf 69556.801125ms, 13 pass / 1 fail / 0 skip. Failure is AssessmentCommitted
gte 3 got 2. The fixture driver retains its original 60s fact barrier.

Finite evidence copied from owned scratch oc-e2e-t2sMbg:
- actual-main-road-evidence.ndjson: exact canonical rows from main session seq >=266.
- actual-main-host-evidence.json: the second ManagerGuard and its final review,
  suicide and aborted provider messages/parts, read with SQLite mode=ro.
- actual-change-evidence.ndjson: CandidateReady seq285 and ConflictDetected seq287.
- actual-evidence-summary.json: all main Relay transition names, physical user
  message identities and SHA256 of the two finite evidence files.

The journal proves Accepted retirement seq282, matching certificate invalidation
and successor opening seq283, then InitialRebaseRequired invalidation seq286 and
ConflictDetected seq287. No third ManagerGuard claim/physical user request exists.
Workflow.requiresContinuation rejects every Accepted outcome before dispatch,
so the actual E2E fails on a missing production request, not a provider matcher.

Only the exact oc-e2e-t2sMbg scratch root is attributable to this failed run.
Do not remove project dependencies reached through symlinks, unknown PIDs,
mounts, or other user scratch roots. This subagent deleted no resource.
