namespace Wanxiangshu.Interaction.Dispatch

open System
open System.Threading.Tasks
open Wanxiangshu.Composition.Turn
open Wanxiangshu.Context.Companion
open Wanxiangshu.Context.Prefix
open Wanxiangshu.Context.Trace
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Interaction.Authority
open Wanxiangshu.OpenCode
open Wanxiangshu.Participant.Provider.Attempt
open Wanxiangshu.Participant.Provider.Attempt.Fallback
open Wanxiangshu.Participant.Provider.Projection

[<RequireQualifiedAccess>]
type PrefixPresentationHorizon =
    | Current
    | TentativeCold

type XWireReconciliationDecision =
    { Promoted: bool
      Cleared: bool
      KeptPlan: bool }

module PrefixWorkflow =

    let mayProbe (budget: ProviderFailureBudget.FailureBudget) : bool = budget.ConsecutiveFailureCount > 0

    let presentationHorizonForProbe (hasProbe: bool) : PrefixPresentationHorizon =
        if hasProbe then
            PrefixPresentationHorizon.TentativeCold
        else
            PrefixPresentationHorizon.Current

    let reconciliationDecision
        (hasPlan: bool)
        (outcome: AttemptOutcome option)
        (hasPromotableProbe: bool)
        (probeEpochMatches: bool)
        : XWireReconciliationDecision =
        match hasPlan, outcome with
        | false, _ ->
            { Promoted = false
              Cleared = false
              KeptPlan = false }
        | true, Some AttemptOutcome.Completed ->
            { Promoted = hasPromotableProbe && probeEpochMatches
              Cleared = true
              KeptPlan = false }
        | true, Some AttemptOutcome.CompletedInvalid
        | true, Some AttemptOutcome.Failed
        | true, Some AttemptOutcome.Aborted ->
            { Promoted = false
              Cleared = true
              KeptPlan = false }
        | true, None ->
            { Promoted = false
              Cleared = false
              KeptPlan = true }

    let private sessionIdOfOutput (output: obj) : SessionId option =
        ProviderWireDecode.projectionSessionIdFromMessages output
        |> Option.map SessionId.create

    let private requireOk (result: Result<'a, string>) : 'a =
        match result with
        | Ok value -> value
        | Error reason -> raise (InvalidOperationException reason)

    /// Prefix coverage is expressed only in canonical XTrace semantic-turn
    /// coordinates. A positional legacy trace is insufficient proof and fails
    /// closed instead of silently interpreting a provider-array index as history.
    let private providerRetryOrigin =
        PromptAuthority.originLabel (
            PromptAuthority.PromptOrigin.Continuation PromptAuthority.ContinuationKind.ProviderRetryAttempt
        )

    let private isProviderRetryAttempt (rawMessage: obj) =
        ProviderWireDecode.promptOriginOfMessage rawMessage = Some providerRetryOrigin

    let private isProviderRetryMessageId (messageId: string) (rawMessages: obj list) =
        rawMessages
        |> List.exists (fun message ->
            ProviderWireDecode.hostMessageId message = Some messageId
            && isProviderRetryAttempt message)

    /// context-compression-028/029: how many turns precede the message this request
    /// answers, in canonical XTrace coordinates.
    ///
    /// That message is the newest one in the trace — a loop's later provider steps
    /// answer their own assistant/tool history. Reading the trailing user message
    /// instead would pin the bound at the turn that opened the loop (0 for the whole
    /// of a single-user-message session) and forbid every fold inside it.
    let private requestStartCutoff (xTrace: XTraceProjectionState) : int =
        XTraceProjection.frontierTurn xTrace |> Option.defaultValue 0

    let private staleProviderRetryMessageIds (rawMessages: obj list) =
        let currentPhysical =
            ProviderWireCapture.lastUserMessageId rawMessages
            |> Option.map PhysicalUserMessageId.value

        rawMessages
        |> List.choose (fun message ->
            match ProviderWireDecode.hostMessageId message with
            | Some messageId when isProviderRetryAttempt message && Some messageId <> currentPhysical -> Some messageId
            | _ -> None)
        |> Set.ofList

    let retryTransportRetirement (horizon: PrefixPresentationHorizon) (rawMessages: obj list) =
        match horizon with
        | PrefixPresentationHorizon.Current -> Set.empty
        | PrefixPresentationHorizon.TentativeCold -> staleProviderRetryMessageIds rawMessages

    let replacePrefixByHostIds
        (rawMessages: obj list)
        (coveredHostMessageIds: string list)
        (openingHostMessageId: string option)
        (syntheticMessageId: string)
        (memory: string)
        =
        ProjectionMessageEdit.replacePrefixByHostIds
            rawMessages
            coveredHostMessageIds
            openingHostMessageId
            syntheticMessageId
            memory

    let suppressHostMessagesByIds (rawMessages: obj list) (hostMessageIds: Set<string>) =
        ProjectionMessageEdit.suppressHostMessagesByIds rawMessages hostMessageIds

    /// context-compression-028: the boundary selected by the fixed-K window of
    /// successful todowrite checkpoints.
    let internal checkpointWindowDesire (state: WireSessionState) : int option =
        let xTrace = state.XTrace |> Option.defaultValue XTraceProjection.empty

        match
            PhaseWindow.desiredCutoffOf
                (fun callId -> XTraceProjection.tryTurnOfToolCallId callId xTrace)
                state.TodoCheckpoints
        with
        | PhaseWindowDecision.KeepFrom cutoffExclusive -> Some cutoffExclusive
        | PhaseWindowDecision.NoPhases -> None

    let private readFrozenRecordPrefixBody
        (port: WireJournalPort)
        (choice: XProjectionChoice)
        (committed: PrefixSnapshot option)
        : Task<string> =
        match XPrefixProjection.requiredBlob choice committed with
        | None -> Task.FromResult ""
        | Some blobRef ->
            task {
                let! body = port.Candidate.ReadBlob blobRef
                return requireOk body
            }

    let private requireStableReplacement
        (activation: PrefixActivation)
        (xTrace: XTraceProjectionState)
        : string list * string option =
        let coveredHostMessageIds =
            XTraceProjection.hostMessageIdsBeforeTurn activation.CutoffExclusive xTrace

        if activation.CutoffExclusive > 0 && List.isEmpty coveredHostMessageIds then
            raise (
                InvalidOperationException
                    "X-wire cannot replace a covered prefix without stable canonical XTrace message identities"
            )

        let openingHostMessageId = XTraceProjection.tryOpeningHostMessageId xTrace

        if activation.CutoffExclusive > 0 && Option.isNone openingHostMessageId then
            raise (
                InvalidOperationException
                    "X-wire cannot place same-session memory without the stable raw Opening identity"
            )

        coveredHostMessageIds
        |> List.filter (fun messageId -> Some messageId <> openingHostMessageId),
        openingHostMessageId

    let private applyPrefix (state: WireSessionState) (rawMessages: obj list) (intent: PrefixProjectionIntent) =
        match XPrefixProjection.render intent with
        | PrefixRendered.Physical -> rawMessages
        | PrefixRendered.Synthetic activation ->
            let xTrace = state.XTrace |> Option.defaultValue XTraceProjection.empty

            let replaceableHostMessageIds, openingHostMessageId =
                requireStableReplacement activation xTrace

            ProjectionMessageEdit.replacePrefixByHostIds
                rawMessages
                replaceableHostMessageIds
                openingHostMessageId
                activation.SyntheticMessageId
                activation.Memory

    let private renderPrefixMessages
        (state: WireSessionState)
        (rawMessages: obj list)
        (intent: PrefixProjectionIntent)
        (horizon: PrefixPresentationHorizon)
        =
        // A retry row that was visible in a tentative-cold provider request is
        // now part of that new horizon's physical prefix even though it is not X
        // semantics. Retiring it on the very next ordinary request would shrink
        // the provider wire. Historical retry rows may therefore retire only as
        // part of a later real cold presentation; Current must be byte-preserving.
        let staleTransport = retryTransportRetirement horizon rawMessages

        applyPrefix state rawMessages intent
        |> fun prefixed -> ProjectionMessageEdit.suppressHostMessagesByIds prefixed staleTransport

    let private commitPromotablePrefixRebase
        (port: WireJournalPort)
        (sessionId: SessionId)
        (providerRun: ProviderRunIdentity)
        (plan: AttemptPlan)
        : Task<Result<unit, string>> =
        task {
            let view = port.ReadView sessionId

            let epoch =
                view.State
                |> Option.bind (fun state -> state.PrefixEpoch)
                |> Option.defaultValue PrefixEpochProjection.empty

            let promotableProbe = AttemptPlanner.promotableProbe plan AttemptOutcome.Completed

            let decision =
                reconciliationDecision
                    true
                    (Some AttemptOutcome.Completed)
                    (Option.isSome promotableProbe)
                    (promotableProbe
                     |> Option.exists (fun probe -> epoch.EpochId = probe.BasedOnEpochId))

            match promotableProbe, decision.Promoted with
            | Some probe, true ->
                let fact =
                    {| SessionId = sessionId
                       PreviousEpochId = probe.BasedOnEpochId
                       NextEpochId = PrefixEpochId.next probe.BasedOnEpochId
                       FrozenRecordPrefixRef = probe.Candidate.FrozenRecordPrefixRef
                       FrozenRecordPrefixDigest = probe.Candidate.FrozenRecordPrefixDigest
                       CutoffExclusive = probe.Candidate.CutoffExclusive
                       CoveredPrefixDigest = probe.Candidate.CoveredPrefixDigest
                       SealRoot = probe.Candidate.SealRoot
                       SyntheticMessageId = probe.Candidate.SyntheticMessageId
                       ProbeId = probe.ProbeId
                       SolvingProviderRun = providerRun |}

                return! port.CommitPrefixRebase sessionId providerRun fact
            | _ -> return Ok()
        }

    let private recordSuccessfulAttempt
        (port: WireJournalPort)
        (sessionId: SessionId)
        (providerRun: ProviderRunIdentity)
        (plan: AttemptPlan)
        : Task<Result<unit, string>> =
        if ProviderRequestKind.clearsFailureCountOnSuccess plan.Profile.RequestKind then
            port.RecordConfirmedSuccess sessionId providerRun
        else
            Task.FromResult(Ok())

    let private settleAttemptPlan
        (port: WireJournalPort)
        (attempts: AttemptPlanCapability)
        (sessionId: SessionId)
        (providerRun: ProviderRunIdentity)
        (outcome: AttemptOutcome)
        (plan: AttemptPlan)
        : Task =
        task {
            let! committed =
                match outcome with
                | AttemptOutcome.Completed -> commitPromotablePrefixRebase port sessionId providerRun plan
                | AttemptOutcome.CompletedInvalid
                | AttemptOutcome.Failed
                | AttemptOutcome.Aborted -> Task.FromResult(Ok())

            committed
            |> Result.mapError (fun reason -> sprintf "prefix rebase commit failed: %s" reason)
            |> requireOk
            |> ignore

            let! success =
                match outcome with
                | AttemptOutcome.Completed -> recordSuccessfulAttempt port sessionId providerRun plan
                | AttemptOutcome.CompletedInvalid
                | AttemptOutcome.Failed
                | AttemptOutcome.Aborted -> Task.FromResult(Ok())

            success
            |> Result.mapError (fun reason -> sprintf "provider success commit failed: %s" reason)
            |> requireOk
            |> ignore

            attempts.ConsumeAttemptPlan sessionId providerRun |> ignore
        }

    let private toolContinuationBinding
        (rawMessage: obj)
        : (ProviderRunIdentity * PhysicalUserMessageId option) option =
        let info = ProviderWireDecode.infoObject rawMessage

        match
            ProviderWireDecode.firstString info [ "role" ],
            ProviderWireDecode.firstString info [ "finish" ],
            ProviderWireDecode.hostMessageId rawMessage
        with
        | Some role, Some finish, Some providerRun when
            role.Equals("assistant", StringComparison.OrdinalIgnoreCase)
            && finish.Equals("tool-calls", StringComparison.OrdinalIgnoreCase)
            ->
            let physical =
                ProviderWireDecode.firstString info [ "parentID" ]
                |> Option.map PhysicalUserMessageId.create

            Some(ProviderRunIdentity.create providerRun, physical)
        | _ -> None

    let private settleVisibleToolContinuation
        (port: WireJournalPort)
        (attempts: AttemptPlanCapability)
        (sessionId: SessionId)
        (providerRun: ProviderRunIdentity)
        (physical: PhysicalUserMessageId option)
        : Task =
        let plan =
            match attempts.TryAttemptPlan sessionId providerRun with
            | Some existing -> Some existing
            | None ->
                physical
                |> Option.bind (fun parent -> attempts.TryBindAttemptPlan sessionId parent providerRun)

        match plan with
        | None -> Task.FromResult(())
        | Some plan -> settleAttemptPlan port attempts sessionId providerRun AttemptOutcome.Completed plan

    let private settleVisibleToolContinuations
        (port: WireJournalPort)
        (attempts: AttemptPlanCapability)
        (sessionId: SessionId)
        (rawMessages: obj list)
        : Task =
        task {
            for providerRun, physical in rawMessages |> List.choose toolContinuationBinding |> List.distinct do
                do! settleVisibleToolContinuation port attempts sessionId providerRun physical
        }

    let private applyCommittedPrefix
        (presentation: PrefixPresentationPort)
        (port: WireJournalPort)
        (sessionId: SessionId)
        (state: WireSessionState)
        (rawMessages: obj list)
        (output: obj)
        : Task<unit> =
        task {
            let prefix = state.PrefixEpoch |> Option.defaultValue PrefixEpochProjection.empty

            match prefix.Snapshot with
            | None ->
                // Even before the first Y epoch exists, XWire still owns the Host
                // transport membrane. Otherwise every ordinary request between
                // failed probes would accumulate all prior ProviderRetryAttempt
                // rows and undo the recovery cleanup.
                let transformed =
                    renderPrefixMessages state rawMessages PrefixProjectionIntent.Keep PrefixPresentationHorizon.Current

                presentation.ReplaceMessages output transformed
            | Some committed ->
                let choice = XProjectionChoice.UseCommittedEpoch
                let! frozenRecordPrefixBody = readFrozenRecordPrefixBody port choice (Some committed)

                let intent =
                    XPrefixProjection.forChoice
                        choice
                        (Some committed)
                        (presentation.MemoryPreamble sessionId)
                        frozenRecordPrefixBody

                let transformed =
                    renderPrefixMessages state rawMessages intent PrefixPresentationHorizon.Current

                presentation.ReplaceMessages output transformed
        }

    let private applyOrdinaryCommittedPrefix
        (presentation: PrefixPresentationPort)
        (port: WireJournalPort)
        (sessionId: SessionId)
        (state: WireSessionState option)
        (rawMessages: obj list)
        (output: obj)
        : Task =
        match state with
        | None -> raise (InvalidOperationException "X-wire cannot apply a committed prefix without session projection")
        | Some s -> applyCommittedPrefix presentation port sessionId s rawMessages output

    let private authoritySummary (authority: PromptAuthority.AuthorityExecutionProfile) =
        sprintf
            "session=%s logical=%s root=%s kind=%A participant=%s role=%s"
            (SessionId.value authority.SessionId)
            (LogicalRunId.value authority.LogicalRunId)
            (AuthorityRootUserMessageId.value authority.AuthorityRootUserMessageId)
            authority.AuthorityKind
            authority.SelectedAgent
            (Roles.roleLabel authority.CanonicalRole)

    let private requireAdmittedPendingPlan
        (attempts: AttemptPlanCapability)
        (sessionId: SessionId)
        (physical: PhysicalUserMessageId)
        (pendingPlan: PendingAttemptPlan)
        : PendingAttemptPlan =
        match attempts.FreezePendingAttemptPlan sessionId physical pendingPlan with
        | PendingAttemptPlanAdmission.Admitted plan -> plan
        | PendingAttemptPlanAdmission.ReplayedExisting plan -> plan
        | PendingAttemptPlanAdmission.PlanConflict(existing, attempted) when
            PendingAttemptPlanAdmission.sameRequestIdentity existing attempted
            ->
            existing
        | PendingAttemptPlanAdmission.PlanConflict(existing, attempted) ->
            raise (
                InvalidOperationException(
                    sprintf
                        "HOST-BOUNDARY-008: pending attempt plan conflict: existing=(%s) attempted=(%s)"
                        (authoritySummary existing.Authority)
                        (authoritySummary attempted.Authority)
                )
            )
        | PendingAttemptPlanAdmission.IdentityMismatch(expectedSession, expectedPhysical, attempted) ->
            raise (
                InvalidOperationException(
                    sprintf
                        "HOST-BOUNDARY-008: pending attempt plan identity mismatch: expectedSession=%A expectedPhysical=%A attempted=%A"
                        expectedSession
                        expectedPhysical
                        attempted
                )
            )

    let private buildCandidate (window: ProbeBound) (port: WireJournalPort) sessionId (state: WireSessionState) =
        task {
            let xTrace = state.XTrace |> Option.defaultValue XTraceProjection.empty
            let prefix = state.PrefixEpoch |> Option.defaultValue PrefixEpochProjection.empty
            let! currentResult = port.CurrentProjection xTrace
            let current = requireOk currentResult
            let cutoff = requestStartCutoff xTrace
            let snapshot = { CurrentProjection = current }

            return!
                PrefixMaterialization.candidate port.Candidate window sessionId snapshot prefix.Snapshot state cutoff
        }

    /// CTX-029: recovery may fold past the phase window — a failed WorkMain is the
    /// explicit exception, and it is recorded as a Probe cold boundary when promoted.
    let private prepareRetryCandidate allowProbe (port: WireJournalPort) sessionId (state: WireSessionState) =
        if not allowProbe then
            Task.FromResult(Error NoCandidateReason.NoCoverage)
        else
            buildCandidate ProbeBound.CoverageOnly port sessionId state

    /// Render one admitted prefix plan: the choice inside it is the whole decision, so
    /// the blob it needs is read through `requiredBlob` rather than re-derived here.
    let private renderAdmittedPlan
        (presentation: PrefixPresentationPort)
        (port: WireJournalPort)
        (sessionId: SessionId)
        (state: WireSessionState)
        (rawMessages: obj list)
        (plan: PendingAttemptPlan)
        (output: obj)
        : Task =
        task {
            let! frozenRecordPrefixBody =
                readFrozenRecordPrefixBody port plan.ProjectionChoice plan.CommittedPrefixSnapshot

            let prefixIntent =
                XPrefixProjection.forChoice
                    plan.ProjectionChoice
                    plan.CommittedPrefixSnapshot
                    (presentation.MemoryPreamble sessionId)
                    frozenRecordPrefixBody

            let horizon =
                presentationHorizonForProbe (Option.isSome (AttemptPlanner.pendingProbeOf plan))

            let transformed = renderPrefixMessages state rawMessages prefixIntent horizon

            presentation.ReplaceMessages output transformed
        }

    /// CTX-010: the probe is part of the immutable profile, so the plan is frozen before
    /// anything is rendered; CTX-011 promotes it only when the attempt settles as
    /// successful.
    let private admitPhaseBoundaryPlan
        (attempts: AttemptPlanCapability)
        (sessionId: SessionId)
        (physicalId: PhysicalUserMessageId)
        (authority: PromptAuthority.AuthorityExecutionProfile)
        (state: WireSessionState)
        (origin: PromptAuthority.PromptOrigin)
        (probe: PrefixProbe)
        : Task<PendingAttemptPlan> =
        let pendingPlan =
            AttemptPlanner.freezePreInference
                authority
                physicalId
                origin
                ProviderRequestKind.WorkMain
                (state.PrefixEpoch |> Option.bind (fun prefix -> prefix.Snapshot))
                true
                (fun () -> Ok probe)

        requireAdmittedPendingPlan attempts sessionId physicalId pendingPlan
        |> Task.FromResult

    /// The window spoke and the attempt may fold: freeze the probe into the plan, or
    /// project the committed prefix when no probe could be built.
    let private renderPhaseBoundaryAttempt
        (presentation: PrefixPresentationPort)
        (port: WireJournalPort)
        (attempts: AttemptPlanCapability)
        (sessionId: SessionId)
        (physicalId: PhysicalUserMessageId)
        (authority: PromptAuthority.AuthorityExecutionProfile)
        (state: WireSessionState)
        (origin: PromptAuthority.PromptOrigin option)
        (candidateResult: Result<PrefixProbe, NoCandidateReason>)
        (output: obj)
        (rawMessages: obj list)
        : Task<PrefixPresentationHorizon> =
        task {
            match candidateResult, origin with
            | Ok probe, Some accepted ->
                let! admitted = admitPhaseBoundaryPlan attempts sessionId physicalId authority state accepted probe

                do! renderAdmittedPlan presentation port sessionId state rawMessages admitted output
                return presentationHorizonForProbe true
            | _ ->
                do! applyCommittedPrefix presentation port sessionId state rawMessages output
                return PrefixPresentationHorizon.Current
        }

    /// context-compression-028: a committed phase opened a window, so this ordinary
    /// attempt may carry the probe that folds up to its boundary.
    ///
    /// Inside a phase the window cannot move — the desire is derived from committed
    /// phases alone, so two requests in the same phase project the same committed
    /// prefix, byte for byte. The new prefix becomes durable only when this attempt
    /// settles as successful (CTX-011/012); nothing is written up front, and a failed
    /// attempt leaves the committed epoch exactly as it was.
    let private planPhaseBoundaryPrefix
        (presentation: PrefixPresentationPort)
        (port: WireJournalPort)
        (attempts: AttemptPlanCapability)
        (sessionId: SessionId)
        (physical: PhysicalUserMessageId option)
        (view: WireSnapshotView)
        (output: obj)
        (rawMessages: obj list)
        : Task<PrefixPresentationHorizon> =
        task {
            // Flattened: the F# control-pyramid gate forbids a match inside an arm, so the
            // window desire is bound first and each refusal path returns on its own.
            let desired = view.State |> Option.bind checkpointWindowDesire

            match view.State, view.ActiveAuthorityProfile, physical, desired with
            | Some state, Some authority, Some physicalId, Some desiredCutoff ->
                let! candidateResult = buildCandidate (ProbeBound.PhaseBoundary desiredCutoff) port sessionId state

                return!
                    renderPhaseBoundaryAttempt
                        presentation
                        port
                        attempts
                        sessionId
                        physicalId
                        authority
                        state
                        (view.AcceptedOrigin physicalId)
                        candidateResult
                        output
                        rawMessages
            | Some state, _, _, _ ->
                do! applyCommittedPrefix presentation port sessionId state rawMessages output
                return PrefixPresentationHorizon.Current
            | None, _, _, _ ->
                do! applyOrdinaryCommittedPrefix presentation port sessionId view.State rawMessages output
                return PrefixPresentationHorizon.Current
        }

    let private pendingPlanForRetry
        (attempts: AttemptPlanCapability)
        (sessionId: SessionId)
        (physical: PhysicalUserMessageId)
        (authority: PromptAuthority.AuthorityExecutionProfile)
        : PendingAttemptPlan option =
        match attempts.TryPendingAttemptPlan sessionId physical with
        | Some existing when existing.Authority = authority -> Some existing
        | Some existing ->
            raise (
                InvalidOperationException(
                    sprintf
                        "HOST-BOUNDARY-008: pending attempt plan authority conflict: existing=(%s) current=(%s)"
                        (authoritySummary existing.Authority)
                        (authoritySummary authority)
                )
            )
        | None -> None

    let private planOrBuildRetry
        (port: WireJournalPort)
        (attempts: AttemptPlanCapability)
        (sessionId: SessionId)
        (physical: PhysicalUserMessageId)
        (authority: PromptAuthority.AuthorityExecutionProfile)
        (failure: ProviderFailureProjection)
        (state: WireSessionState)
        (prefix: ActivePrefixEpoch)
        (existingPlan: PendingAttemptPlan option)
        : Task<PendingAttemptPlan> =
        match existingPlan with
        | Some existing -> Task.FromResult existing
        | None ->
            task {
                // The retry transport row survives a successful tool step.
                // Its presence does not authorize another cold prefix.
                let allowProbe = mayProbe failure.Budget

                let! candidateResult = prepareRetryCandidate allowProbe port sessionId state

                let selectProbeForPlan () = candidateResult

                let pendingPlan =
                    AttemptPlanner.freezePreInference
                        authority
                        physical
                        (PromptAuthority.PromptOrigin.Continuation PromptAuthority.ContinuationKind.ProviderRetryAttempt)
                        ProviderRequestKind.WorkMain
                        prefix.Snapshot
                        allowProbe
                        selectProbeForPlan

                // Freeze pending plan BEFORE rendering or modifying wire output.
                return requireAdmittedPendingPlan attempts sessionId physical pendingPlan
            }

    let private planProviderRetry
        (presentation: PrefixPresentationPort)
        (port: WireJournalPort)
        (attempts: AttemptPlanCapability)
        (sessionId: SessionId)
        (physical: PhysicalUserMessageId)
        (output: obj)
        (rawMessages: obj list)
        : Task<PrefixPresentationHorizon> =
        task {
            let view = port.ReadView sessionId

            match view.ActiveAuthorityProfile, view.ProviderFailureState, view.State with
            | Some authority, Some failure, Some state ->
                let prefix = state.PrefixEpoch |> Option.defaultValue PrefixEpochProjection.empty

                let existingPlan = pendingPlanForRetry attempts sessionId physical authority

                let! admittedPlan =
                    planOrBuildRetry port attempts sessionId physical authority failure state prefix existingPlan

                let presentationHorizon =
                    admittedPlan
                    |> AttemptPlanner.pendingProbeOf
                    |> Option.isSome
                    |> presentationHorizonForProbe

                // `requiredBlob` is the single answer to "which blob does this choice
                // need" — the adapter reads, never guesses (CTX-010: reading the
                // COMMITTED blob for a probe attempt would inject the old prefix under
                // the candidate's id).
                let! frozenRecordPrefixBody =
                    readFrozenRecordPrefixBody port admittedPlan.ProjectionChoice admittedPlan.CommittedPrefixSnapshot

                let prefixIntent =
                    XPrefixProjection.forChoice
                        admittedPlan.ProjectionChoice
                        admittedPlan.CommittedPrefixSnapshot
                        (presentation.MemoryPreamble sessionId)
                        frozenRecordPrefixBody

                let transformed =
                    renderPrefixMessages state rawMessages prefixIntent presentationHorizon

                presentation.ReplaceMessages output transformed
                return presentationHorizon

            | _ ->
                return
                    raise (
                        InvalidOperationException
                            "X-wire cannot plan a retry without authority, failure, and session projections"
                    )
        }

    let private applyNonReplicaTransform
        (presentation: PrefixPresentationPort)
        (port: WireJournalPort)
        (attempts: AttemptPlanCapability)
        (sessionId: SessionId)
        (output: obj)
        : Task<PrefixPresentationHorizon> =
        task {
            let rawMessages = ProviderWireDecode.messagesFromTransformOutput output
            let physical = ProviderWireCapture.lastUserMessageId rawMessages

            // A successful probe may have ended with tool calls. That provider
            // attempt is complete even though the Host turn continues through the
            // tool loop. Settle it before reading PrefixEpoch for this request.
            do! settleVisibleToolContinuations port attempts sessionId rawMessages

            let recoveryAttempt =
                physical
                |> Option.filter (fun p ->
                    let physicalId = PhysicalUserMessageId.value p
                    isProviderRetryMessageId physicalId rawMessages)

            match recoveryAttempt with
            | None ->
                let view = port.ReadView sessionId
                return! planPhaseBoundaryPrefix presentation port attempts sessionId physical view output rawMessages
            | Some physical ->
                return! planProviderRetry presentation port attempts sessionId physical output rawMessages
        }

    let private applySessionTransform
        (presentation: PrefixPresentationPort)
        (isReplicaSession: SessionId -> bool)
        (port: WireJournalPort)
        (attempts: AttemptPlanCapability)
        (sessionId: SessionId)
        (output: obj)
        : Task<PrefixPresentationHorizon> =
        task {
            if isReplicaSession sessionId then
                return PrefixPresentationHorizon.Current
            else
                return! applyNonReplicaTransform presentation port attempts sessionId output
        }

    let applyTransform
        (isReplicaSession: SessionId -> bool)
        (presentation: PrefixPresentationPort)
        (port: WireJournalPort option)
        (attempts: AttemptPlanCapability)
        (output: obj)
        : Task<PrefixPresentationHorizon> =
        task {
            match port, sessionIdOfOutput output with
            | Some p, Some sessionId when (p.ReadView sessionId).IsCompanion |> not ->
                return! applySessionTransform presentation isReplicaSession p attempts sessionId output
            | _ -> return PrefixPresentationHorizon.Current
        }

    let private attemptOutcomeOfTurn (turn: ReconciledTurn) : AttemptOutcome option =
        match turn.Observation, turn.Outcome with
        | Some _, _ -> None
        | None, ReconcileProgram.TurnCompleted -> Some AttemptOutcome.Completed
        | None, ReconcileProgram.TurnInProgress -> Some AttemptOutcome.Completed
        | None, ReconcileProgram.TurnNeedsContinuation _ -> Some AttemptOutcome.CompletedInvalid
        | None, ReconcileProgram.TurnFailed _ -> Some AttemptOutcome.Failed
        | None, ReconcileProgram.TurnAborted _ -> Some AttemptOutcome.Aborted

    let private reconcilePlannedAttempt
        (port: WireJournalPort)
        (attempts: AttemptPlanCapability)
        (turn: ReconciledTurn)
        (plan: AttemptPlan)
        : Task =
        let outcome = attemptOutcomeOfTurn turn
        let decision = reconciliationDecision true outcome false false

        match outcome, decision.Cleared with
        | Some settled, true -> settleAttemptPlan port attempts turn.SessionId turn.ProviderRun settled plan
        | _ -> Task.FromResult(())

    let private attemptPlanForTurn (attempts: AttemptPlanCapability) (turn: ReconciledTurn) =
        attempts.TryAttemptPlan turn.SessionId turn.ProviderRun
        |> Option.orElseWith (fun () ->
            attempts.TryBindAttemptPlan turn.SessionId turn.PhysicalUserMessageId turn.ProviderRun)

    let private plannedReconciliation
        (port: WireJournalPort option)
        (attempts: AttemptPlanCapability)
        (turn: ReconciledTurn)
        =
        port
        |> Option.bind (fun p -> attemptPlanForTurn attempts turn |> Option.map (fun plan -> p, plan))

    /// Settle the physical provider attempt, not the larger Host turn.
    /// `finish=tool-calls` therefore closes a successful attempt plan while the
    /// Host tool loop continues; only a genuinely provisional snapshot keeps it.
    let reconcileAttempt
        (port: WireJournalPort option)
        (attempts: AttemptPlanCapability)
        (turn: ReconciledTurn)
        : Task =
        match plannedReconciliation port attempts turn with
        | Some(p, plan) -> reconcilePlannedAttempt p attempts turn plan
        | None -> Task.FromResult(())
