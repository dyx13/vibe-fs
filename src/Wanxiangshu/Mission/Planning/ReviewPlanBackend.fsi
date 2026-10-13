namespace Wanxiangshu.Mission.Planning

open System.Threading.Tasks
open Wanxiangshu.Persistence.EventStore

/// planning-022: the outcome of one review gate on a plan incumbency.
type PlanReviewResult =
    { Outcome: PlanReviewedOutcome
      Gaps: (string * string) list }

/// planning-022: typed rejections for the plan review gate. The hard
/// once-per-incumbency gate and the fold's own conflict rules stay distinct
/// from plain record failures.
[<RequireQualifiedAccess>]
type PlanReviewError =
    | NoActiveIncumbency
    | AlreadyReviewed of incumbencyId: string
    | IncumbencyMismatch of activeId: string * targetId: string
    | RecordFailed of reason: string

module PlanReviewError =
    val render: error: PlanReviewError -> string

module ReviewPlanBackend =

    /// planning-022: the review target is the next milestone derived from the
    /// current stage. S1 reviews toward S2, S2 toward S3, S3 toward becoming
    /// the final tenure (delivery authorization).
    val reviewTargetFor: stage: string -> string

    /// Execute one review gate. Empty gaps promote the incumbency (or, at S3,
    /// authorize delivery); non-empty gaps keep it in place and return as
    /// repair obligations. Each incumbency reviews exactly once.
    val executeReview:
        store: IEventStore ->
        workId: string ->
        incumbencyId: string ->
        gaps: (string * string) list ->
            Task<Result<PlanReviewResult, PlanReviewError>>
