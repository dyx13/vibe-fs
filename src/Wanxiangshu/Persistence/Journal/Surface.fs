namespace Wanxiangshu.Persistence.Journal

open Wanxiangshu.Persistence.Journal.JournalOutcome
open System
open System.Threading.Tasks
open Fable.Core
open Fable.Core.JsInterop
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Composition.Durable
open Wanxiangshu.Composition.Durable.Fact
open Wanxiangshu.Context.Companion
open Wanxiangshu.Persistence.EventStore
open Wanxiangshu.Host
open Wanxiangshu.Execution.Failure
open Wanxiangshu.Execution.Session.ChatExecution
open Wanxiangshu.Execution.Delegation
open Wanxiangshu.Participant.Persona
open Wanxiangshu.Mission.Relay
open Wanxiangshu.Enforcer
open Wanxiangshu.Enforcer.Guidance
open Wanxiangshu.Context.Companion.Blogger
open Wanxiangshu.Context.Companion.Blogger.Runtime
open Wanxiangshu.Context.Prefix
open Wanxiangshu.Context.Trace
open Wanxiangshu.OpenCode.Host.PairProgramming
open Wanxiangshu.OpenCode.Host.RequirementGrounding
open Wanxiangshu.Execution.Session
open Wanxiangshu.Interaction.Authority
open Wanxiangshu.Interaction.Attention
open Wanxiangshu.Participant.Provider.Attempt.Fallback

/// Opaque capability for one journal projection and its local writer.
type JournalHandle private (journal: AgentJournal, release: unit -> unit) =
    // DSL-MUTABLE: resource — one-shot physical journal disposal latch
    let mutable disposed = false

    member internal _.Journal =
        if disposed then
            invalidOp "Journal handle is disposed"

        journal

    member internal _.Dispose() =
        if not disposed then
            disposed <- true
            release ()

    static member internal Create(journal: AgentJournal) =
        JournalHandle(journal, (fun () -> (journal :> IDisposable).Dispose()))

    static member internal CreateShared(journal: AgentJournal) =
        JournalHandle(journal, (fun () -> SharedAgentJournal.release (Some journal)))

