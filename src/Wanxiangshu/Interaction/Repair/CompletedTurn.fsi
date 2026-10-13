namespace Wanxiangshu.Interaction.Repair

open Wanxiangshu.Composition.Turn
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.OpenCode

module CompletedTurnClassifier =
    [<RequireQualifiedAccess>]
    type RepairDefectDecision =
        | RequestRepair
        | AwaitRepairTerminal
        | NoRepair

    /// capability-enforcement-021: how one idle Blogger turn reaches the
    /// protocol repair owner.
    [<RequireQualifiedAccess>]
    type BloggerIdleRoute =
        | Observe
        | Repair
        | RepairThenObserve

    val partsText: parts: MessagePart array -> string
    val partsSessionText: parts: MessagePart array -> string
    val hasToolCallPart: parts: MessagePart array -> bool
    val isAbortErrorName: name: string option -> bool

    val formalContentUnusable: parts: MessagePart array -> bool

    val classifyOutcome:
        completed: bool -> finish: string option -> errorName: string option -> parts: MessagePart array -> obj

    /// planning-009: Plan's empty stop (finish=stop, unusable formal text) is a
    /// natural stop, never a repair occasion.
    val isPlanEmptyStop: role: Role option -> finish: string option -> classified: obj -> bool

    val needsInteractionRepair: role: Role option -> classified: obj -> parts: MessagePart array -> bool

    val retryContinuationSuppressesRepair:
        isRetryContinuation: bool ->
        observation: ReconcileProgram.SnapshotObservation option ->
        outcome: ReconcileProgram.TurnOutcome ->
        hasDurableTerminal: bool ->
            bool

    val decideRepairDefect:
        currentAttemptIsRepair: bool ->
        observation: ReconcileProgram.SnapshotObservation option ->
        outcome: ReconcileProgram.TurnOutcome ->
            RepairDefectDecision

    /// A Blogger turn that no Host tool loop follows leaves its live request
    /// with idle as the only wake; an aborted turn is such a turn too.
    val bloggerIdleRoute:
        bloggerQuiescent: bool ->
        guardOwnsAbort: bool ->
        outcome: ReconcileProgram.TurnOutcome ->
        parts: MessagePart array ->
            BloggerIdleRoute

    val roleOfAgent: agent: string option -> fallback: Role option -> Role option

    val buildTurn:
        sessionId: SessionId ->
        physicalUserMessageId: PhysicalUserMessageId ->
        authorityRoot: AuthorityRootUserMessageId ->
        assistant: SessionMessage ->
        roleFallback: Role option ->
        directory: string option ->
            ReconciledTurn
