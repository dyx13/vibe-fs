namespace Wanxiangshu.Participant.Provider.Attempt

open Wanxiangshu.Context.Prefix
open Wanxiangshu.Execution.Session.ChatExecution
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Interaction.Attempt
open Wanxiangshu.Interaction.Authority

type AttemptPlan =
    { Profile: AttemptExecutionProfile
      NoProbeReason: NoCandidateReason option }

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
    /// Exact equality for immutable admitted request evidence.
    val areSemanticallyEqual: existing: PendingAttemptPlan -> attempted: PendingAttemptPlan -> bool

    /// Same exact physical request identity, independent of its already-frozen projection choice.
    val sameRequestIdentity: existing: PendingAttemptPlan -> attempted: PendingAttemptPlan -> bool

    /// Same accepted physical authority before a more specific request owner freezes its request kind.
    val samePhysicalAuthority: existing: PendingAttemptPlan -> attempted: PendingAttemptPlan -> bool

    val requestIdentitySummary: plan: PendingAttemptPlan -> string

[<RequireQualifiedAccess>]
module AttemptPlanner =
    val ordinaryRequestKind: origin: PromptAuthority.PromptOrigin -> ProviderRequestKind

    val freezePreInference:
        authority: PromptAuthority.AuthorityExecutionProfile ->
        physicalUserMessageId: PhysicalUserMessageId ->
        origin: PromptAuthority.PromptOrigin ->
        requestKind: ProviderRequestKind ->
        committedPrefixSnapshot: PrefixSnapshot option ->
        allowProbe: bool ->
        selectProbe: (unit -> Result<PrefixProbe, NoCandidateReason>) ->
            PendingAttemptPlan

    val freezeOrdinary:
        accepted: AcceptedChatExecutionEvidence ->
        requestKind: ProviderRequestKind ->
            Result<PendingAttemptPlan, string>

    val bindProviderRun: providerRun: ProviderRunIdentity -> pending: PendingAttemptPlan -> AttemptPlan
    val pendingProbeOf: pending: PendingAttemptPlan -> PrefixProbe option

    val plan:
        authority: PromptAuthority.AuthorityExecutionProfile ->
        physicalUserMessageId: PhysicalUserMessageId ->
        providerRun: ProviderRunIdentity ->
        origin: PromptAuthority.PromptOrigin ->
        requestKind: ProviderRequestKind ->
        allowProbe: bool ->
        selectProbe: (unit -> Result<PrefixProbe, NoCandidateReason>) ->
            AttemptPlan

    val probeOf: plan: AttemptPlan -> PrefixProbe option
    val promotableProbe: plan: AttemptPlan -> outcome: AttemptOutcome -> PrefixProbe option
