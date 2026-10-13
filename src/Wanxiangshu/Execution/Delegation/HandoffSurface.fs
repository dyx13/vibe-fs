namespace Wanxiangshu.Execution.Delegation

open Wanxiangshu.Context.Trace

[<RequireQualifiedAccess>]
module HandoffSurface =

    let private rangeView (range: XTraceRange) =
        box
            {| start = range |> XTraceRange.startInclusive |> XTraceCursor.sequence |> int
               ``end`` = range |> XTraceRange.endExclusive |> XTraceCursor.sequence |> int |}

    let handoffWindow (previousEnd: obj) (currentEnd: int) : obj =
        let previous =
            if isNull previousEnd then
                None
            else
                Some(string previousEnd |> int64 |> XTraceCursor.create)

        let handoff =
            DelegationHandoff.window previous (currentEnd |> int64 |> XTraceCursor.create)

        box
            {| start = handoff.Range |> XTraceRange.startInclusive |> XTraceCursor.sequence |> int
               ``end`` = handoff.Range |> XTraceRange.endExclusive |> XTraceCursor.sequence |> int
               isInitial = handoff.IsInitial |}

    let childRange (startInclusive: int) (endExclusive: int) : obj =
        DelegationHandoff.childRange
            (startInclusive |> int64 |> XTraceCursor.create)
            (endExclusive |> int64 |> XTraceCursor.create)
        |> rangeView
