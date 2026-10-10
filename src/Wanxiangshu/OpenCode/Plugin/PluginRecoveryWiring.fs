namespace Wanxiangshu.OpenCode

open System
open Wanxiangshu.Context.Companion.Blogger.Runtime
open Wanxiangshu.Context.Companion.Blogger
open Wanxiangshu.Execution.Session.ChatExecution
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Composition.Durable
open Wanxiangshu.Execution.Delegation
open Wanxiangshu.Mission.Relay
open Wanxiangshu.OpenCode.Host
open Wanxiangshu.Persistence.Journal

module PluginRecoveryWiring =

    let private isFlightActive
        (bloggerHost: IBloggerRuntimeHost)
        (bloggerSessionId: SessionId)
        (requestId: BloggerRequestId)
        : bool =
        match bloggerHost.TryGetFlight(SessionId.value bloggerSessionId) with
        | Some flight -> BloggerRequestContext.requestId flight = requestId
        | None -> false

    let private seedDevOpsTarget roadSessionId childSessionId target =
        try
            ModelRouting.seedBoundDevOpsModel childSessionId target
        with ex ->
            invalidOp (
                sprintf
                    "execution-model-routing-019: seeding the fixed DevOps target failed (road session %s, devops session %s, target '%s'): %s"
                    (SessionId.value roadSessionId)
                    (SessionId.value childSessionId)
                    target
                    ex.Message
            )

    /// Seed every road's fixed DevOps target into the process-shared routing
    /// table from the durable road projection (execution-model-routing-019).
    ///
    /// The authority chain is durable end to end: the road projection holds the
    /// target string, the road session's handle projection resolves the DevOps
    /// child session, and ModelRouting owns the binding. A road without a bound
    /// target is skipped; a malformed one is refused by the parser rather than
    /// replaced by the current scheduler preference.
    let private seedBoundDevOpsModelTargets (journal: AgentJournal) =
        let snapshot = AgentJournal.snapshot journal

        for KeyValue(sessionId, projection) in snapshot.AgentProjections.Sessions do
            let target =
                projection.Relay
                |> Option.bind (fun state -> Fold.view state (RoadId.create (SessionId.value sessionId)))
                |> Option.bind (fun view -> view.BoundDevOpsModelTarget)

            let child =
                projection.Handles
                |> Option.bind (HandleProjection.tryFindByByname "devops")
                |> Option.map (fun handle -> handle.ChildSessionId)

            Option.map2 (seedDevOpsTarget sessionId) child target |> ignore

    let attach (boot: PluginBoot.Boot) : unit =
        let scope = boot.Scope

        // Restart dropped the process-local execution bindings; the durable
        // handle records are the evidence for which parented children a road
        // still owns, so its fixed DevOps can be dispatched to again
        // (crash-reconciliation-020).
        match boot.Journal with
        | Some journal -> SessionBindingRecovery.install journal
        | None -> ()

        scope.AttachDurabilityActivation(fun () ->
            scope.RunBackground(fun () ->
                task {
                    // crash-reconciliation-020: settle the child work runs the
                    // previous runtime left active, so the next handoff to that
                    // child is a fresh root instead of a refused identity.
                    match boot.Journal with
                    | Some journal ->
                        do! ChildWorkRecovery.settleOrphanedChildRuns journal

                        // ... and the Blog materializations it left open. No live
                        // execution can own one, and while it stays open the
                        // coordinator never materializes a fresh request — the
                        // Blogger would never ingest the raw tail again
                        // (crash-reconciliation-020 / context-compression-024).
                        let bloggerHost = scope.BloggerRuntimeHost
                        let liveFlight = isFlightActive bloggerHost

                        do! BloggerAbandon.settleStaleOpenAtLoad liveFlight journal
                    | None -> ()

                    do! scope.SignalChatRecovery(ChatExecutionRecoveryLifecycleEvent.PluginRuntimeReloaded)

                    do! scope.SignalChatRecovery(ChatExecutionRecoveryLifecycleEvent.CapacityProjectionReplayed)

                    // execution-model-routing-019: reseed each road's fixed DevOps
                    // model target from the durable road projection. Restart dropped
                    // the process-local binding; without this the first Normal
                    // admission would take the target from the current scheduler
                    // preference and silently overwrite the road's fixed one.
                    match boot.Journal with
                    | Some journal -> seedBoundDevOpsModelTargets journal
                    | None -> ()

                    // crash-reconciliation-018: the load-phase normalization above owes
                    // one restart status guidance to the next real user instruction.
                    scope.MarkRestartGuidancePending()
                }))
