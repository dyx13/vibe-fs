namespace Wanxiangshu.OpenCode.Host

module ReliabilityDiagnosticsSurface =
    val redactText: value: string -> string
    val diagnosticsVisible: unit -> bool
    val projectTyped: record: CausalDiagnosticRecord -> obj
    val projectRecord: value: obj -> obj
    val tryEmit: value: obj -> bool
    val emitKnownFailure: value: obj -> unit
    val createCounters: unit -> obj
    val recordObservation: handle: obj -> observation: string -> unit
    val snapshot: handle: obj -> obj
    val queryReliability: handle: obj -> executions: obj array -> capacity: obj -> recovery: obj -> obj
