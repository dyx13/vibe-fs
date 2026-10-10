namespace Wanxiangshu.Mission.Relay.OpenCode

open System
open System.Threading.Tasks
open FsToolkit.ErrorHandling
open Wanxiangshu.Composition.Durable
open Wanxiangshu.Composition.Durable.Fact
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Git
open Wanxiangshu.Host
open Wanxiangshu.Mission.Relay
open Wanxiangshu.Mission.Relay.Assessment
open Wanxiangshu.OpenCode
open Wanxiangshu.Participant.Provider
open Wanxiangshu.Persistence.Journal

module ReviewTool =
    [<RequireQualifiedAccess>]
    module Path =
        [<Literal>]
        let Description = "tool/review/description"

        [<Literal>]
        let Finish = "runtime/manager-finish"

        [<Literal>]
        let Work = "runtime/manager-work"

        [<Literal>]
        let BindingUnavailable = "tool/review/binding-unavailable"

        [<Literal>]
        let MissingRequest = "tool/review/missing-request"

        [<Literal>]
        let InvalidFindings = "tool/review/invalid-findings"

        [<Literal>]
        let RecordFailed = "tool/review/record-failed"

        [<Literal>]
        let FindingsArgument = "tool/review/findings-argument"

        [<Literal>]
        let ReplayConflict = "tool/review/replay-conflict"

        [<Literal>]
        let AlreadySubmitted = "tool/review/already-submitted"

    type private ReviewFailure =
        | BindingUnavailable
        | MissingRequest
        | InvalidFindings
        | RecordFailed
        | ReplayConflict
        | AlreadySubmitted

    let private failurePath =
        function
        | BindingUnavailable -> Path.BindingUnavailable
        | MissingRequest -> Path.MissingRequest
        | InvalidFindings -> Path.InvalidFindings
        | RecordFailed -> Path.RecordFailed
        | ReplayConflict -> Path.ReplayConflict
        | AlreadySubmitted -> Path.AlreadySubmitted

    let private gitCapability: WorkspaceSnapshotGitCapability =
        { TryRevParseHeadTree = GitSubject.tryRevParseHeadTree
          DiffHeadBinary = GitSubject.diffHeadBinary
          LsFilesUntrackedZ = GitSubject.lsFilesUntrackedZ
          HashObjectNoFilters = GitSubject.hashObjectNoFilters
          StatusPorcelainV2Z = GitSubject.statusPorcelainV2Z
          LsFilesStageZ = GitSubject.lsFilesStageZ }

    let private providerText (path: string) substitutions =
        ProviderProse.render (ProviderLanguageBinding.readGlobalPreference ()) path substitutions

    let private rejectedResult failure =
        ToolHostCodec.tomlObjectWithInstructions
            [ providerText (failurePath failure) Map.empty ]
            [ "recorded", ToolHostCodec.TBool false ]

    let private requireSome error =
        function
        | Some value -> Ok value
        | None -> Error error

    let private narrativeOf texts =
        texts |> List.rev |> String.concat "\n" |> (fun text -> text.Trim()) |> Ok

    let private publicNarrativeBefore (toolCallId: ToolCallId) (message: SessionMessage) =
        let expected = ToolCallId.value toolCallId

        let nextPart index texts part =
            match part with
            | MessagePart.ToolCall(callId, name, _) when callId = expected && name = "review" ->
                narrativeOf texts |> Result.map Choice2Of2
            | MessagePart.Text text -> Choice1Of2(index + 1, text :: texts) |> Ok
            | MessagePart.Reasoning _
            | MessagePart.ToolCall _
            | MessagePart.ToolResult _
            | MessagePart.Activity _ -> Choice1Of2(index + 1, texts) |> Ok

        let rec loop index texts =
            if index >= message.Parts.Length then
                Error BindingUnavailable
            else
                nextPart index texts message.Parts.[index]
                |> Result.bind (function
                    | Choice1Of2(nextIndex, nextTexts) -> loop nextIndex nextTexts
                    | Choice2Of2 narrative -> Ok narrative)

        loop 0 []

    let private messageText (message: SessionMessage) =
        message.Parts
        |> Array.choose (function
            | MessagePart.Text text -> Some text
            | _ -> None)
        |> String.concat "\n"
        |> fun value -> value.Trim()

    let private requireRootText text =
        if String.IsNullOrWhiteSpace text then
            Error MissingRequest
        else
            Ok text

    let private rootText (physicalUserMessageId: string) (messages: SessionMessage list) =
        match messages |> List.tryFind (fun message -> message.Id = physicalUserMessageId) with
        | None -> Error MissingRequest
        | Some message -> message |> messageText |> requireRootText

    let private validateLocation providerRun (location: SessionSnapshot.ToolCallLocation) =
        if location.ToolName <> "review" then
            Error BindingUnavailable
        elif location.ProviderRun <> providerRun then
            Error BindingUnavailable
        else
            Ok location

    let private bindingFromMessages physicalUserMessageId rootAuthorityUserMessageId toolCallId providerRun messages =
        SessionSnapshot.locateToolCall toolCallId messages
        |> Result.mapError (fun _ -> BindingUnavailable)
        |> Result.bind (validateLocation providerRun)
        |> Result.bind (fun location ->
            messages
            |> List.tryFind (fun message -> message.Id = ProviderRunIdentity.value providerRun)
            |> requireSome BindingUnavailable
            |> Result.bind (fun message ->
                rootText rootAuthorityUserMessageId messages
                |> Result.bind (fun root ->
                    publicNarrativeBefore toolCallId message
                    |> Result.map (fun narrative ->
                        let narrativeDigest = HostDigest.sha256Hex narrative
                        let rootDigest = HostDigest.sha256Hex root
                        let payloadDigest = HostDigest.sha256Hex location.InputCanonical

                        let requirementSetDigest =
                            HostDigest.sha256Hex (
                                "requirements-v1\n" + rootAuthorityUserMessageId + "\n" + rootDigest
                            )

                        let evidenceFrontierDigest =
                            HostDigest.sha256Hex (
                                String.concat
                                    "\n"
                                    [ ProviderRunIdentity.value providerRun
                                      ToolCallId.value toolCallId
                                      narrativeDigest
                                      rootDigest
                                      payloadDigest ]
                            )

                        { PhysicalUserMessageId = physicalUserMessageId
                          ProviderRunId = ProviderRunIdentity.value providerRun
                          ToolCallId = ToolCallId.value toolCallId
                          NarrativeDigest = narrativeDigest
                          PayloadDigest = payloadDigest
                          RootRequestDigest = rootDigest
                          RequirementSetDigest = requirementSetDigest
                          EvidenceFrontierDigest = evidenceFrontierDigest }))))

    let private captureBinding
        (scope: ToolRuntimeScope)
        (context: HostToolContext)
        (physicalUserMessageId: string)
        (rootAuthorityUserMessageId: string)
        (toolCallId: ToolCallId)
        (providerRun: ProviderRunIdentity)
        : Task<Result<AssessmentBinding, ReviewFailure>> =
        match scope.Snapshot with
        | None -> Task.FromResult(Error BindingUnavailable)
        | Some snapshot ->
            task {
                let! loaded = snapshot.GetMessages(SessionId.create context.SessionId)

                return
                    loaded
                    |> Result.mapError (fun _ -> BindingUnavailable)
                    |> Result.bind (
                        bindingFromMessages physicalUserMessageId rootAuthorityUserMessageId toolCallId providerRun
                    )
            }

    let private currentRelayState (journal: AgentJournal) (sessionId: SessionId) =
        AgentProjection.tryFind sessionId (AgentJournal.snapshot journal).AgentProjections
        |> Option.bind (fun session -> session.Relay)

    let private assessmentTransaction
        (view: RoadView)
        (incumbencyId: IncumbencyId)
        (assessmentId: AssessmentId)
        (binding: AssessmentBinding)
        (snapshotId: WorkspaceSnapshotId)
        (authorityRevision: AuthorityRevision)
        (findings: AssessmentFindings)
        =
        let assessment =
            RelayEvent.AssessmentCommitted(assessmentId, incumbencyId, binding, snapshotId, authorityRevision, findings)

        match view.ActiveIncumbency, view.ActiveSnapshotId, view.ActiveAuthorityRevision with
        | None, _, _ -> Error BindingUnavailable
        | Some active, _, _ when active <> incumbencyId -> Error BindingUnavailable
        | _, _, Some expected when expected <> authorityRevision -> Error RecordFailed
        | _ ->
            RelayTransaction.create [ assessment ]
            |> Result.mapError (fun _ -> RecordFailed)

    type private BoundReviewInvocation =
        { Findings: AssessmentFindings
          ToolCallId: ToolCallId
          ProviderRun: ProviderRunIdentity
          PhysicalUserMessageId: string
          Directory: string
          Journal: AgentJournal }

    type private PreparedAssessment =
        { Bound: BoundReviewInvocation
          SessionId: SessionId
          RoadId: RoadId
          SnapshotId: WorkspaceSnapshotId
          View: RoadView
          RootAuthorityUserMessageId: string
          AuthorityRevision: AuthorityRevision
          IncumbencyId: IncumbencyId
          AssessmentId: AssessmentId }

    let private boundInvocation (scope: ToolRuntimeScope) (args: HostToolArguments) (context: HostToolContext) =
        Model.tryParse args.Raw
        |> Result.mapError (fun _ -> InvalidFindings)
        |> Result.bind (fun findings ->
            match
                context.ToolCallId,
                context.ProviderRunId,
                scope.CurrentPhysicalUserMessage context.SessionId,
                scope.WorkspaceDirectory,
                scope.Journal
            with
            | None, _, _, _, _ -> Error BindingUnavailable
            | _, None, _, _, _ -> Error BindingUnavailable
            | _, _, None, _, _ -> Error MissingRequest
            | _, _, _, None, _ -> Error BindingUnavailable
            | _, _, _, _, None -> Error BindingUnavailable
            | Some toolCallId, Some providerRun, Some physicalUserMessageId, Some directory, Some journal ->
                Ok
                    { Findings = findings
                      ToolCallId = toolCallId
                      ProviderRun = providerRun
                      PhysicalUserMessageId = physicalUserMessageId
                      Directory = directory
                      Journal = journal })

    type private ReplayCandidate =
        { IncumbencyId: IncumbencyId
          AuthorityRevision: AuthorityRevision
          SnapshotId: WorkspaceSnapshotId
          RootAuthorityUserMessageId: string }

    type private PreparedReview =
        | ReplayCandidate of ReplayCandidate
        | FreshAssessment of PreparedAssessment

    let private planForRoad
        (context: HostToolContext)
        (bound: BoundReviewInvocation)
        sessionId
        roadId
        snapshotId
        (road: RoadView)
        rootAuthorityUserMessageId
        =
        match road.AcceptedAssessmentTransport with
        | Some(acceptedCall, _) when acceptedCall = ToolCallId.value bound.ToolCallId ->
            road.ActiveIncumbency
            |> Option.map (fun incumbencyId ->
                ReplayCandidate
                    { IncumbencyId = incumbencyId
                      AuthorityRevision = road.AuthorityRevision
                      SnapshotId = snapshotId
                      RootAuthorityUserMessageId = rootAuthorityUserMessageId })
            |> requireSome BindingUnavailable
        | Some _ -> Error AlreadySubmitted
        | None ->
            road.ActiveIncumbency
            |> Option.filter (fun _ -> road.ActivePhase = Some IncumbencyPhase.AuditPending)
            |> requireSome BindingUnavailable
            |> Result.map (fun incumbencyId ->
                let assessmentId =
                    HostDigest.sha256Hex (
                        String.concat
                            "\n"
                            [ "assessment-v2"
                              context.SessionId
                              IncumbencyId.value incumbencyId
                              WorkspaceSnapshotId.value snapshotId
                              AuthorityRevision.value road.AuthorityRevision
                              ToolCallId.value bound.ToolCallId ]
                    )
                    |> fun digest -> AssessmentId.create ("assessment:" + digest)

                FreshAssessment
                    { Bound = bound
                      SessionId = sessionId
                      RoadId = roadId
                      SnapshotId = snapshotId
                      View = road
                      RootAuthorityUserMessageId = rootAuthorityUserMessageId
                      AuthorityRevision = road.AuthorityRevision
                      IncumbencyId = incumbencyId
                      AssessmentId = assessmentId })

    let private prepareAssessment (scope: ToolRuntimeScope) (context: HostToolContext) (bound: BoundReviewInvocation) =
        let sessionId = SessionId.create context.SessionId
        let roadId = RoadId.create context.SessionId

        try
            let snapshotId = WorkspaceSnapshot.capture gitCapability bound.Directory
            let state = currentRelayState bound.Journal sessionId

            let activeRoad =
                state
                |> Option.bind (fun relay -> Wanxiangshu.Mission.Relay.Fold.view relay roadId)
                |> requireSome BindingUnavailable

            activeRoad
            |> Result.bind (fun road ->
                scope.ActiveProfileFor sessionId
                |> Option.map (fun profile -> AuthorityRootUserMessageId.value profile.AuthorityRootUserMessageId)
                |> requireSome BindingUnavailable
                |> Result.bind (planForRoad context bound sessionId roadId snapshotId road))
        with _ ->
            Error BindingUnavailable

    let private acceptedResult (findings: AssessmentFindings) =
        let instructionPath =
            if AssessmentFindings.isEmpty findings then
                Path.Finish
            else
                Path.Work

        ToolHostCodec.tomlObjectWithInstructions
            [ providerText instructionPath Map.empty ]
            [ "recorded", ToolHostCodec.TBool true ]

    let private appendAssessment (prepared: PreparedAssessment) transaction =
        let fact =
            AgentFact.Relay(
                RelayFactCases.TransactionCommitted
                    {| RoadId = prepared.RoadId
                       Transaction = transaction |}
            )

        task {
            let! outcome =
                AgentJournal.appendAgent
                    (StreamId.Session prepared.SessionId)
                    (Some prepared.Bound.ProviderRun)
                    fact
                    prepared.Bound.Journal

            return outcome |> Result.mapError (fun _ -> RecordFailed)
        }

    let private runPrepared
        (scope: ToolRuntimeScope)
        (context: HostToolContext)
        (bound: BoundReviewInvocation)
        (plan: PreparedReview)
        =
        match plan with
        | ReplayCandidate replay ->
            taskResult {
                let! binding =
                    captureBinding
                        scope
                        context
                        bound.PhysicalUserMessageId
                        replay.RootAuthorityUserMessageId
                        bound.ToolCallId
                        bound.ProviderRun

                let sessionId = SessionId.create context.SessionId
                let roadId = RoadId.create context.SessionId
                let! state = currentRelayState bound.Journal sessionId |> requireSome ReplayConflict

                let! acceptedFindings =
                    Fold.tryReplayAssessment
                        state
                        roadId
                        replay.IncumbencyId
                        binding
                        replay.SnapshotId
                        replay.AuthorityRevision
                        bound.Findings
                    |> Result.mapError (fun _ -> ReplayConflict)

                return acceptedResult acceptedFindings
            }
        | FreshAssessment prepared ->
            taskResult {
                let! binding =
                    captureBinding
                        scope
                        context
                        prepared.Bound.PhysicalUserMessageId
                        prepared.RootAuthorityUserMessageId
                        prepared.Bound.ToolCallId
                        prepared.Bound.ProviderRun

                let! transaction =
                    assessmentTransaction
                        prepared.View
                        prepared.IncumbencyId
                        prepared.AssessmentId
                        binding
                        prepared.SnapshotId
                        prepared.AuthorityRevision
                        prepared.Bound.Findings

                let! _ = appendAssessment prepared transaction
                return acceptedResult prepared.Bound.Findings
            }

    let private renderExecution =
        function
        | Ok value -> value
        | Error failure -> rejectedResult failure

    let private execute (scope: ToolRuntimeScope) (args: HostToolArguments) (context: HostToolContext) =
        task {
            let! outcome =
                taskResult {
                    let! bound = boundInvocation scope args context
                    let! plan = prepareAssessment scope context bound
                    return! runPrepared scope context bound plan
                }

            return renderExecution outcome
        }

    let admission =
        ToolAdmission.OfficeRole(fun _ role -> OfficeCapability.isAllowed role ToolPermission.ReviewAssessment)

    let spec (factory: HostToolFactory) (scope: ToolRuntimeScope) : ToolSpec =
        let findingSchema =
            ToolHostCodec.objectSchemaOf
                [ "acceptance_criteria", ToolHostCodec.stringSchema factory
                  "work_plan", ToolHostCodec.stringSchema factory ]
                factory

        let findingsSchema =
            ToolHostCodec.arraySchemaOf findingSchema (providerText Path.FindingsArgument Map.empty) factory

        let noteArgument = "note", ToolHostCodec.optionalStringSchema factory

        { Name = "review"
          Description = providerText Path.Description Map.empty
          Arguments = [ "findings", findingsSchema; noteArgument ]
          Admission = admission
          Execute = execute scope }
