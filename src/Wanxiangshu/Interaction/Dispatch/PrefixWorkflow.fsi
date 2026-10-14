namespace Wanxiangshu.Interaction.Dispatch

open System.Threading.Tasks
open Wanxiangshu.Composition.Turn
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Context.Prefix
open Wanxiangshu.Participant.Provider.Attempt

[<RequireQualifiedAccess>]
type PrefixPresentationHorizon =
    | Current
    | TentativeCold

type XWireReconciliationDecision =
    { Promoted: bool
      Cleared: bool
      KeptPlan: bool }

module PrefixWorkflow =

    val mayProbe: budget: ProviderFailureBudget.FailureBudget -> bool

    val presentationHorizonForProbe: hasProbe: bool -> PrefixPresentationHorizon

    val reconciliationDecision:
        hasPlan: bool ->
        outcome: AttemptOutcome option ->
        hasPromotableProbe: bool ->
        probeEpochMatches: bool ->
            XWireReconciliationDecision

    val retryTransportRetirement: horizon: PrefixPresentationHorizon -> rawMessages: obj list -> Set<string>

    val replacePrefixByHostIds:
        rawMessages: obj list ->
        coveredHostMessageIds: string list ->
        openingHostMessageId: string option ->
        syntheticMessageId: string ->
        memory: string ->
            obj list

    val suppressHostMessagesByIds: rawMessages: obj list -> hostMessageIds: Set<string> -> obj list

    val applyTransform:
        isReplicaSession: (SessionId -> bool) ->
        presentation: PrefixPresentationPort ->
        port: WireJournalPort option ->
        attempts: AttemptPlanCapability ->
        output: obj ->
            Task<PrefixPresentationHorizon>

    val reconcileAttempt:
        port: WireJournalPort option -> attempts: AttemptPlanCapability -> turn: ReconciledTurn -> Task
