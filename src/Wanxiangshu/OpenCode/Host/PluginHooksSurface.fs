namespace Wanxiangshu.OpenCode

open System.Threading.Tasks
open Fable.Core
open Fable.Core.JsInterop
open Wanxiangshu.Context.Companion
open Wanxiangshu.Context.Companion.Blogger
open Wanxiangshu.Context.Companion.Blogger.Runtime
open Wanxiangshu.Execution.Failure
open Wanxiangshu.Execution.Session.Attachment
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Interaction.Dispatch
open Wanxiangshu.Participant.Provider
open Wanxiangshu.OpenCode.Host
open Wanxiangshu.Persistence.Journal
open Wanxiangshu.Persistence.EventStore
open Wanxiangshu.Strength
open Wanxiangshu.Strength.OpenCode
open Wanxiangshu.Strength.Persistence

module PluginHooksSurface =

    let private replaySettlementObservation (boot: PluginBoot.Boot) (failure: exn option) : obj =
        let fuseReason = boot.StrengthScope.StrengthFuseReason |> Option.toObj

        match failure with
        | Some(:? StrengthAppendException as error) ->
            box
                {| completed = false
                   typedFailure = true
                   eventId = EventId.value error.EventId
                   cause = AppendError.cause error.Failure |> Option.toObj
                   matchesAppendError = fun (expected: obj) -> obj.ReferenceEquals(box error.Failure, expected)
                   fuseReason = fuseReason |}
        | Some error ->
            box
                {| completed = false
                   typedFailure = false
                   error = error
                   fuseReason = fuseReason |}
        | None ->
            box
                {| completed = true
                   typedFailure = false
                   fuseReason = fuseReason |}

    /// Observe the actual Boot fuse through Prepared request consumption in Replay.
    let replaySettlementThroughBoot (input: obj) (store: obj) (completed: bool) : Task<obj> =
        task {
            let! boot = PluginBoot.create input
            // DSL-MUTABLE: algorithm-scratch — preserve the real Replay exception through owner cleanup.
            let mutable failure: exn option = None

            try
                let assistant: SessionMessage =
                    { Id = "run-1"
                      Role = "assistant"
                      Agent = Some "engineer"
                      Finish = Some "stop"
                      ErrorName = None
                      Model = None
                      ParentId = Some "user-1"
                      CreatedAt = None
                      Completed = completed
                      IsCompaction = false
                      PromptKey = None
                      Parts = [| MessagePart.Text "completed provider output" |]
                      PartIds = [| None |]
                      ToolParts = [||] }

                let snapshots =
                    { new ISessionSnapshotPort with
                        member _.GetMessages _ = Task.FromResult(Ok [ assistant ]) }

                let durability = StrengthDurability.create (unbox<EventStoreHandle> store).Store

                let! _ =
                    StrengthReplay.applyBeforeXTrace
                        None
                        (Some snapshots)
                        (Some durability)
                        boot.StrengthFailFuse
                        (fun _ -> None)
                        (Some "owner")
                        (box {| messages = ([||]: obj array) |})

                ()
            with error ->
                failure <- Some error

            try
                do! boot.Scope.DisposeAsync()
            with cleanup ->
                match failure with
                | Some primary ->
                    raise (System.AggregateException("Replay and Boot cleanup failed", [| primary; cleanup |]))
                | None -> raise cleanup

            return replaySettlementObservation boot failure
        }

    /// Opaque Host-owned observation for the Blogger adapter proof.
    type BloggerAdapterObservation private (first: string, second: string) =
        member internal _.First = first
        member internal _.Second = second

        static member internal Create(first, second) =
            BloggerAdapterObservation(first, second)

    let policyAwareHook operation (adaptedHook: obj) : obj =
        PluginHostInterop.policyAwareHook operation adaptedHook

    /// Classify a thrown JS value through the real failure membrane and expose
    /// the normalized outcome fields (failure kind, lifecycle, settlement
    /// evidence, whether hook args proved an owned execution).
    let normalizeHookFailureOutcome (args: obj) (context: obj) (error: obj) : obj =
        let outcome = PluginHostInterop.normalizeHookFailure args context error

        box
            {| failure = sprintf "%A" outcome.Failure
               lifecycle = sprintf "%A" outcome.Lifecycle
               settlement = sprintf "%A" outcome.Settlement
               hasExecutionKey = outcome.ExecutionKey.IsSome |}

    let decorateReviewToolDefinition (toolID: string) (definition: obj) : unit =
        ManagerReviewContract.decorateDefinition (box {| toolID = toolID |}) definition

    let hookFailurePolicy failure settlement : string =
        let typedFailure =
            match failure with
            | "LocalInvariant" -> ExecutionFailure.LocalInvariant
            | "ProtocolRejection" -> ExecutionFailure.ProtocolRejection
            | "UserCancelled" -> ExecutionFailure.UserCancelled
            | "Superseded" -> ExecutionFailure.Superseded
            | "CapacityQueueFull" -> ExecutionFailure.CapacityQueueFull
            | "AcceptanceUnknown" -> ExecutionFailure.AcceptanceUnknown
            | "PersistenceNotCommitted" -> ExecutionFailure.PersistenceFailure PersistenceCommitment.NotCommitted
            | "PersistenceCommitted" -> ExecutionFailure.PersistenceFailure PersistenceCommitment.Committed
            | "PersistenceUnknown" -> ExecutionFailure.PersistenceFailure PersistenceCommitment.Unknown
            | other -> invalidArg "failure" $"unknown hook proof failure '{other}'"

        let settlementEvidence =
            match settlement with
            | "NoOwnedExecution" -> PluginHostInterop.HookSettlementEvidence.NoOwnedExecution
            | "ExactSettlementComplete" -> PluginHostInterop.HookSettlementEvidence.ExactSettlementComplete
            | "DurableOutcomeUnknown" -> PluginHostInterop.HookSettlementEvidence.DurableOutcomeUnknown
            | "SettlementIncomplete" -> PluginHostInterop.HookSettlementEvidence.SettlementIncomplete
            | other -> invalidArg "settlement" $"unknown hook proof settlement '{other}'"

        let lifecycle =
            match settlementEvidence with
            | PluginHostInterop.HookSettlementEvidence.NoOwnedExecution -> DurableExecutionLifecycle.NoAcceptedFact
            | PluginHostInterop.HookSettlementEvidence.ExactSettlementComplete -> DurableExecutionLifecycle.Terminal
            | PluginHostInterop.HookSettlementEvidence.DurableOutcomeUnknown
            | PluginHostInterop.HookSettlementEvidence.SettlementIncomplete ->
                DurableExecutionLifecycle.AcceptedBeforeProvider

        let outcome: PluginHostInterop.HookFailureOutcome =
            { Failure = typedFailure
              Lifecycle = lifecycle
              ExecutionKey = None
              Settlement = settlementEvidence }

        match PluginHostInterop.interpretHookFailure outcome with
        | PluginHostInterop.HookFailurePolicy.RethrowUnchanged -> "RethrowUnchanged"
        | PluginHostInterop.HookFailurePolicy.FatalAfterSettlement -> "FatalAfterSettlement"
        | PluginHostInterop.HookFailurePolicy.RejectFatalBeforeSettlement -> "RejectFatalBeforeSettlement"

    let private effectLabel =
        function
        | BloggerCoordinator.DecisionEffect.Started -> "Started"
        | BloggerCoordinator.DecisionEffect.StartedSquash -> "StartedSquash"
        | BloggerCoordinator.DecisionEffect.OfferedParked -> "OfferedParked"
        | BloggerCoordinator.DecisionEffect.NoMaterial -> "NoMaterial"
        | BloggerCoordinator.DecisionEffect.SkippedInFlight -> "SkippedInFlight"
        | BloggerCoordinator.DecisionEffect.Sealed -> "Sealed"
        | BloggerCoordinator.DecisionEffect.StartFailed reason -> "StartFailed:" + reason
        | BloggerCoordinator.DecisionEffect.MaterializeFailed reason -> "MaterializeFailed:" + reason

    /// Real Coordinator -> CompanionHost -> PromptDispatcher Host adapter. The
    /// same frozen context is offered twice while one physical flight remains
    /// unresolved, proving the second decision stops before Host submission.
    let coordinateBloggerUnresolvedTwice
        (port: obj)
        (handle: JournalHandle)
        (mainSession: string)
        (bloggerSession: string)
        (requestId: string)
        : Task<BloggerAdapterObservation> =
        task {
            let scope = new PluginRuntimeScope(None, (fun _ -> false))
            let durable = AgentJournalCompanionPort handle.Journal :> ICompanionDurablePort
            let sessionPort = DispatchSurface.sessionPort port
            // managed-session-lifecycle-001: one lease registry for this isolated
            // scope's Companion kind.
            let satellites = CompanionLeaseRuntime(sessionPort, AttachmentLeaseRegistry())

            let host =
                new CompanionHost(
                    SessionId.create mainSession,
                    sessionPort,
                    durable = durable,
                    restoredBloggerId = bloggerSession,
                    journal = handle.Journal,
                    satelliteRuntime = satellites
                )

            let context =
                BloggerRequestContext.Squash(
                    match
                        BloggerRequestMaterial.createSquash
                            { RequestId =
                                BloggerRequestContext.squashRequestId
                                    (SessionId.create mainSession)
                                    (SessionId.create bloggerSession)
                                    (FrameEpochId.create 1L)
                                    1
                                    [ BlobDigest.create "blogger-effect-frame" ]
                              MainSessionId = SessionId.create mainSession
                              BloggerSessionId = SessionId.create bloggerSession
                              FrameEpochId = FrameEpochId.create 1L
                              CoveredFrameCount = 1
                              FrameDigests = [ BlobDigest.create "blogger-effect-frame" ]
                              ObservedPrefixEpochId = PrefixEpochId.create 1L }
                    with
                    | Ok verified -> verified
                    | Error rejection ->
                        invalidOp (
                            sprintf "coordinateBloggerUnresolvedTwice staged an unverifiable context: %A" rejection
                        )
                )

            let! first =
                CompanionTransform.coordinateBloggerContext
                    satellites
                    scope.BloggerRuntimeHost
                    host
                    (Some handle.Journal)
                    context

            let! second =
                CompanionTransform.coordinateBloggerContext
                    satellites
                    scope.BloggerRuntimeHost
                    host
                    (Some handle.Journal)
                    context

            return BloggerAdapterObservation.Create(effectLabel first, effectLabel second)
        }

    let firstBloggerEffect (observation: BloggerAdapterObservation) = observation.First

    let secondBloggerEffect (observation: BloggerAdapterObservation) = observation.Second

    /// Run the real read-only delegation schema decoration for
    /// one tool id. Production gates this behind the Predictor configuration
    /// existence query; this surface entry calls the same contract function so
    /// the schema contract, idempotence, conflict rejection and bilingual
    /// prose can be proven without asserting on production enablement.
    let decorateReadonlyDelegationToolDefinition (toolID: string) (definition: obj) : unit =
        ReadonlyDelegationContract.decorateDefinition (box {| toolID = toolID |}) definition

    /// JS-boundary budget validation as a JS-native result:
    /// { ok = true; rounds = <int> } or { ok = false; error = <code> }.
    let readonlyDelegationBudgetOf (value: obj) : obj =
        match ReadonlyDelegationContract.tryReadonlyRoundBudget value with
        | Ok budget ->
            box
                {| ok = true
                   rounds = ReadonlyRoundBudget.value budget |}
        | Error message -> box {| ok = false; error = message |}

    [<Emit("Object.prototype.hasOwnProperty.call($0, $1)")>]
    let private hasOwn (target: obj) (key: string) : bool = jsNative

    [<Emit("Boolean($0 && typeof $0 === 'object' && !Array.isArray($0))")>]
    let private isPlainObject (value: obj) : bool = jsNative

    [<Emit("Array.prototype.slice.call(arguments)")>]
    let private getJsArguments () : obj array = jsNative

    /// self_note validation as a JS-native result:
    /// { ok = true; note = <string|null> } or { ok = false; error = <code> }.
    let readonlyDelegationSelfNoteOf (arguments: obj) : obj =
        let jsArgs = getJsArguments ()

        if jsArgs.Length = 0 then
            box
                {| ok = false
                   error = "InvalidArgumentObject" |}
        elif jsArgs.Length = 1 && not (isPlainObject jsArgs[0]) then
            box
                {| ok = false
                   error = "InvalidArgumentObject" |}
        else
            let target =
                if jsArgs.Length = 1 then
                    jsArgs[0]
                else
                    createObj [ "estimated_readonly_rounds", jsArgs[0]; "self_note", jsArgs[1] ]

            match InvestigationEstimateContract.parseParticipatingArguments target with
            | Ok(_, note) ->
                box
                    {| ok = true
                       note = note |> Option.toObj |}
            | Error err ->
                box
                    {| ok = false
                       error = InvestigationEstimateContract.errorCode err |}

    /// Production tool.execute.before calls the same hide: the business
    /// argument view drops both protocol fields while provider evidence keeps
    /// the saved descriptors under a private Symbol.
    let hideReadonlyDelegationArgs (args: obj) : unit = ReadonlyDelegationContract.hide args

    /// Production tool.execute.after calls the same restore: original
    /// property descriptors return to the args object; no-op when absent.
    let restoreReadonlyDelegationArgs (args: obj) : unit = ReadonlyDelegationContract.restore args
