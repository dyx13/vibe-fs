namespace Wanxiangshu.Mission.Relay.OpenCode

open System.Threading.Tasks
open Wanxiangshu.OpenCode

/// relay-assessment-011: the Manager backend of the shared `review` shell.
/// Owns the relay assessment binding, transaction and failure paths; the
/// shell (ReviewShell) dispatches to it for every non-Plan caller.
module ReviewBackendManager =

    /// Semantic prose paths used by the Manager backend's result rendering.
    /// The shell owns the spec-facing paths (description, findings argument).
    [<RequireQualifiedAccess>]
    module Path =
        [<Literal>]
        val Finish: string = "runtime/manager-finish"

        [<Literal>]
        val Work: string = "runtime/manager-work"

        [<Literal>]
        val BindingUnavailable: string = "tool/review/binding-unavailable"

        [<Literal>]
        val MissingRequest: string = "tool/review/missing-request"

        [<Literal>]
        val InvalidFindings: string = "tool/review/invalid-findings"

        [<Literal>]
        val RecordFailed: string = "tool/review/record-failed"

        [<Literal>]
        val ReplayConflict: string = "tool/review/replay-conflict"

        [<Literal>]
        val AlreadySubmitted: string = "tool/review/already-submitted"

    val execute: scope: ToolRuntimeScope -> args: HostToolArguments -> context: HostToolContext -> Task<string>
