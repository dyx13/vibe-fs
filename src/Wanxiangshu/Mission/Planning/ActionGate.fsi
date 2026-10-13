namespace Wanxiangshu.Mission.Planning

open Wanxiangshu.Foundation

/// planning-005: typed rejections of the plan action gate.
[<RequireQualifiedAccess>]
type ActionGateRejection =
    | AlreadyDelivered
    | HandoffRetired
    | ResumeRetired
    | BlockedByLiveResources of blocker: string option
    | ReviewRequired
    | ActionDenied of action: string * reason: string

module ActionGateRejection =
    val render: ActionGateRejection -> string

module ActionGate =
    /// planning-005: stage is not a gate. The permission set depends on the
    /// work state (delivered) and the deliver blocker only.
    val allowedPermissions: stage: PlanStage -> hasDelivered: bool -> hasBlocker: bool -> ToolPermission Set

    /// planning-005: decision for one planning action taking the tenure's review status into account.
    val decideActionWithReview:
        stage: PlanStage ->
        action: string ->
        hasDelivered: bool ->
        hasBlocker: bool ->
        hasReviewed: bool ->
            Result<unit, ActionGateRejection>

    /// planning-005: single decision for one planning action. The four tools
    /// pass uniformly on an active tenure; delivered keeps only js-plan.read;
    /// handoff/resume are retired and always rejected.
    val decideAction:
        stage: PlanStage ->
        action: string ->
        hasDelivered: bool ->
        hasBlocker: bool ->
            Result<unit, ActionGateRejection>

    val isActionAllowed: request: obj -> bool
