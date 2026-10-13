namespace Wanxiangshu.Mission.Planning

open Wanxiangshu.Context.Trace

[<RequireQualifiedAccess>]
type PlanEndingIntent =
    | Handoff
    | Deliver

module PlanEndingIntent =
    let ofString (value: string) : PlanEndingIntent option =
        match value with
        | "Handoff"
        | "handoff" -> Some PlanEndingIntent.Handoff
        | "Deliver"
        | "deliver" -> Some PlanEndingIntent.Deliver
        | _ -> None

    let render (intent: PlanEndingIntent) : string =
        match intent with
        | PlanEndingIntent.Handoff -> "Handoff"
        | PlanEndingIntent.Deliver -> "Deliver"

[<RequireQualifiedAccess>]
type PlanPhase =
    | WorkOwned
    | EndingDeclared of intent: PlanEndingIntent
    | CleanupBlocked of blocker: string option

module PlanPhase =
    let render (phase: PlanPhase) : string =
        match phase with
        | PlanPhase.WorkOwned -> "WorkOwned"
        | PlanPhase.EndingDeclared intent -> sprintf "EndingDeclared(%s)" (PlanEndingIntent.render intent)
        | PlanPhase.CleanupBlocked None -> "CleanupBlocked"
        | PlanPhase.CleanupBlocked(Some b) -> sprintf "CleanupBlocked(%s)" b

type ActivePlanIncumbency =
    { Id: string
      Stage: PlanStage
      Phase: PlanPhase
      Authorized: bool
      OpeningCursor: XTraceCursor }

type PlanWorkState =
    { WorkId: string option
      Root: string option
      Active: ActivePlanIncumbency option
      Retired: string list
      LatestRetirement: (string * PlanRetirementOutcome * XTraceCursor * XTraceCursor) option
      PredecessorRange: (XTraceCursor * XTraceCursor) option
      BoundDevOps: (string * string option) option
      Delivered: PlanDeliveryReceipt option
      PreviousIncumbencyStage: PlanStage option
      Reviewed: (string * PlanReviewedOutcome) option }

module PlanWorkState =
    let empty: PlanWorkState =
        { WorkId = None
          Root = None
          Active = None
          Retired = []
          LatestRetirement = None
          PredecessorRange = None
          BoundDevOps = None
          Delivered = None
          PreviousIncumbencyStage = None
          Reviewed = None }

type PlanWorkView =
    { WorkId: string option
      ActiveIncumbencyId: string option
      ActiveStage: string option
      ActivePhase: string option
      ActiveAuthorized: bool option
      RetiredCount: int
      LatestRetirementOutcome: string option
      LatestReviewOutcome: string option
      Delivered: bool
      DeliveryDigest: string option
      DeliveryPath: string option
      DeliveryExecSessionId: string option
      BoundDevOpsId: string option }

type PlanState = private PlanState of Map<string, PlanWorkState>

