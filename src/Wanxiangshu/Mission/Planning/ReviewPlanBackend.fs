namespace Wanxiangshu.Mission.Planning

open System
open System.Threading.Tasks
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Persistence.EventStore

/// planning-022: the outcome of one review gate on a plan incumbency.
type PlanReviewResult =
    { Outcome: PlanReviewedOutcome
      Gaps: (string * string) list }

[<RequireQualifiedAccess>]
type PlanReviewError =
    | NoActiveIncumbency
    | AlreadyReviewed of incumbencyId: string
    | IncumbencyMismatch of activeId: string * targetId: string
    | RecordFailed of reason: string

module PlanReviewError =
    let render (error: PlanReviewError) : string =
        match error with
        | PlanReviewError.NoActiveIncumbency -> "No active incumbency found for this work"
        | PlanReviewError.AlreadyReviewed incumbencyId ->
            sprintf
                "This incumbency has already submitted its review; each tenure reviews exactly once (%s)"
                incumbencyId
        | PlanReviewError.IncumbencyMismatch(activeId, targetId) ->
            sprintf "Active incumbency ID '%s' does not match review target '%s'" activeId targetId
        | PlanReviewError.RecordFailed reason -> sprintf "Failed to record plan review: %s" reason

module ReviewPlanBackend =

    let reviewTargetFor (stage: string) : string =
        match PlanStage.ofString stage with
        | Some PlanStage.S1 -> "S2"
        | Some PlanStage.S2 -> "S3"
        | Some PlanStage.S3 -> "authorized"
        | None -> raise (ArgumentException(sprintf "Unknown plan stage: %s" stage))

    let private reviewOutcome (gaps: (string * string) list) : PlanReviewedOutcome =
        if List.isEmpty gaps then
            PlanReviewedOutcome.Promoted
        else
            PlanReviewedOutcome.Stayed

    let private resolveActiveWorkState (store: IEventStore) (pid: PlanWorkId) : Result<PlanWorkState, PlanReviewError> =
        match PlanEventStore.activeWorkState store pid with
        | None -> Error PlanReviewError.NoActiveIncumbency
        | Some state -> Ok state

    // planning-022: each incumbency reviews exactly once; the fold keeps the
    // second-different-payload conflict as its own StorageInvalid guard.
    let private requireUnreviewed
        (incumbencyId: string)
        (state: PlanWorkState)
        : Result<PlanWorkState, PlanReviewError> =
        match state.Reviewed with
        | Some(reviewedIncumbency, _) when reviewedIncumbency = incumbencyId ->
            Error(PlanReviewError.AlreadyReviewed incumbencyId)
        | _ -> Ok state

    let private requireActiveMatch
        (incumbencyId: string)
        (state: PlanWorkState)
        : Result<ActivePlanIncumbency, PlanReviewError> =
        match state.Active with
        | None -> Error PlanReviewError.NoActiveIncumbency
        | Some active when active.Id <> incumbencyId ->
            Error(PlanReviewError.IncumbencyMismatch(active.Id, incumbencyId))
        | Some active -> Ok active

    let private recordOutcome
        (outcome: PlanReviewedOutcome)
        (gaps: (string * string) list)
        (appended: Result<EventId, string>)
        : Result<PlanReviewResult, PlanReviewError> =
        match appended with
        | Error reason -> Error(PlanReviewError.RecordFailed reason)
        | Ok _ -> Ok { Outcome = outcome; Gaps = gaps }

    let executeReview
        (store: IEventStore)
        (workId: string)
        (incumbencyId: string)
        (gaps: (string * string) list)
        : Task<Result<PlanReviewResult, PlanReviewError>> =
        task {
            let pid = PlanWorkId.create workId

            let decision =
                resolveActiveWorkState store pid
                |> Result.bind (requireUnreviewed incumbencyId)
                |> Result.bind (requireActiveMatch incumbencyId)

            match decision with
            | Error error -> return Error error
            | Ok active ->
                let outcome = reviewOutcome gaps
                let reviewEvent = PlanEvents.reviewed incumbencyId active.Stage outcome

                let! appended = PlanEventStore.append store pid reviewEvent

                // The stage advance itself is the fold's decision
                // (planning-004); this backend only records the fact.
                return recordOutcome outcome gaps appended
        }
