namespace Wanxiangshu.Mission.Planning

open System
open System.Threading.Tasks
open Wanxiangshu.Context.Trace
open Wanxiangshu.Host
open Wanxiangshu.Persistence.EventStore

type DeliverResult =
    { Ok: bool
      Relayed: bool
      Delivered: bool
      RetiredIncumbencyId: string
      RetirementOutcome: string
      Digest: string
      Path: string
      ExecSessionId: string
      NextIncumbencyId: string
      Message: string }

/// planning-010: the outcome of one synchronous ask delegation.
type AskResult =
    { Kind: string
      WorkRecord: string
      Status: string }

module PlanTools =

    let private requireOpt (err: string) =
        function
        | Some v -> Ok v
        | None -> Error err

    let private validateActiveIncumbency
        (activeOpt: ActivePlanIncumbency option)
        (expectedId: string)
        : Result<ActivePlanIncumbency, string> =
        match activeOpt with
        | None -> Error "No active incumbency found for this work"
        | Some active when active.Id <> expectedId ->
            Error(sprintf "Active incumbency ID '%s' does not match invocation target '%s'" active.Id expectedId)
        | Some active -> Ok active

    // planning-005: the work-state gate for deliver. A live blocker rejects
    // retirement before any other check.
    let private checkDeliverEligibility
        (active: ActivePlanIncumbency)
        (isDelivered: bool)
        (hasBlocker: bool)
        : Result<unit, string> =
        ActionGate.decideAction active.Stage "deliver" isDelivered hasBlocker
        |> Result.mapError ActionGateRejection.render

    // The deliver decision resolved before any effect: which tenure acts, and
    // which of the two paths it takes.
    type private DeliverDecision =
        | AuthorizedDelivery of active: ActivePlanIncumbency
        | RelayToSuccessor of active: ActivePlanIncumbency

    let private decisionOfAuthorization (active: ActivePlanIncumbency) : DeliverDecision =
        if active.Authorized then
            AuthorizedDelivery active
        else
            RelayToSuccessor active

    let private resolveDeliverDecision
        (state: PlanWorkState)
        (incumbencyId: string)
        (hasBlocker: bool)
        : Result<DeliverDecision, string> =
        if hasBlocker then
            Error "Deliver is blocked by live resources; the tenure cannot retire yet"
        else
            validateActiveIncumbency state.Active incumbencyId
            |> Result.bind (fun active ->
                checkDeliverEligibility active state.Delivered.IsSome hasBlocker
                |> Result.map (fun () -> decisionOfAuthorization active))

    let private appendOpenOnly
        (store: IEventStore)
        (pid: PlanWorkId)
        (openEvent: PlanEvent)
        : Task<Result<unit, string>> =
        task {
            match! PlanEventStore.append store pid openEvent with
            | Error err -> return Error(sprintf "Failed to open next incumbency: %s" err)
            | Ok _ -> return Ok()
        }

    let private appendRetireAndOpen
        (store: IEventStore)
        (pid: PlanWorkId)
        (retEvent: PlanEvent)
        (openEvent: PlanEvent)
        : Task<Result<unit, string>> =
        task {
            match! PlanEventStore.append store pid retEvent with
            | Error err -> return Error(sprintf "Failed to retire incumbency: %s" err)
            | Ok _ -> return! appendOpenOnly store pid openEvent
        }

    let private appendDeliverOnly
        (store: IEventStore)
        (pid: PlanWorkId)
        (delEvent: PlanEvent)
        : Task<Result<unit, string>> =
        task {
            match! PlanEventStore.append store pid delEvent with
            | Error err -> return Error(sprintf "Failed to record plan delivery: %s" err)
            | Ok _ -> return Ok()
        }

    let private appendRetireAndDeliver
        (store: IEventStore)
        (pid: PlanWorkId)
        (retEvent: PlanEvent)
        (delEvent: PlanEvent)
        : Task<Result<unit, string>> =
        task {
            match! PlanEventStore.append store pid retEvent with
            | Error err -> return Error(sprintf "Failed to retire incumbency during delivery: %s" err)
            | Ok _ -> return! appendDeliverOnly store pid delEvent
        }

    let private resolvePathAndDigest
        (content: string)
        (root: string)
        (workId: string)
        : Result<string * string, string> =
        match PlanPath.resolvePlanPath root workId with
        | Error err -> Error(sprintf "Cannot resolve plan path: %s" err)
        | Ok planPath ->
            let digest = HostDigest.sha256Hex content
            Ok(digest, planPath)

    let private readAndValidatePlan (root: string) (workId: string) : Result<string * string * string, string> =
        match PlanPath.readPlan root workId with
        | Error err -> Error(sprintf "Cannot deliver: plan artifact is empty or missing (%s)" err)
        | Ok content when String.IsNullOrWhiteSpace content -> Error "Cannot deliver: plan artifact is empty"
        | Ok content ->
            resolvePathAndDigest content root workId
            |> Result.map (fun (digest, planPath) -> (content, digest, planPath))

    let private spawnExecutionSessionFor
        (spawn: string -> string -> Task<string>)
        (planContent: string)
        : Task<Result<string, string>> =
        task {
            try
                let! execSessionId = spawn "manager" planContent
                return Ok execSessionId
            with ex ->
                return Error(sprintf "Execution session spawn failed: %s" ex.Message)
        }

    let private commitAuthorizedDelivery
        (store: IEventStore)
        (pid: PlanWorkId)
        (workId: string)
        (incumbencyId: string)
        (active: ActivePlanIncumbency)
        (retirementCursor: int64)
        (digest: string)
        (planPath: string)
        (execSessionId: string)
        : Task<Result<DeliverResult, string>> =
        task {
            let retCurSeq = retirementCursor

            let retEvent =
                PlanEvents.incumbencyRetired incumbencyId PlanRetirementOutcome.Delivered retCurSeq

            let delEvent =
                PlanEvents.delivered incumbencyId workId digest planPath execSessionId

            match! appendRetireAndDeliver store pid retEvent delEvent with
            | Error err -> return Error err
            | Ok() ->
                return
                    Ok
                        { Ok = true
                          Relayed = false
                          Delivered = true
                          RetiredIncumbencyId = incumbencyId
                          RetirementOutcome = PlanRetirementOutcome.render PlanRetirementOutcome.Delivered
                          Digest = digest
                          Path = planPath
                          ExecSessionId = execSessionId
                          NextIncumbencyId = ""
                          Message = "Plan delivered successfully" }
        }

    // The execution session must start before any durable fact is written: a
    // failed spawn leaves the tenure active with zero writes (planning-008).
    let private spawnAndCommitDelivery
        (store: IEventStore)
        (pid: PlanWorkId)
        (workId: string)
        (incumbencyId: string)
        (active: ActivePlanIncumbency)
        (spawn: string -> string -> Task<string>)
        (retirementCursor: int64)
        (content: string, digest: string, planPath: string)
        : Task<Result<DeliverResult, string>> =
        task {
            match! spawnExecutionSessionFor spawn content with
            | Error err -> return Error err
            | Ok execSessionId ->
                return!
                    commitAuthorizedDelivery
                        store
                        pid
                        workId
                        incumbencyId
                        active
                        retirementCursor
                        digest
                        planPath
                        execSessionId
        }

    let private performAuthorizedDelivery
        (store: IEventStore)
        (pid: PlanWorkId)
        (root: string)
        (workId: string)
        (incumbencyId: string)
        (active: ActivePlanIncumbency)
        (spawn: string -> string -> Task<string>)
        (retirementCursor: int64)
        : Task<Result<DeliverResult, string>> =
        task {
            match readAndValidatePlan root workId with
            | Error err -> return Error err
            | Ok(content, digest, planPath) ->
                return!
                    spawnAndCommitDelivery
                        store
                        pid
                        workId
                        incumbencyId
                        active
                        spawn
                        retirementCursor
                        (content, digest, planPath)
        }

    // The two events of one relay: retire Relayed and open the successor at
    // the same stage (planning-007).
    type private RelayTransition =
        { Retire: PlanEvent
          Open: PlanEvent
          NextIncumbencyId: string
          Stage: PlanStage }

    let private buildRelayTransition
        (workId: string)
        (incumbencyId: string)
        (active: ActivePlanIncumbency)
        (retirementCursor: int64)
        : RelayTransition =
        let retCurSeq = retirementCursor
        let nextOpenCurSeq = retCurSeq

        let nextIncumbencyId =
            "inc-"
            + (HostDigest.sha256Hex (
                sprintf "plan-relay:%s:%s:%d" incumbencyId (PlanStage.render active.Stage) nextOpenCurSeq
            )).[0..15]

        { Retire = PlanEvents.incumbencyRetired incumbencyId PlanRetirementOutcome.Relayed retCurSeq
          Open = PlanEvents.incumbencyOpened workId nextIncumbencyId active.Stage nextOpenCurSeq
          NextIncumbencyId = nextIncumbencyId
          Stage = active.Stage }

    let private performRelay
        (store: IEventStore)
        (pid: PlanWorkId)
        (workId: string)
        (incumbencyId: string)
        (active: ActivePlanIncumbency)
        (retirementCursor: int64)
        : Task<Result<DeliverResult, string>> =
        task {
            let relay = buildRelayTransition workId incumbencyId active retirementCursor

            match! appendRetireAndOpen store pid relay.Retire relay.Open with
            | Error err -> return Error err
            | Ok() ->
                return
                    Ok
                        { Ok = true
                          Relayed = true
                          Delivered = false
                          RetiredIncumbencyId = incumbencyId
                          RetirementOutcome = PlanRetirementOutcome.render PlanRetirementOutcome.Relayed
                          Digest = ""
                          Path = ""
                          ExecSessionId = ""
                          NextIncumbencyId = relay.NextIncumbencyId
                          Message = sprintf "Relayed to the next incumbency at stage %s" (PlanStage.render relay.Stage) }
        }

    let private runDeliverDecision
        (store: IEventStore)
        (pid: PlanWorkId)
        (root: string)
        (workId: string)
        (decision: DeliverDecision)
        (spawn: string -> string -> Task<string>)
        (retirementCursor: int64)
        : Task<Result<DeliverResult, string>> =
        match decision with
        | AuthorizedDelivery active ->
            performAuthorizedDelivery store pid root workId active.Id active spawn retirementCursor
        | RelayToSuccessor active -> performRelay store pid workId active.Id active retirementCursor

    let private activeOfDecision =
        function
        | AuthorizedDelivery active -> active
        | RelayToSuccessor active -> active

    // The retirement frontier cannot precede the tenure's own opening: the
    // boundary check is resolved before any event append or spawn.
    let private runCheckedDeliver
        (store: IEventStore)
        (pid: PlanWorkId)
        (root: string)
        (workId: string)
        (decision: DeliverDecision)
        (spawn: string -> string -> Task<string>)
        (retirementCursor: int64)
        : Task<Result<DeliverResult, string>> =
        if XTraceCursor.sequence (activeOfDecision decision).OpeningCursor > retirementCursor then
            Task.FromResult(Error "Retirement cursor cannot precede incumbency opening cursor")
        else
            runDeliverDecision store pid root workId decision spawn retirementCursor

    let executeDeliver
        (store: IEventStore)
        (root: string)
        (workId: string)
        (incumbencyId: string)
        (hasBlocker: bool)
        (spawn: string -> string -> Task<string>)
        (retirementCursor: int64)
        : Task<Result<DeliverResult, string>> =
        task {
            let pid = PlanWorkId.create workId

            let state =
                PlanEventStore.workState store pid
                |> Option.defaultValue PlanFold.initialWorkState

            match resolveDeliverDecision state incumbencyId hasBlocker with
            | Error err -> return Error err
            | Ok decision -> return! runCheckedDeliver store pid root workId decision spawn retirementCursor
        }

    // planning-010: at most one pending ask delegation per work. The tracker
    // is process-local memory — crash recovery has no hanging ask state
    // (planning-012), so this never becomes a durable state machine.
    // DSL-MUTABLE: resource — in-flight ask delegation gate
    let private pendingAskGate = obj ()
    // DSL-MUTABLE: resource — works with one pending ask delegation
    let private pendingAskWorks = System.Collections.Generic.HashSet<string>()

    let private tryBeginPendingAsk (workId: string) : bool =
        lock pendingAskGate (fun () -> pendingAskWorks.Add workId)

    let private clearPendingAsk (workId: string) : unit =
        lock pendingAskGate (fun () -> pendingAskWorks.Remove workId |> ignore)

    let private validateAskRequest (state: PlanWorkState) (intent: string) : Result<unit, string> =
        match state.Delivered, state.Active, String.IsNullOrWhiteSpace intent with
        | Some _, _, _ -> Error "The planning artifact has already been delivered. No further questions are permitted."
        | None, _, true -> Error "Intent cannot be empty"
        | None, None, _ -> Error "No active incumbency found for this work"
        | None, Some _, false -> Ok()

    let private captureDelegation (delegateTo: string -> Task<string>) (intent: string) : Task<Result<string, string>> =
        task {
            try
                let! record = delegateTo intent
                return Ok record
            with ex ->
                return Error(sprintf "DevOps delegation failed: %s" ex.Message)
        }

    // The binding is persisted single-flight after the delegation returns;
    // the fold keeps the append idempotent for replays (planning-010).
    let private appendDevOpsBound (store: IEventStore) (pid: PlanWorkId) (workId: string) : Task<Result<unit, string>> =
        task {
            let boundEvent =
                PlanEvents.devOpsBound workId (PlanWorkOpen.deriveDevOpsId workId) None

            match! PlanEventStore.append store pid boundEvent with
            | Error err -> return Error(sprintf "Failed to bind plan DevOps: %s" err)
            | Ok _ -> return Ok()
        }

    let private ensureDevOpsBound (store: IEventStore) (pid: PlanWorkId) (workId: string) : Task<Result<unit, string>> =
        task {
            match PlanEventStore.workState store pid with
            | Some state when state.BoundDevOps.IsSome -> return Ok()
            | _ -> return! appendDevOpsBound store pid workId
        }

    let private bindDevOpsAndComplete
        (store: IEventStore)
        (pid: PlanWorkId)
        (workId: string)
        (record: string)
        : Task<Result<AskResult, string>> =
        task {
            match! ensureDevOpsBound store pid workId with
            | Error err -> return Error err
            | Ok() ->
                return
                    Ok
                        { Kind = "delegated"
                          WorkRecord = record
                          Status = "completed" }
        }

    let private finishPendingAsk
        (store: IEventStore)
        (pid: PlanWorkId)
        (workId: string)
        (delegation: Result<string, string>)
        : Task<Result<AskResult, string>> =
        task {
            match delegation with
            | Error err -> return Error err
            | Ok record when String.IsNullOrWhiteSpace record ->
                return Error "The DevOps delegation returned an empty work record"
            | Ok record -> return! bindDevOpsAndComplete store pid workId record
        }

    let private runPendingAsk
        (store: IEventStore)
        (pid: PlanWorkId)
        (workId: string)
        (intent: string)
        (delegateTo: string -> Task<string>)
        : Task<Result<AskResult, string>> =
        task {
            try
                let! delegation = captureDelegation delegateTo intent
                let! completed = finishPendingAsk store pid workId delegation
                return completed
            finally
                clearPendingAsk workId
        }

    let private beginPendingAsk
        (store: IEventStore)
        (pid: PlanWorkId)
        (workId: string)
        (intent: string)
        (delegateTo: string -> Task<string>)
        : Task<Result<AskResult, string>> =
        if not (tryBeginPendingAsk workId) then
            Task.FromResult(
                Error(sprintf "An ask delegation is already pending for this work (%s); wait for it to finish" workId)
            )
        else
            runPendingAsk store pid workId intent delegateTo

    let executeAsk
        (store: IEventStore)
        (workId: string)
        (intent: string)
        (delegateTo: string -> Task<string>)
        : Task<Result<AskResult, string>> =
        let pid = PlanWorkId.create workId

        let state =
            PlanEventStore.workState store pid
            |> Option.defaultValue PlanFold.initialWorkState

        match validateAskRequest state intent with
        | Error err -> Task.FromResult(Error err)
        | Ok() -> beginPendingAsk store pid workId intent delegateTo

    let executeJsPlan
        (root: string)
        (workId: string)
        (action: string)
        (content: string option)
        (patches: (string * string) list option)
        : Result<string, string> =
        match action.ToLowerInvariant() with
        | "read"
        | "js-plan.read" -> PlanPath.readPlan root workId
        | "rewrite"
        | "js-plan.rewrite" ->
            content
            |> requireOpt "Missing content for rewrite"
            |> Result.bind (PlanPath.rewritePlanAtomic root workId)
            |> Result.map (fun (path, digest) -> sprintf "Plan rewritten at %s (digest: %s)" path digest)
        | "edit"
        | "js-plan.edit" ->
            patches
            |> requireOpt "Missing patches for edit"
            |> Result.bind (PlanPath.editPlanAtomic root workId)
            |> Result.map (fun (path, digest) -> sprintf "Plan edited at %s (digest: %s)" path digest)
        | _ -> Error(sprintf "Unknown js-plan action: %s" action)
