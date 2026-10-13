namespace Wanxiangshu.Participant.Provider.Attempt

open Wanxiangshu.Execution.Session.ChatExecution
open Wanxiangshu.Context.Prefix
open Wanxiangshu.Interaction.Attempt
open Wanxiangshu.Interaction.Authority
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity

/// PROMPT-008 / CTX-006 / CTX-010: everything one provider request needs, decided once.
///
/// This is the single call site of `buildAttemptExecutionProfile`. Before it existed
/// the constructor had none at all — every send path read `ActiveLogicalRun` and
/// assembled its own fields, which is exactly what PROMPT-008 forbids, and the
/// `single-constructor` gate could not see it because a function nobody calls has
/// nothing bypassing it.
///
/// The plan bundles the profile with the prefix decision because the two are one
/// choice: CTX-010 makes the probe part of the immutable profile, so a caller that
/// received them separately could send a request whose profile says
/// `UsePrefixProbe` while its message list carries the committed prefix.
type AttemptPlan =
    {
        Profile: AttemptExecutionProfile
        /// `None` when this attempt built no probe. CTX-011 lists five ordinary reasons for
        /// that, and the caller treats them alike — it is kept so a diagnostic can say
        /// which one happened (HOST-007).
        NoProbeReason: NoCandidateReason option
    }

/// Pre-inference half of an AttemptPlan.
///
/// The purpose plan is frozen before binding the Host-created assistant message;
/// ProviderRunIdentity therefore cannot be an input to this constructor. The
/// remaining decision is nevertheless immutable:
/// authority/physical request identity/request kind/prefix choice are all
/// frozen here, then bound exactly once from the Host-created assistant message
/// present at the transform admission boundary.
type PendingAttemptPlan =
    { Authority: PromptAuthority.AuthorityExecutionProfile
      PhysicalUserMessageId: PhysicalUserMessageId
      Origin: PromptAuthority.PromptOrigin
      RequestKind: ProviderRequestKind
      ProjectionChoice: XProjectionChoice
      CommittedPrefixSnapshot: PrefixSnapshot option
      NoProbeReason: NoCandidateReason option }

/// Result of admitting a pending attempt plan under exact physical identity.
[<RequireQualifiedAccess>]
type PendingAttemptPlanAdmission =
    | Admitted of PendingAttemptPlan
    | ReplayedExisting of PendingAttemptPlan
    | IdentityMismatch of
        expectedSession: SessionId *
        expectedPhysical: PhysicalUserMessageId *
        attempted: PendingAttemptPlan
    | PlanConflict of existing: PendingAttemptPlan * attempted: PendingAttemptPlan

module PendingAttemptPlanAdmission =
    let areSemanticallyEqual (existing: PendingAttemptPlan) (attempted: PendingAttemptPlan) : bool =
        existing = attempted

    let samePhysicalAuthority (existing: PendingAttemptPlan) (attempted: PendingAttemptPlan) : bool =
        existing.Authority.SessionId = attempted.Authority.SessionId
        && existing.Authority.LogicalRunId = attempted.Authority.LogicalRunId
        && existing.Authority.AuthorityRootUserMessageId = attempted.Authority.AuthorityRootUserMessageId
        && existing.Authority.AuthorityKind = attempted.Authority.AuthorityKind
        && existing.Authority.SelectedAgent = attempted.Authority.SelectedAgent
        && existing.Authority.CanonicalRole = attempted.Authority.CanonicalRole
        && existing.PhysicalUserMessageId = attempted.PhysicalUserMessageId
        && existing.Origin = attempted.Origin

    let sameRequestIdentity (existing: PendingAttemptPlan) (attempted: PendingAttemptPlan) : bool =
        samePhysicalAuthority existing attempted
        && existing.RequestKind = attempted.RequestKind

    let requestIdentitySummary (plan: PendingAttemptPlan) : string =
        sprintf
            "session=%s physical=%s logical=%s root=%s authority=%A participant=%s role=%s origin=%A kind=%A"
            (SessionId.value plan.Authority.SessionId)
            (PhysicalUserMessageId.value plan.PhysicalUserMessageId)
            (LogicalRunId.value plan.Authority.LogicalRunId)
            (AuthorityRootUserMessageId.value plan.Authority.AuthorityRootUserMessageId)
            plan.Authority.AuthorityKind
            plan.Authority.SelectedAgent
            (Roles.roleLabel plan.Authority.CanonicalRole)
            plan.Origin
            plan.RequestKind