[<RequireQualifiedAccess>]
module JournalSurface =

    let private str (value: obj) : string =
        if isNull value then "" else string value

    let private commitmentLabel =
        function
        | ExecutionFailure.PersistenceFailure PersistenceCommitment.NotCommitted -> "NotCommitted"
        | ExecutionFailure.PersistenceFailure PersistenceCommitment.Committed -> "Committed"
        | ExecutionFailure.PersistenceFailure PersistenceCommitment.Unknown -> "Unknown"
        | ExecutionFailure.PersistenceFailure PersistenceCommitment.NoNewWrite -> "NoNewWrite"
        | ExecutionFailure.LocalInvariant
        | ExecutionFailure.ProtocolRejection
        | ExecutionFailure.AuthorizationDenied
        | ExecutionFailure.UserCancelled
        | ExecutionFailure.Superseded
        | ExecutionFailure.CapacityQueueFull
        | ExecutionFailure.ProviderTransient
        | ExecutionFailure.ProviderPermanent
        | ExecutionFailure.AcceptanceUnknown
        | ExecutionFailure.StreamInterruptedAfterFirstToken ->
            invalidOp "journal mapper returned a non-persistence failure"

    let mapAppendFailure (value: obj) : obj =
        if isNull value then
            invalidArg "value" "missing journal append outcome"

        let eventId = EventId.create "surface-append"
        let diagnostic = str value?diagnostic

        let physical =
            match str value?kind with
            | "WriterUnavailable" -> JournalAppendFailure.WriterUnavailable(eventId, JournalUnavailable.WriterClosing)
            | "FactRejected" ->
                JournalAppendFailure.FactRejected(
                    eventId,
                    { Fact = "surface"
                      Reason = diagnostic }
                )
            | "WriteUnknown" -> JournalAppendFailure.WriteUnknown(eventId, JournalFailure.WriteFailed diagnostic)
            | other -> invalidArg "kind" $"unknown journal append outcome '{other}'"

        box
            {| failure = "PersistenceFailure"
               commitment = physical |> JournalAppendOutcome.toExecutionFailure |> commitmentLabel
               diagnostic = diagnostic |}

    let private sessionIdOf (value: obj) : SessionId = SessionId.create (str value)

    let private roleOf (value: string) : Role =
        match Roles.tryParseRole (value.Trim()) with
        | Some role -> role
        | None -> failwith $"JournalSurface: unknown role '{value}'"

    let private providerRunOf (value: obj) : ProviderRunIdentity option =
        if isNull value then
            None
        else
            Some(ProviderRunIdentity.create (str value))

    let private agentFactOfJs (value: obj) : AgentFact =
        let family = str (value?family)
        let case = str (value?case)
        let payload = unbox<obj> (value?payload)

        match family, case with
        | "Companion", "CompanionBloggerLinked" ->
            CompanionFact.CompanionBloggerLinked
                {| SessionId = sessionIdOf (payload?SessionId)
                   BloggerSessionId = sessionIdOf (payload?BloggerSessionId)
                   BloggerAgent = str payload?BloggerAgent |}
        | "Companion", "CompanionBloggerClosed" ->
            CompanionFact.CompanionBloggerClosed {| SessionId = sessionIdOf (payload?SessionId) |}
        | "Companion", "TerminalOutputCaptured" ->
            let runId =
                let r = str payload?ProviderRun
                if String.IsNullOrEmpty r then "run-terminal" else r

            CompanionFact.TerminalOutputCaptured
                {| SessionId = sessionIdOf (payload?SessionId)
                   TextRef = BlobRef.create (str payload?TextRef)
                   TextDigest = BlobDigest.create (str payload?TextDigest)
                   ProviderRun = ProviderRunIdentity.create runId |}
        | "Execution", "HandleLinked" ->
            let handleId = str payload?Handle

            ExecutionFact.HandleLinked
                {| ParentSessionId = sessionIdOf (payload?ParentSessionId)
                   ChildSessionId = sessionIdOf (payload?ChildSessionId)
                   Handle = HandleId.Agent(AgentHandleId.create handleId)
                   TargetAgent = str payload?TargetAgent
                   Byname =
                    (if isNull payload?Byname then
                         str payload?TargetAgent
                     else
                         str payload?Byname)
                   CanonicalRole = roleOf (str payload?CanonicalRole)
                   Ownership =
                    match str payload?Ownership with
                    | "HostOwnedHidden" -> HandleOwnership.HostOwnedHidden
                    | _ -> HandleOwnership.DurableParentHandle |}
        | "Attention", "DeferredWorkRecorded" ->
            AgentFact.Attention(
                AttentionFactCases.DeferredWorkRecorded
                    {| SessionId = sessionIdOf (payload?SessionId)
                       OccurrenceId = str payload?OccurrenceId
                       Text = str payload?Text |}
            )
        | "Attention", "DeferredWorkConsumed" ->
            AgentFact.Attention(
                AttentionFactCases.DeferredWorkConsumed
                    {| SessionId = sessionIdOf (payload?SessionId)
                       OccurrenceIds = unbox<string array> (payload?OccurrenceIds) |> Array.toList |}
            )
        | _ -> failwith $"JournalSurface: unknown AgentFact {family}.{case}"

    let private streamOfJs (value: obj) : StreamId =
        match str (value?kind) with
        | "Session" -> StreamId.Session(sessionIdOf (value?session))
        | other -> failwith $"JournalSurface: unknown stream kind '{other}'"

    // ── obligation-ledger-004: read-only per-slice forwarders ─────────────
    // Each slice crosses as plain JS built only from public fields and
    // owner-provided accessors (Relay.Fold.view/roads, SessionStartedAtProjection
    // .startedAt); no private representation is destructured outside its owner.

    let private companionSliceToJs (state: CompanionProjection) : obj =
        box {| bloggerSessionId = state.BloggerSessionId |> Option.map SessionId.value |> Option.toObj |}

    let private xTraceSliceToJs (state: XTraceProjectionState) : obj =
        box
            {| openingPresent = XTraceProjection.openingEvidence state |> Option.isSome
               partCount = XTraceProjection.orderedSemanticParts state |> List.length
               latestTerminalPresent = XTraceProjection.latestTerminalEvidence state |> Option.isSome |}

    let private blogSliceToJs (state: BlogProjectionState) : obj =
        box
            {| frameEpochId = FrameEpochId.value state.FrameEpochId
               frameCount = BlogProjection.frameCount state
               ingestedThroughSequence = state.Coverage.IngestedThroughSequence |}

    let private prefixEpochSliceToJs (epoch: ActivePrefixEpoch) : obj =
        box
            {| epochId = PrefixEpochId.value epoch.EpochId
               snapshotPresent = epoch.Snapshot |> Option.isSome |}

    let private handleIdText (handleId: HandleId) =
        match handleId with
        | HandleId.Agent id -> "agent:" + AgentHandleId.value id
        | HandleId.Pty id -> "pty:" + PtyHandleId.value id
        | HandleId.ManagerJob id -> "manager-job:" + ManagerJobId.value id

    let private handlesToJs (state: AgentLinkageProjection) : obj =
        box
            {| handleCount = Map.count state.Handles
               nextCreationOrder = state.NextCreationOrder
               workCount = Map.count state.Works
               legacyWorkHandleCount = Set.count state.LegacyWorkHandles
               handles =
                state.Handles
                |> Map.toList
                |> List.map (fun (handleId, record) ->
                    box
                        {| handle = handleIdText handleId
                           childSessionId = SessionId.value record.ChildSessionId
                           targetAgent = record.TargetAgent
                           byname = record.Byname
                           creationOrder = record.CreationOrder |})
                |> List.toArray |}

    let private providerFailuresToJs (state: ProviderFailureProjection) : obj =
        box
            {| logicalRun = LogicalRunId.value state.LogicalRunId
               authorityRoot = AuthorityRootUserMessageId.value state.AuthorityRootUserMessageId
               consecutiveFailureCount = state.Budget.ConsecutiveFailureCount
               recentFailureKeyCount = state.RecentFailureKeys.Length
               exhausted = state.Exhausted |}

    let private authorityProfileToJs (profile: PromptAuthority.AuthorityExecutionProfile) : obj =
        box
            {| session = SessionId.value profile.SessionId
               logicalRun = LogicalRunId.value profile.LogicalRunId
               authorityRoot = AuthorityRootUserMessageId.value profile.AuthorityRootUserMessageId
               authorityKind =
                match profile.AuthorityKind with
                | PromptAuthority.RootAuthorityKind.HumanRoot -> "HumanRoot"
                | PromptAuthority.RootAuthorityKind.AgentOwnerRoot -> "AgentOwnerRoot" |}

    let private promptAuthorityToJs (state: PromptAuthority.PromptAuthorityProjection) : obj =
        box
            {| activeLogicalRun = state.ActiveLogicalRun |> Option.map authorityProfileToJs |> Option.toObj
               lastAuthorityProfile = state.LastAuthorityProfile |> Option.map authorityProfileToJs |> Option.toObj
               pendingClaimCount = Map.count state.PendingClaims
               acceptedDispatchCount = Map.count state.AcceptedDispatches
               physicalLandingCount = Map.count state.PhysicalLandings
               acceptedContinuationCount = Map.count state.AcceptedContinuationIds
               claimSequenceKeys = state.ClaimSequences |> Map.toList |> List.map fst |> List.toArray |}

    let private enforcementToJs (state: EnforcementProjectionState) : obj =
        box
            {| cycleCount = Map.count state.ByProviderRun
               cycles =
                state.ByProviderRun
                |> Map.toList
                |> List.map (fun (providerRun, record) ->
                    box
                        {| providerRun = ProviderRunIdentity.value providerRun
                           mainSessionId = SessionId.value record.MainSessionId
                           bloggerSessionId = SessionId.value record.BloggerSessionId
                           tipRuleId = record.TipRuleId
                           toolCallCount = List.length record.ToolCallIds |})
                |> List.toArray
               recentTips =
                state.RecentTips
                |> List.map (fun tip ->
                    box
                        {| ruleId = tip.RuleId
                           fieldName = tip.FieldName
                           cycleId = tip.CycleId |})
                |> List.toArray |}

    let private bloggerCyclesToJs (state: BloggerCycleProjectionState) : obj =
        box
            {| receiptCount = Map.count state.ByProviderRun
               receiptRuns =
                state.ByProviderRun
                |> Map.toList
                |> List.map (fst >> ProviderRunIdentity.value)
                |> List.toArray
               openRequestCount = Map.count state.OpenByRequestId
               openByBloggerCount = Map.count state.OpenByBlogger
               providerRunByRequestIdCount = Map.count state.ProviderRunByRequestId |}

    let private relayToJs (state: RelayState) : obj =
        let roadViewToJs roadId (road: RoadView) =
            box
                {| roadId = RoadId.value roadId
                   iterationOrdinal = road.IterationOrdinal
                   authorityRevisionCount = List.length road.AuthorityRevisions
                   authorityMessageIdCount = List.length road.AuthorityMessageIds
                   activeIncumbencyPresent = road.ActiveIncumbency |> Option.isSome
                   retiredIncumbencyCount = List.length road.RetiredIncumbencies
                   certificatePresent = road.Certificate |> Option.isSome
                   latestRetirementPresent = road.LatestRetirement |> Option.isSome
                   boundDevOps = road.BoundDevOps |> Option.toObj |}

        let roadIds = Wanxiangshu.Mission.Relay.Fold.roads state

        box
            {| roadCount = List.length roadIds
               roads =
                roadIds
                |> List.map (fun roadId ->
                    Wanxiangshu.Mission.Relay.Fold.view state roadId
                    |> Option.map (roadViewToJs roadId)
                    |> Option.toObj)
                |> List.toArray |}

    let private guidelinesToJs (state: GuidelineProjectionState) : obj =
        box
            {| pairCount = List.length state.Pairs
               callIds = state.CallIds |> Set.toList |> List.toArray
               placementCount = Set.count state.Placements
               visibleFromOrdinal = state.VisibleFromOrdinal
               pairs =
                state.Pairs
                |> List.map (fun pair ->
                    box
                        {| ordinal = pair.Ordinal
                           callId = ToolCallId.value pair.CallId
                           markerText = pair.MarkerText |})
                |> List.toArray |}

    let private requirementGroundingToJs (state: RequirementGroundingProjectionState) : obj =
        box
            {| pendingCount = Map.count state.Pending
               occurrenceCount = List.length state.OccurrencesRev
               visibleMaterialCount = Set.count state.VisibleMaterials
               readObservations =
                state.ObservedReads
                |> Set.toArray
                |> Array.map (fun read ->
                    box
                        {| workspace = read.Workspace
                           path = read.Path
                           digest = read.Digest
                           coverage =
                            match read.Coverage with
                            | Wanxiangshu.Requirement.Grounding.GroundingReadCoverage.CompleteFile -> "CompleteFile"
                            | Wanxiangshu.Requirement.Grounding.GroundingReadCoverage.PartialFile -> "PartialFile" |})
               visibleFromOrdinal = state.VisibleFromOrdinal |}

    let private tipDeliveryToJs (state: TipDeliveryProjectionState) : obj =
        box
            {| deliveredOccurrences = state.DeliveredOccurrences |> Set.toList |> List.toArray
               coveredTipNames = state.CoveredTipNames |> Set.toList |> List.toArray |}

    let private sessionStartedAtToJs (state: SessionStartedAtProjectionState) : obj =
        box {| startedAt = (SessionStartedAtProjection.startedAt state).ToString("o") |}

    let private delegatedToolEstimateToJs (state: DelegatedToolEstimateProjectionState) : obj =
        box
            {| remaining = state.Remaining
               countedToolCallCount = Set.count state.CountedToolCalls |}

    let private sessionSlicesToJs (session: SessionAgentProjection) : obj =
        box
            {| companion = session.Companion |> Option.map companionSliceToJs |> Option.toObj
               xTrace = session.XTrace |> Option.map xTraceSliceToJs |> Option.toObj
               blog = session.Blog |> Option.map blogSliceToJs |> Option.toObj
               prefixEpoch = session.PrefixEpoch |> Option.map prefixEpochSliceToJs |> Option.toObj
               handles = session.Handles |> Option.map handlesToJs |> Option.toObj
               providerFailures = session.ProviderFailures |> Option.map providerFailuresToJs |> Option.toObj
               promptAuthority = session.PromptAuthority |> Option.map promptAuthorityToJs |> Option.toObj
               enforcement = session.Enforcement |> Option.map enforcementToJs |> Option.toObj
               bloggerCycles = session.BloggerCycles |> Option.map bloggerCyclesToJs |> Option.toObj
               relay = session.Relay |> Option.map relayToJs |> Option.toObj
               guidelines = session.Guidelines |> Option.map guidelinesToJs |> Option.toObj
               requirementGrounding =
                session.RequirementGrounding
                |> Option.map requirementGroundingToJs
                |> Option.toObj
               tipDelivery = session.TipDelivery |> Option.map tipDeliveryToJs |> Option.toObj
               sessionStartedAt = session.SessionStartedAt |> Option.map sessionStartedAtToJs |> Option.toObj
               delegatedToolEstimate =
                session.DelegatedToolEstimate
                |> Option.map delegatedToolEstimateToJs
                |> Option.toObj |}

    let private projectionToJs (projection: ProjectionSet) : obj =
        let sessions =
            projection.AgentProjections.Sessions
            |> Map.toList
            |> List.map (fun (sessionId, _) -> SessionId.value sessionId)
            |> List.toArray

        let todoCheckpoints =
            projection.AgentProjections.TodoCheckpoints
            |> Map.toList
            |> List.map (fun (sessionId, window) ->
                box
                    {| sessionId = SessionId.value sessionId
                       checkpoints =
                        window.Checkpoints
                        |> List.map (fun checkpoint -> box {| callId = ToolCallId.value checkpoint.ToolCallId |})
                        |> List.toArray |})
            |> List.toArray

        let sessionProjections =
            projection.AgentProjections.Sessions
            |> Map.toList
            |> List.map (fun (sessionId, session) -> SessionId.value sessionId, sessionSlicesToJs session)
            |> createObj

        box
            {| sessions = sessions
               todoCheckpoints = todoCheckpoints
               sessionProjections = sessionProjections |}

    let private journalOrError (writer: IJournalWriter) (init: Envelope) (projection: ProjectionSet) : obj =
        match AgentJournal.createFromProjection writer projection with
        | Ok journal ->
            box
                {| ok = true
                   journal = JournalHandle.Create(journal)
                   localSeq = LocalSeq.value init.LocalSeq |}
        | Error error ->
            box
                {| ok = false
                   error = $"{error.Fact}: {error.Reason}" |}

    let private bootResult (result: Result<IJournalWriter * Envelope * ProjectionSet, FoldRejection>) : obj =
        match result with
        | Ok(writer, init, projection) -> journalOrError writer init projection
        | Error error ->
            box
                {| ok = false
                   error = $"{error.Fact}: {error.Reason}" |}

    /// Acquire the plugin's process-local workspace journal through the same
    /// runtime-path owner as the composition root. The returned capability is
    /// ref-counted and must be released with `dispose`; no journal internals
    /// cross this boundary.
    let acquireSharedForWorkspace (workspace: string) (processId: int) (startedAt: string) : Task<obj> =
        task {
            let commonDirectory = RuntimePath.gitCommonDir workspace
            let runtimeDirectory = RuntimePath.forWorkspace workspace

            let openJournal (runtimeId: RuntimeId) processIdValue processStartedAt =
                task {
                    let integrator =
                        CanonicalIntegrator.createWithRules
                            CanonicalIntegrator.baseRules
                            AuthoritativeEventTypes.isKnown

                    let store =
                        EventStore.createLocal commonDirectory (Guid.NewGuid().ToString("N")) integrator

                    let! result =
                        EventStoreJournalWriter.resumeOrCreate (runtimeId, processIdValue, processStartedAt, store)

                    return
                        match result with
                        | Ok(writer, _, projection) -> AgentJournal.createFromProjection writer projection
                        | Error error -> Error error
                }

            let! result =
                SharedAgentJournal.acquire runtimeDirectory processId (DateTimeOffset.Parse startedAt) openJournal

            match result with
            | Ok journal ->
                return
                    box
                        {| ok = true
                           journal = JournalHandle.CreateShared journal |}
            | Error error ->
                return
                    box
                        {| ok = false
                           error = $"{error.Fact}: {error.Reason}" |}
        }

    /// Open a workspace journal directly. The returned journal is an opaque
    /// capability and must be released with `dispose`.
    let bootWithWriterId
        (commonDir: string)
        (writerId: string)
        (runtimeId: string)
        (processId: int)
        (startedAt: string)
        : Task<obj> =
        task {
            let integrator =
                CanonicalIntegrator.createWithRules CanonicalIntegrator.baseRules AuthoritativeEventTypes.isKnown

            let store = EventStore.createLocal (str commonDir) (str writerId) integrator

            let! result =
                EventStoreJournalWriter.resumeOrCreate (
                    RuntimeId.create (str runtimeId),
                    processId,
                    DateTimeOffset.Parse(str startedAt),
                    store
                )

            return bootResult result
        }

    /// Open a journal with an anonymous process writer.
    let boot (commonDir: string) (runtimeId: string) (processId: int) (startedAt: string) : Task<obj> =
        bootWithWriterId commonDir (Guid.NewGuid().ToString("N")) runtimeId processId startedAt

    /// Release a journal capability and reject future operations on it.
    let dispose (handle: JournalHandle) : unit = handle.Dispose()

    /// Runtime identity is a plain diagnostic value; the journal remains opaque.
    let runtimeId (handle: JournalHandle) : string =
        AgentJournal.runtimeId handle.Journal |> RuntimeId.value

    let pendingDeferredWork (handle: JournalHandle) (session: string) : obj =
        (AgentJournal.snapshot handle.Journal).AgentProjections.Attention
        |> AttentionProjection.pending (SessionId.create session)
        |> List.map (fun item ->
            box
                {| occurrence = item.OccurrenceId
                   text = item.Text |})
        |> List.toArray
        |> box

    let deferredWorkWasConsumed (handle: JournalHandle) (session: string) occurrence : bool =
        (AgentJournal.snapshot handle.Journal).AgentProjections.Attention
        |> AttentionProjection.wasConsumed (SessionId.create session) occurrence

    let concernView (handle: JournalHandle) address recipient : obj =
        let state = (AgentJournal.snapshot handle.Journal).AgentProjections.Concern

        let mailbox =
            state.Mailboxes
            |> Map.tryFind address
            |> Option.map (fun mailbox ->
                box
                    {| id = mailbox.Id
                       concern = mailbox.Concern
                       generation = mailbox.Generation
                       owner = SessionId.value mailbox.OwnerSessionId
                       active = mailbox.Active |})
            |> Option.defaultValue null

        let prepared =
            Wanxiangshu.Interaction.Concern.ConcernProjection.prepareFragments (SessionId.create recipient) state

        box
            {| mailbox = mailbox
               pendingOccurrenceIds = prepared.Batch.DeliveredMessages |> List.toArray
               pendingMessages =
                prepared.Messages
                |> List.map (fun (id, message) -> box {| id = id; message = message |})
                |> List.toArray |}

    /// Append an agent fact and return a normalized projection summary.
    let appendAgent (handle: JournalHandle) (stream: obj) (run: obj) (fact: obj) : Task<obj> =
        task {
            let! result =
                AgentJournal.appendAgent (streamOfJs stream) (providerRunOf run) (agentFactOfJs fact) handle.Journal

            return
                match result with
                | Ok projection ->
                    box
                        {| ok = true
                           projection = projectionToJs projection |}
                | Error error ->
                    box
                        {| ok = false
                           error = error.ToString() |}
        }

    let appendManagerLifecycle (handle: JournalHandle) (stream: obj) (factObj: obj) : Task<obj> =
        let sessionId =
            match str (stream?kind) with
            | "Session" -> sessionIdOf (stream?session)
            | _ -> SessionId.create (str stream)

        let payload = unbox<obj> factObj?payload
        let textRef = str payload?OpeningTextRef
        let textDigest = str payload?OpeningTextDigest

        appendAgent
            handle
            stream
            (box null)
            (box
                {| family = "Companion"
                   case = "TerminalOutputCaptured"
                   payload =
                    {| SessionId = box (SessionId.value sessionId)
                       TextRef = textRef
                       TextDigest = textDigest |} |})

    /// Write a UTF-8 payload through the journal's local payload owner.
    let writePayload (handle: JournalHandle) (content: string) : Task<obj> =
        task {
            let! result = handle.Journal.Writer.BlobWriter.Write(str content)

            return
                match result with
                | Ok receipt ->
                    box
                        {| ok = true
                           blobRef = BlobRef.value receipt.BlobRef
                           blobDigest = BlobDigest.value receipt.BlobDigest |}
                | Error error -> box {| ok = false; error = error |}
        }

    /// Read a payload by its opaque `blobs/<digest>` reference.
    let readPayload (handle: JournalHandle) (reference: string) : Task<obj> =
        task {
            let! result = handle.Journal.Writer.BlobWriter.Read(BlobRef.create (str reference))

            return
                match result with
                | Ok text -> box {| ok = true; content = text |}
                | Error error -> box {| ok = false; error = error |}
        }

    /// Current projection summary; no F# record crosses the boundary.
    let snapshot (handle: JournalHandle) : obj =
        AgentJournal.snapshot handle.Journal |> projectionToJs

    /// Keyed session lookup over the current projection.
    let hasSession (handle: JournalHandle) (sessionId: string) : bool =
        AgentProjection.tryFind
            (SessionId.create (str sessionId))
            (AgentJournal.snapshot handle.Journal).AgentProjections
        |> Option.isSome
