namespace Wanxiangshu.Mission.Manager

open Wanxiangshu.Persistence.Journal.JournalOutcome
open System.Threading.Tasks
open Wanxiangshu.Composition.Durable
open Wanxiangshu.Composition.Durable.Fact
open Wanxiangshu.Composition.Turn
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Git
open Wanxiangshu.Host
open Wanxiangshu.Interaction.Authority
open Wanxiangshu.Interaction.Dispatch
open Wanxiangshu.Interaction.Dispatch.OpenCode
open Wanxiangshu.Mission.Relay
open Wanxiangshu.Mission.Relay.OpenCode
open Wanxiangshu.OpenCode
open Wanxiangshu.Participant.Provider
open Wanxiangshu.Persistence.Journal

module ManagerWorkflow =
    type RetiredAttemptBoundary = SessionId -> RetirementSummary -> (unit -> Task<unit>) -> Task<unit>

    [<Literal>]
    let private assessPath = "runtime/manager-assess"

    [<Literal>]
    let private workPath = "runtime/manager-work"

    [<Literal>]
    let private finishPath = "runtime/manager-finish"

    let private gitCapability: WorkspaceSnapshotGitCapability =
        { TryRevParseHeadTree = GitSubject.tryRevParseHeadTree
          DiffHeadBinary = GitSubject.diffHeadBinary
          LsFilesUntrackedZ = GitSubject.lsFilesUntrackedZ
          HashObjectNoFilters = GitSubject.hashObjectNoFilters
          StatusPorcelainV2Z = GitSubject.statusPorcelainV2Z
          LsFilesStageZ = GitSubject.lsFilesStageZ }

    let private roadId (sessionId: SessionId) =
        RoadId.create (SessionId.value sessionId)

    let private relayState (journal: AgentJournal) (sessionId: SessionId) =
        AgentProjection.tryFind sessionId (AgentJournal.snapshot journal).AgentProjections
        |> Option.bind (fun session -> session.Relay)

    let private currentView (journal: AgentJournal) (sessionId: SessionId) =
        relayState journal sessionId
        |> Option.bind (fun state -> Fold.view state (roadId sessionId))

    let private currentViewOf (journal: AgentJournal option) (sessionId: SessionId) =
        journal
        |> Option.bind (fun durable ->
            relayState durable sessionId
            |> Option.bind (fun state -> Fold.view state (roadId sessionId)))

    /// The iteration ordinal as the provider reads it: "1" for the first
    /// Manager on this road, then one more per durable opening. A road with no
    /// view yet (first opening not yet committed) is still the first.
    let private iterationOrdinalText (journal: AgentJournal option) (sessionId: SessionId) =
        let ordinal =
            currentViewOf journal sessionId
            |> Option.map (fun road -> max 1 road.IterationOrdinal)
            |> Option.defaultValue 1

        string ordinal

    let private isRetiredObservation
        (journal: AgentJournal option)
        (sessionId: SessionId)
        (providerRun: ProviderRunIdentity)
        =
        journal
        |> Option.bind (fun durable -> currentView durable sessionId)
        |> Option.exists (fun road -> Set.contains (ProviderRunIdentity.value providerRun) road.RetiredProviderRunIds)

    let private resourceForCurrentAction (road: RoadView) =
        // Structured-workflow: auto assess/work/finish sequence is derived purely
        // from concrete immutable facts (active incumbency, assessment receipt, exact certificate binding),
        // never from an execution-position program counter or ActivePhase enum.
        let isBoundCertificate (active: IncumbencyId) (cert: QualityCertificate) =
            // A stale certificate from a previous incumbency, snapshot, or authority
            // revision must not select finish; only the exact bound certificate does.
            cert.Valid
            && cert.IncumbencyId = active
            && road.ActiveSnapshotId = Some cert.SnapshotId
            && road.ActiveAuthorityRevision = Some cert.AuthorityRevision

        match road.ActiveIncumbency, road.AcceptedAssessmentTransport, road.Certificate with
        | Some _, None, _ -> Some assessPath
        | Some active, Some _, Some cert when isBoundCertificate active cert -> Some finishPath
        | Some _, Some _, _ -> Some workPath
        | None, _, _ -> None


    let private activeResourcePath (view: RoadView option) =
        view |> Option.bind resourceForCurrentAction

    let private sendNudge
        (quiescence: ISessionQuiescenceGate)
        (permit: QuiescencePermit)
        (sessionPort: ISessionHostPort)
        (rootWorkspace: IRootWorkspaceReader)
        (journal: AgentJournal)
        (turn: ReconciledTurn)
        (resourcePath: string)
        =
        let substitutions =
            if resourcePath = assessPath then
                Map [ "ordinal", iterationOrdinalText (Some journal) turn.SessionId ]
            else
                Map.empty

        HostSessionNudge.trySendIdleGateContinuation
            quiescence
            permit
            sessionPort
            rootWorkspace
            turn.SessionId
            (ProviderProse.documentFor turn.SessionId resourcePath substitutions)
            PromptAuthority.ContinuationKind.ManagerGuard
            turn.Directory
            (Some journal)
            (resourcePath + ":" + ProviderRunIdentity.value turn.ProviderRun)
            turn.ProviderRun
            PromptDispatcher.AwaitMode.Detached

    let private scheduleNudge
        (quiescence: ISessionQuiescenceGate)
        (permit: QuiescencePermit)
        (sessionPort: ISessionHostPort)
        (rootWorkspace: IRootWorkspaceReader)
        (journal: AgentJournal)
        (turn: ReconciledTurn)
        =
        task {
            let view = currentView journal turn.SessionId

            match activeResourcePath view with
            | Some resourcePath ->
                // Durable PromptAuthority gate is the sole dedupe/source of truth:
                // Sent/AlreadyAdmitted/Retired are settled no-op success, Failed stays nonfatal.
                let! _ = sendNudge quiescence permit sessionPort rootWorkspace journal turn resourcePath
                return ()
            | None -> return ()
        }
        :> Task

    let private captureSnapshot (dirOpt: string option) =
        match dirOpt |> Option.filter (System.String.IsNullOrWhiteSpace >> not) with
        | Some dir -> WorkspaceSnapshot.capture gitCapability dir
        | None -> invalidOp "MANAGER-LOOP-001: workspace directory unavailable for snapshot capture"

    let private commitOpeningTransaction
        (durable: AgentJournal)
        sessionId
        providerRunIdOpt
        roadId
        (transaction: RelayTransaction)
        =
        task {
            let fact =
                AgentFact.Relay(
                    RelayFactCases.TransactionCommitted
                        {| RoadId = roadId
                           Transaction = transaction |}
                )

            match! AgentJournal.appendAgent (StreamId.Session sessionId) providerRunIdOpt fact durable with
            | Ok _ -> return ()
            | Error failure ->
                return
                    invalidOp (
                        sprintf "MANAGER-LOOP-002: opening commit failed: %s" (JournalAppendFailure.describe failure)
                    )
        }

    let private mergeWithInvalidation (opening: IncumbencyOpening) invalidationEvents =
        if List.isEmpty invalidationEvents then
            opening.Transaction
        else
            RelayTransaction.create (invalidationEvents @ RelayTransaction.events opening.Transaction)
            |> Result.defaultValue opening.Transaction

    let private requiresContinuation (road: RoadView) (retirement: RetirementSummary) =
        match retirement.Outcome, road.Certificate with
        | RetirementOutcome.Continue, _ -> true
        | RetirementOutcome.Accepted certificateId, Some certificate ->
            certificate.Id = certificateId && not certificate.Valid
        | RetirementOutcome.Accepted _, _ -> false

    let private isAcceptedWithValidCertificate (road: RoadView) (retirement: RetirementSummary) =
        match retirement.Outcome, road.Certificate with
        | RetirementOutcome.Accepted certId, Some cert -> cert.Id = certId && cert.Valid
        | _ -> false

    let private tryAcceptedRoadContext (durable: AgentJournal) sidText =
        let sessionId = SessionId.create sidText
        let roadId = RoadId.create sidText
        let snapshot = AgentJournal.snapshot durable

        let roadOpt =
            AgentProjection.tryFind sessionId snapshot.AgentProjections
            |> Option.bind (fun (s: SessionAgentProjection) -> s.Relay)
            |> Option.bind (fun (r: RelayState) -> Fold.view r roadId)

        match roadOpt with
        | Some road ->
            road.LatestRetirement
            |> Option.filter (isAcceptedWithValidCertificate road)
            |> Option.map (fun retirement ->
                durable, sessionId, roadId, road.AuthorityRevision, retirement, road.ActiveIncumbency.IsNone)
        | _ -> None

    let private loopContextFor (durable: AgentJournal) sidText =
        let sessionId = SessionId.create sidText
        let roadId = RoadId.create sidText
        let snapshot = AgentJournal.snapshot durable

        let roadOpt =
            AgentProjection.tryFind sessionId snapshot.AgentProjections
            |> Option.bind (fun (s: SessionAgentProjection) -> s.Relay)
            |> Option.bind (fun (r: RelayState) -> Fold.view r roadId)

        match roadOpt with
        | Some road ->
            road.LatestRetirement
            |> Option.filter (requiresContinuation road)
            |> Option.map (fun retirement ->
                durable, sessionId, roadId, road.AuthorityRevision, retirement, road.ActiveIncumbency.IsNone)
        | _ -> None

    let private decideLoopContext journal sessionIdTextOpt =
        match sessionIdTextOpt, journal with
        | Some sidText, Some durable when not (System.String.IsNullOrWhiteSpace sidText) ->
            loopContextFor durable sidText
        | _ -> None

    let private decideAutomaticLoopContext journal sessionIdTextOpt =
        decideLoopContext journal sessionIdTextOpt
        |> Option.filter (fun (_, _, _, _, retirement, _) -> retirement.Outcome = RetirementOutcome.Continue)

    let private tryBuildAcceptedOpening
        durable
        workspaceDirectory
        sessionId
        roadId
        authorityRevision
        (retirement: RetirementSummary)
        =
        match retirement.Outcome with
        | RetirementOutcome.Accepted _ ->
            let snapshot = captureSnapshot workspaceDirectory

            let roadOpt =
                AgentProjection.tryFind sessionId (AgentJournal.snapshot durable).AgentProjections
                |> Option.bind (fun s -> s.Relay)
                |> Option.bind (fun r -> Fold.view r roadId)

            let invalidationEvents =
                roadOpt
                |> Option.bind (fun r -> r.Certificate)
                |> Option.filter (fun c -> c.Valid)
                |> Option.map (fun c ->
                    [ RelayEvent.QualityCertificateInvalidated(c.Id, "ContinuousSessionAdvancesRoad") ])
                |> Option.defaultValue []

            let opening =
                IncumbencyOpening.next HostDigest.sha256Hex roadId retirement.Id authorityRevision snapshot

            let fullTransaction = mergeWithInvalidation opening invalidationEvents
            Some(durable, sessionId, opening.RoadId, fullTransaction)
        | RetirementOutcome.Continue -> None

    let private decideLoopOpening journal (workspaceDirectory: string option) sessionIdTextOpt =
        sessionIdTextOpt
        |> Option.filter (System.String.IsNullOrWhiteSpace >> not)
        |> Option.bind (fun sessionIdText ->
            journal
            |> Option.bind (fun durable ->
                match tryAcceptedRoadContext durable sessionIdText with
                | Some(_, sessionId, roadId, authorityRevision, retirement, true) ->
                    tryBuildAcceptedOpening durable workspaceDirectory sessionId roadId authorityRevision retirement
                | _ -> None))

    let private decideInitialOpening durable workspaceDirectory sessionId sessionIdText =
        let snapshot = AgentJournal.snapshot durable
        let roadId = RoadId.create sessionIdText

        let roadView =
            AgentProjection.tryFind sessionId snapshot.AgentProjections
            |> Option.bind (fun (s: SessionAgentProjection) -> s.Relay)
            |> Option.bind (fun (r: RelayState) -> Fold.view r roadId)

        let profileOpt =
            PromptAuthorityProjectionQueries.activeProfile sessionId snapshot.AgentProjections

        match roadView, profileOpt with
        | None, Some profile when profile.CanonicalRole = Role.Manager ->
            let rootUserMsg =
                AuthorityRootUserMessageId.value profile.AuthorityRootUserMessageId

            let opening =
                IncumbencyOpening.initial
                    HostDigest.sha256Hex
                    (RoadId.create (SessionId.value sessionId))
                    (PhysicalUserMessageId.create rootUserMsg)
                    (captureSnapshot workspaceDirectory)

            Some(durable, sessionId, opening.RoadId, opening.Transaction)
        | _ -> None

    let private decideOpeningAction journal (workspaceDirectory: string option) sessionIdTextOpt =
        match decideLoopOpening journal workspaceDirectory sessionIdTextOpt with
        | Some action -> Some action
        | None ->
            sessionIdTextOpt
            |> Option.filter (System.String.IsNullOrWhiteSpace >> not)
            |> Option.bind (fun sessionIdText ->
                journal
                |> Option.bind (fun durable ->
                    let sessionId = SessionId.create sessionIdText
                    decideInitialOpening durable workspaceDirectory sessionId sessionIdText))

    let ensureManagerRoadOpened
        (journal: AgentJournal option)
        (workspaceDirectory: string option)
        (sessionIdTextOpt: string option)
        (providerRunIdOpt: ProviderRunIdentity option)
        : Task<unit> =
        task {
            match decideOpeningAction journal workspaceDirectory sessionIdTextOpt with
            | None -> return ()
            | Some(durable, sessionId, roadId, transaction) ->
                do! commitOpeningTransaction durable sessionId providerRunIdOpt roadId transaction
        }

    let private deliverLoopPrompt
        sessionPort
        rootWorkspace
        workspaceDirectory
        (durable: AgentJournal)
        sessionId
        (retirement: RetirementSummary)
        =
        task {
            let loopPromptText =
                ProviderProse.documentFor
                    sessionId
                    "runtime/manager-assess"
                    (Map [ "ordinal", iterationOrdinalText (Some durable) sessionId ])

            let terminalRun = ProviderRunIdentity.create retirement.ProjectionCut.ProviderRunId

            match!
                HostSessionNudge.trySendGateContinuation
                    sessionPort
                    rootWorkspace
                    sessionId
                    loopPromptText
                    PromptAuthority.ContinuationKind.ManagerGuard
                    workspaceDirectory
                    (Some durable)
                    (ManagerLoopGate.gateKind retirement.Id)
                    terminalRun
            with
            | HostSessionNudge.GateContinuationOutcome.Sent _
            | HostSessionNudge.GateContinuationOutcome.AlreadyAdmitted -> return ()
            | HostSessionNudge.GateContinuationOutcome.Retired ->
                return
                    invalidOp (
                        sprintf
                            "MANAGER-LOOP-003: loop gate retired for retirement %s"
                            (RetirementId.value retirement.Id)
                    )
            | HostSessionNudge.GateContinuationOutcome.Failed error ->
                return invalidOp (sprintf "MANAGER-LOOP-003: loop gate nudge failed: %s" error)
        }

    let private deliverLoopContext
        sessionPort
        rootWorkspace
        workspaceDirectory
        (context: AgentJournal * SessionId * RoadId * AuthorityRevision * RetirementSummary * bool)
        =
        task {
            let durable, sessionId, roadId, authorityRevision, retirement, needsOpening =
                context

            match needsOpening with
            | true ->
                let snapshot = captureSnapshot workspaceDirectory

                let roadOpt =
                    AgentProjection.tryFind sessionId (AgentJournal.snapshot durable).AgentProjections
                    |> Option.bind (fun s -> s.Relay)
                    |> Option.bind (fun r -> Fold.view r roadId)

                let invalidationEvents =
                    roadOpt
                    |> Option.bind (fun r -> r.Certificate)
                    |> Option.filter (fun c -> c.Valid)
                    |> Option.map (fun c ->
                        [ RelayEvent.QualityCertificateInvalidated(c.Id, "ContinuousSessionAdvancesRoad") ])
                    |> Option.defaultValue []

                let opening =
                    IncumbencyOpening.next HostDigest.sha256Hex roadId retirement.Id authorityRevision snapshot

                let fullTransaction = mergeWithInvalidation opening invalidationEvents

                do! commitOpeningTransaction durable sessionId None opening.RoadId fullTransaction
            | false -> ()

            do! deliverLoopPrompt sessionPort rootWorkspace workspaceDirectory durable sessionId retirement
        }

    let private afterRetiredAttempt
        sessionPort
        rootWorkspace
        (journal: AgentJournal option)
        (workspaceDirectory: string option)
        (atRetiredAttemptBoundary: RetiredAttemptBoundary)
        automatic
        (sessionId: SessionId)
        (captured: RetirementSummary)
        : Task<unit> =
        task {
            do!
                atRetiredAttemptBoundary sessionId captured (fun () ->
                    task {
                        let context =
                            if automatic then
                                decideAutomaticLoopContext journal (Some(SessionId.value sessionId))
                            else
                                decideLoopContext journal (Some(SessionId.value sessionId))

                        match context with
                        | Some((_, _, _, _, current, _) as latest) when
                            current.Id = captured.Id && current.ProjectionCut = captured.ProjectionCut
                            ->
                            do! deliverLoopContext sessionPort rootWorkspace workspaceDirectory latest
                        | _ -> ()
                    })
        }

    let maybeDeliverLoop
        sessionPort
        rootWorkspace
        (journal: AgentJournal option)
        (workspaceDirectory: string option)
        (atRetiredAttemptBoundary: RetiredAttemptBoundary)
        (sessionIdTextOpt: string option)
        : Task<unit> =
        let context =
            sessionIdTextOpt
            |> Option.filter (System.String.IsNullOrWhiteSpace >> not)
            |> Option.map SessionId.create
            |> Option.bind (fun sessionId ->
                journal
                |> Option.bind (fun durable -> currentView durable sessionId)
                |> Option.bind (fun road -> road.LatestRetirement)
                |> Option.map (fun retirement -> sessionId, retirement))

        match context with
        | Some(sessionId, retirement) ->
            afterRetiredAttempt
                sessionPort
                rootWorkspace
                journal
                workspaceDirectory
                atRetiredAttemptBoundary
                false
                sessionId
                retirement
        | None -> Task.FromResult()

    let continueAfterRetiredAttempt
        sessionPort
        rootWorkspace
        (journal: AgentJournal option)
        (workspaceDirectory: string option)
        (atRetiredAttemptBoundary: RetiredAttemptBoundary)
        (sessionId: SessionId)
        (retirement: RetirementSummary)
        : Task<unit> =
        afterRetiredAttempt
            sessionPort
            rootWorkspace
            journal
            workspaceDirectory
            atRetiredAttemptBoundary
            true
            sessionId
            retirement

    let observeIdle
        (quiescence: ISessionQuiescenceGate)
        (sessionPort: ISessionHostPort)
        (rootWorkspace: IRootWorkspaceReader)
        (journal: AgentJournal option)
        (context: ReconciledTurnContext)
        : Task =
        match journal, context.Failure, context.Turn.Outcome, context.Quiescence with
        | Some durable, None, ReconcileProgram.TurnCompleted, Some permit ->
            scheduleNudge quiescence permit sessionPort rootWorkspace durable context.Turn
        | _ -> Task.FromResult()

    let observe
        (quiescence: ISessionQuiescenceGate)
        (sessionPort: ISessionHostPort)
        (rootWorkspace: IRootWorkspaceReader)
        (journal: AgentJournal option)
        (observeOrdinary: ReconciledTurnContext -> Task)
        (context: ReconciledTurnContext)
        : Task =
        match
            isRetiredObservation journal context.Turn.SessionId context.Turn.ProviderRun,
            context.Failure,
            context.Turn.Outcome
        with
        | true, _, _ -> Task.FromResult()
        | false, Some _, _ -> observeOrdinary context
        | false, None, ReconcileProgram.TurnInProgress -> Task.FromResult()
        // provider-attempt-recovery-008: an unfinished manager turn is content damage, not a
        // reason to stop. It earns the same bounded Interaction Repair as every
        // other repairable role instead of being silently dropped.
        | false, None, ReconcileProgram.TurnNeedsContinuation _ -> observeOrdinary context
        | false, None, ReconcileProgram.TurnCompleted ->
            observeIdle quiescence sessionPort rootWorkspace journal context
        | false, None, _ -> observeOrdinary context