module PlanFold =
    let initialWorkState: PlanWorkState = PlanWorkState.empty
    let initialState: PlanState = PlanState Map.empty

    let viewOf (state: PlanWorkState) : PlanWorkView =
        { WorkId = state.WorkId
          ActiveIncumbencyId = state.Active |> Option.map (fun a -> a.Id)
          ActiveStage = state.Active |> Option.map (fun a -> PlanStage.render a.Stage)
          ActivePhase = state.Active |> Option.map (fun a -> PlanPhase.render a.Phase)
          ActiveAuthorized = state.Active |> Option.map (fun a -> a.Authorized)
          RetiredCount = state.Retired.Length
          LatestRetirementOutcome =
            state.LatestRetirement
            |> Option.map (fun (_, o, _, _) -> PlanRetirementOutcome.render o)
          LatestReviewOutcome = state.Reviewed |> Option.map (fun (_, o) -> PlanReviewedOutcome.render o)
          Delivered = state.Delivered.IsSome
          DeliveryDigest = state.Delivered |> Option.map (fun d -> d.Digest)
          DeliveryPath = state.Delivered |> Option.map (fun d -> d.Path)
          DeliveryExecSessionId = state.Delivered |> Option.map (fun d -> d.ExecSessionId)
          BoundDevOpsId = state.BoundDevOps |> Option.map fst }

    let private applyWorkOpened (workId: string) (root: string) (state: PlanWorkState) : Result<PlanWorkState, string> =
        match state.WorkId, state.Root with
        | Some existingId, Some existingRoot when existingId = workId && existingRoot = root -> Ok state
        | Some existingId, _ when existingId <> workId -> Error "Cannot re-open existing work with different work ID"
        | _, Some existingRoot when existingRoot <> root -> Error "Cannot re-open work with conflicting root directory"
        | _ ->
            Ok
                { state with
                    WorkId = Some workId
                    Root = Some root }

    let private applyDevOpsBound
        (workId: string)
        (devopsId: string)
        (target: string option)
        (state: PlanWorkState)
        : Result<PlanWorkState, string> =
        match state.WorkId, state.BoundDevOps with
        | None, _ -> Error "Cannot bind DevOps before work is opened"
        | Some id, _ when id <> workId -> Error "Work ID mismatch on DevOps binding"
        | Some _, Some(existingDevops, existingTarget) when existingDevops = devopsId && existingTarget = target ->
            Ok state
        | Some _, Some _ -> Error "Cannot rebind DevOps with conflicting target or identity"
        | Some _, None ->
            Ok
                { state with
                    BoundDevOps = Some(devopsId, target) }

    // A relay successor must open at the stage the retired tenure held when it
    // retired (planning-004: relay does not advance the stage; only
    // PlanReviewed(Promoted) does). PreviousIncumbencyStage is maintained at
    // opening and at each in-place promotion, so it always carries the latest
    // stage of the most recent tenure.
    let private relayStageValid
        (stage: PlanStage)
        (retired: string list)
        (previousStage: PlanStage option)
        : Result<unit, string> =
        match retired.IsEmpty, previousStage with
        | true, _ when stage = PlanStage.S1 -> Ok()
        | true, _ -> Error "Initial incumbency must start at stage S1"
        | false, None -> Error "Missing previous incumbency stage tracking"
        | false, Some prev when prev = stage -> Ok()
        | false, Some prev ->
            Error(
                sprintf
                    "Illegal stage transition: relay successor must open at the retired stage %s, got %s"
                    (PlanStage.render prev)
                    (PlanStage.render stage)
            )

    let private applyIncumbencyOpened
        (workId: string)
        (incumbencyId: string)
        (stage: PlanStage)
        (openingCursor: XTraceCursor)
        (state: PlanWorkState)
        : Result<PlanWorkState, string> =
        let isAlreadyRetired = List.contains incumbencyId state.Retired

        match state.WorkId, state.Active, isAlreadyRetired with
        | None, _, _ -> Error "Cannot open incumbency before work is opened"
        | Some id, _, _ when id <> workId -> Error "Work ID mismatch on opening incumbency"
        | Some _, Some active, _ when
            active.Id = incumbencyId
            && active.Stage = stage
            && XTraceCursor.sequence active.OpeningCursor = XTraceCursor.sequence openingCursor
            ->
            Ok state
        | Some _, Some _, _ -> Error "An active incumbency is already present for this work"
        | Some _, None, true -> Error "Cannot revive an already retired incumbency"
        | Some _, None, false ->
            relayStageValid stage state.Retired state.PreviousIncumbencyStage
            |> Result.map (fun () ->
                let active =
                    { Id = incumbencyId
                      Stage = stage
                      Phase = PlanPhase.WorkOwned
                      Authorized = false
                      OpeningCursor = openingCursor }

                { state with
                    Active = Some active
                    PredecessorRange =
                        state.LatestRetirement
                        |> Option.map (fun (_, _, startCursor, endCursor) -> startCursor, endCursor)
                    PreviousIncumbencyStage = Some stage })

    let private applyIncumbencyRetired
        (incumbencyId: string)
        (outcome: PlanRetirementOutcome)
        (retirementCursor: XTraceCursor)
        (state: PlanWorkState)
        : Result<PlanWorkState, string> =
        let isRetired = List.contains incumbencyId state.Retired

        match state.Active, isRetired, state.LatestRetirement with
        | None, true, Some(retId, retOutcome, _, retCursor) when
            retId = incumbencyId
            && retOutcome = outcome
            && XTraceCursor.sequence retCursor = XTraceCursor.sequence retirementCursor
            ->
            Ok state
        | None, true, _ -> Error "Conflicting retirement payload for already retired incumbency"
        | None, false, _ -> Error "No active incumbency found to retire"
        | Some active, _, _ when active.Id <> incumbencyId ->
            Error "Active incumbency ID does not match retirement target"
        | Some active, _, _ when XTraceCursor.isAfter active.OpeningCursor retirementCursor ->
            Error "Retirement cursor cannot precede incumbency opening cursor"
        | Some active, _, _ when outcome = PlanRetirementOutcome.Delivered && not active.Authorized ->
            Error "Cannot retire with Delivered outcome before the tenure holds delivery authorization"
        | Some active, _, _ ->
            let retired = active.Id :: state.Retired
            let latest = Some(active.Id, outcome, active.OpeningCursor, retirementCursor)

            Ok
                { state with
                    Active = None
                    Retired = retired
                    LatestRetirement = latest }

    // S1 promotes to S2, S2 to S3; S3 promotion grants delivery authorization
    // and there is no fourth stage. The stage tracker follows the promotion so
    // a relay successor opens at the promoted stage.
    let private promoteTenure
        (previousStage: PlanStage option)
        (active: ActivePlanIncumbency)
        : ActivePlanIncumbency * PlanStage option =
        match active.Stage with
        | PlanStage.S1 -> { active with Stage = PlanStage.S2 }, Some PlanStage.S2
        | PlanStage.S2 -> { active with Stage = PlanStage.S3 }, Some PlanStage.S3
        | PlanStage.S3 -> { active with Authorized = true }, previousStage

    // Stayed only records the review; Promoted advances the active tenure in
    // place (planning-004).
    let private applyReviewOutcome
        (incumbencyId: string)
        (outcome: PlanReviewedOutcome)
        (active: ActivePlanIncumbency)
        (state: PlanWorkState)
        : Result<PlanWorkState, string> =
        match outcome with
        | PlanReviewedOutcome.Stayed ->
            Ok
                { state with
                    Reviewed = Some(incumbencyId, outcome) }
        | PlanReviewedOutcome.Promoted ->
            let promotedActive, promotedPrev =
                promoteTenure state.PreviousIncumbencyStage active

            Ok
                { state with
                    Active = Some promotedActive
                    PreviousIncumbencyStage = promotedPrev
                    Reviewed = Some(incumbencyId, outcome) }

    let private applyReviewed
        (incumbencyId: string)
        (stage: PlanStage)
        (outcome: PlanReviewedOutcome)
        (state: PlanWorkState)
        : Result<PlanWorkState, string> =
        match state.WorkId, state.Active, state.Reviewed with
        | None, _, _ -> Error "Cannot review before work is opened"
        | _, None, _ -> Error "No active incumbency found to review"
        | _, Some active, _ when active.Id <> incumbencyId -> Error "Active incumbency ID does not match review target"
        // Idempotent replay of the same review for the same incumbency.
        | _, _, Some(revInc, revOutcome) when revInc = incumbencyId && revOutcome = outcome -> Ok state
        // A second, different review for the same incumbency is a conflict.
        | _, _, Some(revInc, _) when revInc = incumbencyId ->
            Error "Conflicting review payload for already reviewed incumbency"
        | _, Some active, _ when active.Stage <> stage ->
            Error(
                sprintf
                    "Review stage mismatch: incumbency is at %s, event claims %s"
                    (PlanStage.render active.Stage)
                    (PlanStage.render stage)
            )
        | _, Some active, _ -> applyReviewOutcome incumbencyId outcome active state

    let private validateReceipt
        (incumbencyId: PlanIncumbencyId)
        (workId: PlanWorkId)
        (digest: string)
        (path: string)
        (execSessionId: string)
        (state: PlanWorkState)
        : Result<PlanWorkState, string> =
        match
            System.String.IsNullOrWhiteSpace digest
            || System.String.IsNullOrWhiteSpace path
            || System.String.IsNullOrWhiteSpace execSessionId
        with
        | true -> Error "Plan delivery requires non-empty digest, path and execution session"
        | false ->
            let receipt =
                { IncumbencyId = incumbencyId
                  WorkId = workId
                  Digest = digest
                  Path = path
                  ExecSessionId = execSessionId }

            Ok { state with Delivered = Some receipt }

    let private applyDelivered
        (incumbencyId: string)
        (workId: string)
        (digest: string)
        (path: string)
        (execSessionId: string)
        (state: PlanWorkState)
        : Result<PlanWorkState, string> =
        let receiptId = PlanIncumbencyId.create incumbencyId
        let receiptWork = PlanWorkId.create workId

        match state.WorkId, state.Active.IsSome, state.LatestRetirement, state.Delivered with
        | None, _, _, _ -> Error "Cannot deliver before work is opened"
        | Some id, _, _, _ when id <> workId -> Error "Work ID mismatch on plan delivery"
        | Some _, true, _, _ ->
            Error "Cannot deliver while an active incumbency exists; incumbency must retire with Delivered first"
        | Some _, false, Some(retId, PlanRetirementOutcome.Delivered, _, _), Some receipt when
            retId = incumbencyId
            && receipt.IncumbencyId = receiptId
            && receipt.Digest = digest
            && receipt.Path = path
            && receipt.ExecSessionId = execSessionId
            ->
            Ok state
        | Some _, false, Some(retId, PlanRetirementOutcome.Delivered, _, _), Some _ when retId = incumbencyId ->
            Error "Delivery already recorded with conflicting digest, path or execution session"
        | Some _, false, Some(retId, PlanRetirementOutcome.Delivered, _, _), None when retId = incumbencyId ->
            validateReceipt receiptId receiptWork digest path execSessionId state
        | _ -> Error "Delivery requires the incumbency to be retired with Delivered outcome"

    // Restore the tenure that delivered as Active: same incumbencyId, same
    // stage, and the authorization a Delivered retirement presupposes
    // (planning-021). The successor state is constructed field-by-field
    // rather than via a record copy so the restored authorization cannot be
    // lost to any copy/spread behavior in the compiled runtime.
    let private restoreDeliveredTenure (incumbencyId: string) (state: PlanWorkState) : Result<PlanWorkState, string> =
        match state.LatestRetirement, state.PreviousIncumbencyStage with
        | Some(retInc, PlanRetirementOutcome.Delivered, openingCursor, _), Some stage when retInc = incumbencyId ->
            let restored =
                { Id = incumbencyId
                  Stage = stage
                  Phase = PlanPhase.WorkOwned
                  Authorized = true
                  OpeningCursor = openingCursor }

            Ok
                { WorkId = state.WorkId
                  Root = state.Root
                  Active = Some restored
                  Retired = state.Retired
                  LatestRetirement = state.LatestRetirement
                  PredecessorRange = state.PredecessorRange
                  BoundDevOps = state.BoundDevOps
                  Delivered = None
                  PreviousIncumbencyStage = state.PreviousIncumbencyStage
                  Reviewed = state.Reviewed }
        | Some(retInc, _, _, _), _ when retInc <> incumbencyId ->
            Error "Reopened incumbency does not match the delivered retirement record"
        | _ -> Error "Reopen requires consistent retirement and stage tracking for the delivered incumbency"

    let private applyReopened (incumbencyId: string) (state: PlanWorkState) : Result<PlanWorkState, string> =
        match state.WorkId, state.Delivered, state.Active with
        | None, _, _ -> Error "Cannot reopen before work is opened"
        // Idempotent replay after an earlier reopen: the incumbency is back as
        // Active and already sits in the retired history.
        | _, None, Some active when active.Id = incumbencyId && List.contains incumbencyId state.Retired -> Ok state
        | _, None, _ -> Error "Cannot reopen a work without a delivered retirement"
        | _, Some receipt, _ when receipt.IncumbencyId = PlanIncumbencyId.create incumbencyId ->
            restoreDeliveredTenure incumbencyId state
        | _, _, _ -> Error "Reopened incumbency does not match the delivered receipt"

    let applyWorkEvent (event: PlanEvent) (state: PlanWorkState) : Result<PlanWorkState, string> =
        match event with
        | PlanEvent.PlanWorkOpened(workId, root) -> applyWorkOpened (PlanWorkId.value workId) root state
        | PlanEvent.PlanDevOpsBound(workId, devopsId, target) ->
            applyDevOpsBound (PlanWorkId.value workId) devopsId target state
        | PlanEvent.PlanIncumbencyOpened(workId, incumbencyId, stage, openingCursor) ->
            applyIncumbencyOpened
                (PlanWorkId.value workId)
                (PlanIncumbencyId.value incumbencyId)
                stage
                openingCursor
                state
        | PlanEvent.PlanIncumbencyRetired(incumbencyId, outcome, retirementCursor) ->
            applyIncumbencyRetired (PlanIncumbencyId.value incumbencyId) outcome retirementCursor state
        | PlanEvent.PlanDelivered(incumbencyId, workId, digest, path, execSessionId) ->
            applyDelivered
                (PlanIncumbencyId.value incumbencyId)
                (PlanWorkId.value workId)
                digest
                path
                execSessionId
                state
        | PlanEvent.PlanReviewed(incumbencyId, stage, outcome) ->
            applyReviewed (PlanIncumbencyId.value incumbencyId) stage outcome state
        | PlanEvent.PlanReopened(incumbencyId) -> applyReopened (PlanIncumbencyId.value incumbencyId) state

    let private workKey (event: PlanEvent) : string =
        match event with
        | PlanEvent.PlanWorkOpened(workId, _) -> PlanWorkId.value workId
        | PlanEvent.PlanDevOpsBound(workId, _, _) -> PlanWorkId.value workId
        | PlanEvent.PlanIncumbencyOpened(workId, _, _, _) -> PlanWorkId.value workId
        | PlanEvent.PlanDelivered(_, workId, _, _, _) -> PlanWorkId.value workId
        | PlanEvent.PlanIncumbencyRetired(incumbencyId, _, _) -> PlanIncumbencyId.value incumbencyId
        | PlanEvent.PlanReviewed(incumbencyId, _, _) -> PlanIncumbencyId.value incumbencyId
        | PlanEvent.PlanReopened(incumbencyId) -> PlanIncumbencyId.value incumbencyId

    let private applyByIncumbencyToState
        (incumbencyId: string)
        (event: PlanEvent)
        (works: Map<string, PlanWorkState>)
        : Result<PlanState, string> =
        let found =
            works
            |> Map.tryFindKey (fun _ st ->
                (st.Active |> Option.exists (fun a -> a.Id = incumbencyId))
                || (st.Retired |> List.contains incumbencyId))

        match found with
        | Some k ->
            let st = Map.find k works

            applyWorkEvent event st
            |> Result.map (fun nextSt -> PlanState(Map.add k nextSt works))
        | None -> Error(sprintf "No work state found for incumbency %s" incumbencyId)

    let private applyKeyedEventToState
        (k: string)
        (event: PlanEvent)
        (works: Map<string, PlanWorkState>)
        : Result<PlanState, string> =
        let current = works |> Map.tryFind k |> Option.defaultValue initialWorkState

        applyWorkEvent event current
        |> Result.map (fun nextSt -> PlanState(Map.add k nextSt works))

    let applyEvent (event: PlanEvent) (PlanState works) : Result<PlanState, string> =
        match event with
        | PlanEvent.PlanIncumbencyRetired(incumbencyId, _, _)
        | PlanEvent.PlanReviewed(incumbencyId, _, _)
        | PlanEvent.PlanReopened(incumbencyId) ->
            applyByIncumbencyToState (PlanIncumbencyId.value incumbencyId) event works
        | _ -> applyKeyedEventToState (workKey event) event works

    let rec applyEvents (events: PlanEvent list) (state: PlanState) : Result<PlanState, string> =
        match events with
        | [] -> Ok state
        | head :: tail -> applyEvent head state |> Result.bind (applyEvents tail)

    let applyWorkEventJs (event: PlanEvent) (state: PlanWorkState) : obj =
        match applyWorkEvent event state with
        | Ok nextSt ->
            box
                {| ok = true
                   state = nextSt
                   error = null |}
        | Error err ->
            box
                {| ok = false
                   state = state
                   error = err |}

    let applyEventJs (event: PlanEvent) (state: PlanState) : obj =
        match applyEvent event state with
        | Ok nextSt ->
            box
                {| ok = true
                   state = nextSt
                   error = null |}
        | Error err ->
            box
                {| ok = false
                   state = state
                   error = err |}

    let applyEventsJs (events: PlanEvent list) (state: PlanState) : obj =
        match applyEvents events state with
        | Ok nextSt ->
            box
                {| ok = true
                   state = nextSt
                   error = null |}
        | Error err ->
            box
                {| ok = false
                   state = state
                   error = err |}

    let workState (workId: string) (PlanState works) : PlanWorkState option = Map.tryFind workId works

    let view (workId: string) (state: PlanState) : PlanWorkView option =
        workState workId state |> Option.map viewOf
