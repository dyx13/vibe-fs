namespace Wanxiangshu.OpenCode

open Fable.Core.JsInterop
open Wanxiangshu.Context.Prefix
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Participant.Provider.Attempt

/// JS-native owner surface for provider-attempt-recovery-011 / provider-attempt-recovery-020 admitted-plan semantics.
///
/// The scope stays an opaque handle: JS obtains it from `createRecoveryScope`,
/// passes it back, and never inspects it. Pending/bound plans cross as the
/// opaque handles built by `XWireSurface.pendingPlan` /
/// `XWireSurface.bindProviderRun`; observations return as plain JSON views.
/// Every decision — freeze admission, binding, record/peek/consume, ownership —
/// delegates to the real `PluginRecoveryScope` and the `XWireSurface` typed
/// bridges. No plan equality or binding algorithm is copied here.
module PluginRecoveryScopeSurface =

    /// Create the real production scope with the production `None` journal wiring
    /// (crash-zero process-local, no accepted-message recovery port).
    let createRecoveryScope () : obj = box (PluginRecoveryScope(None))

    /// Invoke the real `FreezePendingAttemptPlan`. Returns `{ outcome, view, existing,
    /// attempted, expected, handle }` where `handle` carries the admitted (or
    /// existing) plan. `IdentityMismatch` carries `expected` ({ session, physical })
    /// plus the `attempted` plan view.
    let freezeAttemptPlan (scope: obj) (sessionId: string) (physical: string) (pending: obj) : obj =
        let scope = unbox<PluginRecoveryScope> scope
        let plan = XWireSurface.unwrapPendingPlan pending

        match
            scope.FreezePendingAttemptPlan (SessionId.create sessionId) (PhysicalUserMessageId.create physical) plan
        with
        | PendingAttemptPlanAdmission.Admitted admitted ->
            box
                {| outcome = "Admitted"
                   view = XWireSurface.pendingPlanView admitted
                   existing = null
                   attempted = null
                   expected = null
                   handle = XWireSurface.wrapPendingPlan admitted |}
        | PendingAttemptPlanAdmission.ReplayedExisting existing ->
            box
                {| outcome = "ReplayedExisting"
                   view = XWireSurface.pendingPlanView existing
                   existing = null
                   attempted = null
                   expected = null
                   handle = XWireSurface.wrapPendingPlan existing |}
        | PendingAttemptPlanAdmission.IdentityMismatch(expectedSession, expectedPhysical, attempted) ->
            box
                {| outcome = "IdentityMismatch"
                   view = null
                   existing = null
                   attempted = XWireSurface.pendingPlanView attempted
                   expected =
                    box
                        {| session = SessionId.value expectedSession
                           physical = PhysicalUserMessageId.value expectedPhysical |}
                   handle = null |}
        | PendingAttemptPlanAdmission.PlanConflict(existing, attempted) ->
            box
                {| outcome = "PlanConflict"
                   view = null
                   existing = XWireSurface.pendingPlanView existing
                   attempted = XWireSurface.pendingPlanView attempted
                   expected = null
                   handle = null |}

    /// Invoke the real `RecordPendingAttemptPlan`; conflicts throw host-boundary-008.
    let recordAttemptPlan (scope: obj) (sessionId: string) (physical: string) (pending: obj) : unit =
        let scope = unbox<PluginRecoveryScope> scope
        let plan = XWireSurface.unwrapPendingPlan pending
        scope.RecordPendingAttemptPlan (SessionId.create sessionId) (PhysicalUserMessageId.create physical) plan

    /// Invoke the real `TryBindAttemptPlan`. Wrong physical parent/run yields
    /// `{ bound = false, view = null, handle = null }`.
    let bindAttempt (scope: obj) (sessionId: string) (physical: string) (providerRun: string) : obj =
        let scope = unbox<PluginRecoveryScope> scope

        match
            scope.TryBindAttemptPlan
                (SessionId.create sessionId)
                (PhysicalUserMessageId.create physical)
                (ProviderRunIdentity.create providerRun)
        with
        | Some bound ->
            box
                {| bound = true
                   view = XWireSurface.boundPlanView bound
                   handle = XWireSurface.wrapBoundPlan bound |}
        | None ->
            box
                {| bound = false
                   view = null
                   handle = null |}

    /// Invoke the real `RecordAttemptPlan`; re-binding a run to another physical
    /// parent throws host-boundary-008.
    let recordBound (scope: obj) (sessionId: string) (providerRun: string) (bound: obj) : unit =
        let scope = unbox<PluginRecoveryScope> scope
        let plan = XWireSurface.unwrapBoundPlan bound
        scope.RecordAttemptPlan (SessionId.create sessionId) (ProviderRunIdentity.create providerRun) plan

    /// Read-only peek via the real `TryPeekAttemptPlan`; keeps the plan alive.
    let peekAttempt (scope: obj) (sessionId: string) (providerRun: string) : obj =
        let scope = unbox<PluginRecoveryScope> scope

        match scope.TryPeekAttemptPlan (SessionId.create sessionId) (ProviderRunIdentity.create providerRun) with
        | Some bound ->
            box
                {| found = true
                   view = XWireSurface.boundPlanView bound |}
        | None -> box {| found = false; view = null |}

    /// Single terminal consumption via the real `ConsumeAttemptPlan`.
    let consumeAttempt (scope: obj) (sessionId: string) (providerRun: string) : obj =
        let scope = unbox<PluginRecoveryScope> scope

        match scope.ConsumeAttemptPlan (SessionId.create sessionId) (ProviderRunIdentity.create providerRun) with
        | Some bound ->
            box
                {| consumed = true
                   view = XWireSurface.boundPlanView bound |}
        | None -> box {| consumed = false; view = null |}

    /// Snapshot of the real typed recovery ownership: counts only, plain values.
    /// The production scope exposes only manual interventions; a scope that never
    /// records one reports zero manuals and there is no resume-command API left to
    /// publish a `PreProviderResumeRequest` through.
    let recoveryOwnership (scope: obj) : obj =
        let scope = unbox<PluginRecoveryScope> scope
        let manuals = scope.ManualChatInterventions()
        box {| manuals = manuals.Length |}
