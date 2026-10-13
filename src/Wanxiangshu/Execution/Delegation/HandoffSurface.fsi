namespace Wanxiangshu.Execution.Delegation

[<RequireQualifiedAccess>]
module HandoffSurface =
    val handoffWindow: previousEnd: obj -> currentEnd: int -> obj
    val childRange: startInclusive: int -> endExclusive: int -> obj
