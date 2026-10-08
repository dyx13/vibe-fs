namespace Wanxiangshu.OpenCode

open System.Collections.Generic
open System.Threading.Tasks
open Wanxiangshu.Context.Companion.Blogger
open Wanxiangshu.Context.Companion.Blogger.Runtime
open Wanxiangshu.Foundation.Identity

/// HOST-012: cross-instance shared state — module-level singletons that all
/// plugin instances (root + worktree) read and write through the same
/// reference.
module SharedState =

    /// Cross-instance session parent map.
    val SessionParents: Dictionary<string, string>

    /// Cross-instance session directory map.
    val SessionDirectories: Dictionary<string, string>

    /// One physical interruption per exact cut, shared across root and worktree
    /// instances. Its success or failure survives every serialized follow-up;
    /// a failed follow-up never retries the interruption.
    val runAfterProviderAttemptStopped:
        sessionId: SessionId ->
        providerRun: ProviderRunIdentity ->
        toolCallId: ToolCallId ->
        stop: (unit -> Task<unit>) ->
        afterStop: (unit -> Task<unit>) ->
            Task<unit>

    /// Session deletion releases its retained stop Tasks and rejects queued work.
    /// Disposing one plugin instance must not drop another instance's owner.
    val dropProviderAttemptStops: sessionId: SessionId -> unit


    /// Gate object for blogger flight ownership.
    val BloggerFlightGate: obj

    /// Cross-instance blogger flight ownership registry.
    val BloggerFlights: Dictionary<string, BloggerRequestContext>

    /// Cross-instance per-Blogger materialization admission.
    val BloggerMaterializationAdmission: BloggerMaterializationAdmission

    /// Unit-test isolation only: production Dispose must not wipe cross-instance flights.
    val clearBloggerFlightsForTests: unit -> unit
