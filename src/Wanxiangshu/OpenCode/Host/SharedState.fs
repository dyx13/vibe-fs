namespace Wanxiangshu.OpenCode

open System.Collections.Generic
open System.Threading.Tasks
open Wanxiangshu.Context.Companion.Blogger
open Wanxiangshu.Context.Companion.Blogger.Runtime
open Wanxiangshu.Foundation.Identity

/// HOST-012: 跨实例共享状态——模块级单例，所有插件实例同一引用。
///
/// Host 的 `InstanceStore` 按 directory 实例化插件（worktree = 独立 project =
/// 第二个插件实例）。跨实例的 parent/directory registry 与 Blogger flight
/// 必须共享，否则 worktree 实例无法与 root 实例观察到同一物理会话家族。
///
/// 每实例独有（不得放进这里）：AgentJournal（独立 runtimeId 文件）、Companions、
/// OwnedSessions、UserMessageBindings、hook 订阅、每实例 NudgeSent（非 guard）。
module SharedState =

    // DSL-MUTABLE: resource — cross-instance session parent map
    let SessionParents = Dictionary<string, string>()
    // DSL-MUTABLE: resource — cross-instance session directory map
    let SessionDirectories = Dictionary<string, string>()

    /// DSL-cross-callback-proof: physical single-flight — all plugin instances share one exact-cut interruption and serialized follow-up effects.
    // DSL-MUTABLE: single-flight — stop results and follow-up Task tails retained until session deletion.
    let private providerAttemptStops =
        Dictionary<struct (SessionId * ProviderRunIdentity * ToolCallId), Task<unit> * Task<unit>>()

    let private settleProviderAttemptWork (completion: TaskCompletionSource<unit>) work : Task =
        task {
            try
                do! work ()
                completion.SetResult(())
            with error ->
                completion.SetException error
        }
        :> Task

    let runAfterProviderAttemptStopped
        (sessionId: SessionId)
        (providerRun: ProviderRunIdentity)
        (toolCallId: ToolCallId)
        (stop: unit -> Task<unit>)
        (afterStop: unit -> Task<unit>)
        : Task<unit> =
        let key = struct (sessionId, providerRun, toolCallId)

        let completion =
            TaskCompletionSource<unit>(TaskCreationOptions.RunContinuationsAsynchronously)

        let stopCompletion, stopTask, previous =
            lock providerAttemptStops (fun () ->
                match providerAttemptStops.TryGetValue key with
                | true, (stopped, tail) ->
                    providerAttemptStops.[key] <- (stopped, completion.Task)
                    None, stopped, tail
                | false, _ ->
                    let stopped =
                        TaskCompletionSource<unit>(TaskCreationOptions.RunContinuationsAsynchronously)

                    providerAttemptStops.Add(key, (stopped.Task, completion.Task))
                    Some stopped, stopped.Task, Task.FromResult(()))

        stopCompletion
        |> Option.iter (fun stopped -> settleProviderAttemptWork stopped stop |> ignore)

        settleProviderAttemptWork completion (fun () ->
            task {
                try
                    do! previous
                with _ ->
                    ()

                do! stopTask

                let stillOwned =
                    lock providerAttemptStops (fun () ->
                        match providerAttemptStops.TryGetValue key with
                        | true, (stopped, _) -> obj.ReferenceEquals(stopped, stopTask)
                        | false, _ -> false)

                if not stillOwned then
                    invalidOp "provider attempt stop ownership ended with session deletion"

                do! afterStop ()
            })
        |> ignore

        completion.Task

    let dropProviderAttemptStops (sessionId: SessionId) =
        lock providerAttemptStops (fun () ->
            let keys =
                providerAttemptStops.Keys
                |> Seq.filter (fun struct (session, _, _) -> session = sessionId)
                |> Seq.toArray

            for key in keys do
                providerAttemptStops.Remove key |> ignore)


    /// Physical Blogger flight ownership (TryGetFlight / ClaimCurrentRequest).
    ///
    /// Same cross-instance rule as SessionParents: the worktree plugin materializes
    /// the companion request (ClaimCurrentRequest) while the blogger session itself
    /// lives under the root workspace, so BlogTool runs on the root plugin instance.
    /// Per-instance flights made exact ownership lookup miss → AbortSession → no BlogObservationCommitted
    /// → Finality hung on journal-work-log (orchestrator-publish frontier).
    let BloggerFlightGate = obj ()
    // DSL-MUTABLE: resource — cross-instance blogger flight ownership registry
    let BloggerFlights = Dictionary<string, BloggerRequestContext>()
    // DSL-MUTABLE: resource — cross-instance per-Blogger materialization admission
    let BloggerMaterializationAdmission = BloggerMaterializationAdmission()

    /// Unit-test isolation only: production Dispose must not wipe cross-instance flights.
    let clearBloggerFlightsForTests () =
        lock BloggerFlightGate (fun () -> BloggerFlights.Clear())