[<RequireQualifiedAccess>]
module AttemptPlanner =

    let ordinaryRequestKind (origin: PromptAuthority.PromptOrigin) =
        match origin with
        | PromptAuthority.PromptOrigin.Continuation PromptAuthority.ContinuationKind.InteractionRepair ->
            ProviderRequestKind.InteractionRepair
        | _ -> ProviderRequestKind.WorkMain

    let private chooseProjection
        (requestKind: ProviderRequestKind)
        (allowProbe: bool)
        (selectProbe: unit -> Result<PrefixProbe, NoCandidateReason>)
        =
        let probe =
            if allowProbe && ProviderRequestKind.mayCarryProbe requestKind then
                Some(selectProbe ())
            else
                None

        match probe with
        | Some(Ok value) -> XProjectionChoice.UsePrefixProbe value, None
        | Some(Error reason) -> XProjectionChoice.UseCommittedEpoch, Some reason
        | None -> XProjectionChoice.UseCommittedEpoch, None

    /// Freeze every provider-request decision available before inference. The
    /// assistant run is deliberately absent: the Host has not created it yet.
    let freezePreInference
        (authority: PromptAuthority.AuthorityExecutionProfile)
        (physicalUserMessageId: PhysicalUserMessageId)
        (origin: PromptAuthority.PromptOrigin)
        (requestKind: ProviderRequestKind)
        (committedPrefixSnapshot: PrefixSnapshot option)
        (allowProbe: bool)
        (selectProbe: unit -> Result<PrefixProbe, NoCandidateReason>)
        : PendingAttemptPlan =
        let choice, noProbeReason = chooseProjection requestKind allowProbe selectProbe

        { Authority = authority
          PhysicalUserMessageId = physicalUserMessageId
          Origin = origin
          RequestKind = requestKind
          ProjectionChoice = choice
          CommittedPrefixSnapshot = committedPrefixSnapshot
          NoProbeReason = noProbeReason }

    let freezeOrdinary
        (accepted: AcceptedChatExecutionEvidence)
        (requestKind: ProviderRequestKind)
        : Result<PendingAttemptPlan, string> =
        PromptAuthority.createAuthorityExecutionProfileFromSeed
            accepted.SessionId
            accepted.LogicalRunId
            accepted.AuthorityRootUserMessageId
            accepted.AuthorityKind
            accepted.IdentitySeed
        |> Result.map (fun authority ->
            freezePreInference
                authority
                accepted.PhysicalUserMessageId
                accepted.Origin
                requestKind
                None
                false
                (fun () -> Error NoCandidateReason.NoCoverage))

    /// Binds the immutable pre-inference decision to the
    /// exact assistant run for the already-frozen physical request.
    let bindProviderRun (providerRun: ProviderRunIdentity) (pending: PendingAttemptPlan) : AttemptPlan =
        { Profile =
            InteractionAttempt.buildAttemptExecutionProfile
                pending.Authority
                pending.PhysicalUserMessageId
                providerRun
                pending.Origin
                pending.RequestKind
                pending.ProjectionChoice
          NoProbeReason = pending.NoProbeReason }

    let pendingProbeOf (pending: PendingAttemptPlan) =
        match pending.ProjectionChoice with
        | XProjectionChoice.UsePrefixProbe probe -> Some probe
        | XProjectionChoice.UseCommittedEpoch -> None

    /// PROMPT-008: build the profile for one attempt.
    ///
    /// Material is proven by
    /// running `selectProbe`; `Error NoCoverage` is therefore an explicit ordinary
    /// no-probe result rather than an unreachable branch.
    let plan
        (authority: PromptAuthority.AuthorityExecutionProfile)
        (physicalUserMessageId: PhysicalUserMessageId)
        (providerRun: ProviderRunIdentity)
        (origin: PromptAuthority.PromptOrigin)
        (requestKind: ProviderRequestKind)
        (allowProbe: bool)
        (selectProbe: unit -> Result<PrefixProbe, NoCandidateReason>)
        : AttemptPlan =
        freezePreInference authority physicalUserMessageId origin requestKind None allowProbe selectProbe
        |> bindProviderRun providerRun

    /// CTX-010: the probe this attempt carries, if any.
    let probeOf (plan: AttemptPlan) =
        match plan.Profile.ProjectionChoice with
        | XProjectionChoice.UsePrefixProbe probe -> Some probe
        | XProjectionChoice.UseCommittedEpoch -> None

    /// CTX-012: may this attempt's outcome promote a prefix.
    ///
    /// Two conditions. The attempt must carry a probe, and the terminal must be usable
    /// (CTX-004). Everything else CTX-012 lists as non-promotable — a transport
    /// receipt, `PhysicalAccepted`, the provider starting to stream — is not an
    /// `AttemptOutcome` at all, so it cannot reach this function: those are states of
    /// the send, and only a reconciled snapshot produces an outcome.
    let promotableProbe (plan: AttemptPlan) (outcome: AttemptOutcome) =
        match outcome with
        | AttemptOutcome.Completed -> probeOf plan
        | AttemptOutcome.CompletedInvalid
        | AttemptOutcome.Failed
        | AttemptOutcome.Aborted -> None
