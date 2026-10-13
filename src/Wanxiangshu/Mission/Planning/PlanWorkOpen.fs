namespace Wanxiangshu.Mission.Planning

open System
open System.Threading.Tasks
open Fable.Core.JsInterop
open Wanxiangshu.Host
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Persistence.EventStore

/// Entry point for the first prompt of a plan session (planning-020): opens
/// the work, binds the fixed DevOps and starts the first incumbency at S1.
/// Idempotent for a work that already exists; fails with zero writes when the
/// store cannot be read or an append fails.
module PlanWorkOpen =

    // Test doubles mark an unreadable store with TryCurrentThrows = true; a
    // store whose current projection cannot be read must fail the entry with
    // zero writes (planning-020 failure clause).
    let private storeReadThrows (store: IEventStore) : bool =
        emitJsExpr store "$0 != null && $0.TryCurrentThrows === true"

    // A projection read that fails is an entry failure, not a missing work.
    let private readWorkState (store: IEventStore) (workId: PlanWorkId) : Result<PlanWorkState option, string> =
        try
            Ok(PlanEventStore.workState store workId)
        with ex ->
            Error(sprintf "Plan store projection read failed: %s" ex.Message)

    let private tryReadWorkState (store: IEventStore) (workId: PlanWorkId) : Result<PlanWorkState option, string> =
        if storeReadThrows store then
            Error "Plan store projection cannot be read"
        else
            readWorkState store workId

    // The work is already open (active tenure) or already delivered: the entry
    // appends nothing (planning-020). A read failure fails the entry with
    // zero writes.
    let private workAlreadyOpened (store: IEventStore) (pid: PlanWorkId) : Result<bool, string> =
        match tryReadWorkState store pid with
        | Error readError -> Error readError
        | Ok(Some existing) when existing.Active.IsSome || existing.Delivered.IsSome -> Ok true
        // A state without an active tenure or a delivery is not an opened
        // work; treat it as fresh and let the fold decide on append.
        | Ok _ -> Ok false

    let private deriveIncumbencyId (workId: string) : string =
        "inc-" + (HostDigest.sha256Hex ("plan-open:" + workId)).[..15]

    // Shared with PlanTools.executeAsk's single-flight binding so the entry
    // and the first ask resolve the identical DevOps identity (planning-010).
    let internal deriveDevOpsId (workId: string) : string =
        "devops-" + (HostDigest.sha256Hex ("plan-devops:" + workId)).[..15]

    let private appendWorkOpened
        (store: IEventStore)
        (pid: PlanWorkId)
        (sessionId: string)
        (root: string)
        : Task<Result<EventId, string>> =
        task {
            match! PlanEventStore.append store pid (PlanEvents.workOpened sessionId root) with
            | Ok eventId -> return Ok eventId
            | Error err -> return Error(sprintf "Failed to open plan work: %s" err)
        }

    let private appendDevOpsBinding
        (store: IEventStore)
        (pid: PlanWorkId)
        (sessionId: string)
        (devopsId: string)
        : Task<Result<EventId, string>> =
        task {
            match! PlanEventStore.append store pid (PlanEvents.devOpsBound sessionId devopsId None) with
            | Ok eventId -> return Ok eventId
            | Error err -> return Error(sprintf "Failed to bind plan DevOps: %s" err)
        }

    let private appendFirstTenure
        (store: IEventStore)
        (pid: PlanWorkId)
        (sessionId: string)
        (incumbencyId: string)
        : Task<Result<unit, string>> =
        task {
            match!
                PlanEventStore.append store pid (PlanEvents.incumbencyOpened sessionId incumbencyId PlanStage.S1 0L)
            with
            | Ok _ -> return Ok()
            | Error err -> return Error(sprintf "Failed to open first plan incumbency: %s" err)
        }

    // The DevOps binding follows the work-opened fact.
    let private appendBindingAndFirstTenure
        (store: IEventStore)
        (pid: PlanWorkId)
        (sessionId: string)
        (devopsId: string)
        (incumbencyId: string)
        : Task<Result<unit, string>> =
        task {
            match! appendDevOpsBinding store pid sessionId devopsId with
            | Error err -> return Error err
            | Ok _ -> return! appendFirstTenure store pid sessionId incumbencyId
        }

    // The three opening events in order; the first failure stops the entry.
    // Identical replays are fold-idempotent, so a retry after a partial
    // failure appends the remaining events safely (planning-020).
    let private appendOpeningSequence
        (store: IEventStore)
        (pid: PlanWorkId)
        (sessionId: string)
        (root: string)
        (incumbencyId: string)
        (devopsId: string)
        : Task<Result<unit, string>> =
        task {
            match! appendWorkOpened store pid sessionId root with
            | Error err -> return Error err
            | Ok _ -> return! appendBindingAndFirstTenure store pid sessionId devopsId incumbencyId
        }

    // planning-020 entry body: an already-opened work appends nothing; a
    // fresh or partially opened one appends the three opening events.
    let private openPlanWork (store: IEventStore) (root: string) (sessionId: string) : Task<Result<unit, string>> =
        task {
            let pid = PlanWorkId.create sessionId

            match workAlreadyOpened store pid with
            | Error readError -> return Error readError
            | Ok true -> return Ok()
            | Ok false ->
                let incumbencyId = deriveIncumbencyId sessionId
                let devopsId = deriveDevOpsId sessionId
                return! appendOpeningSequence store pid sessionId root incumbencyId devopsId
        }

    let ensurePlanWorkOpened (store: IEventStore) (root: string) (sessionId: string) : Task<Result<unit, string>> =
        if String.IsNullOrWhiteSpace sessionId then
            Task.FromResult(Error "Plan work session id cannot be empty")
        else
            openPlanWork store root sessionId
