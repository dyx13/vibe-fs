namespace Wanxiangshu.OpenCode

/// Bounded command execution. Provider verb: `run` (DevOps).
module ExecutorTool =

    [<RequireQualifiedAccess>]
    module Path =
        [<RequireQualifiedAccess>]
        module Run =
            [<Literal>]
            val Description: string = "tool/run/description"

            [<Literal>]
            val ArgCommand: string = "tool/run/arg-command"

            [<Literal>]
            val ArgDeadlineSeconds: string = "tool/run/arg-deadline_seconds"

            [<Literal>]
            val ArgOutputBudgetBytes: string = "tool/run/arg-output_budget_bytes"

            [<Literal>]
            val ArgWorldLock: string = "tool/run/arg-world_lock"

            [<Literal>]
            val MissingCommand: string = "tool/run/missing-command"

            [<Literal>]
            val FinitePositive: string = "tool/run/finite-positive"

            [<Literal>]
            val FiniteNonNegativeInteger: string = "tool/run/finite-non-negative-integer"

            [<Literal>]
            val MustBeInteger: string = "tool/run/must-be-integer"

            [<Literal>]
            val Timeout: string = "tool/run/timeout"

            [<Literal>]
            val SpawnFailed: string = "tool/run/spawn-failed"

            [<Literal>]
            val Cancelled: string = "tool/run/cancelled"

            [<Literal>]
            val ExecutionFailed: string = "tool/run/execution-failed"

            [<Literal>]
            val CannotRunFromContext: string = "tool/run/cannot-run-from-context"

            [<Literal>]
            val CannotReadOutputUntilAuthority: string = "tool/run/cannot-read-output-until-authority"

            [<Literal>]
            val OutputTruncated: string = "tool/run/output-truncated"

            [<Literal>]
            val LargeOutputRecoveryBlocked: string = "tool/run/large-output-recovery-blocked"

    /// Provider-visible bounded execution with raw, explicitly truncated output.
    [<Literal>]
    val RunToolName: string = "run"

    type Request =
        { Command: string
          DeadlineSeconds: float
          OutputBudgetBytes: int64
          WorldLock: bool }

    val runAdmission: ToolAdmission
    val runSpec: factory: HostToolFactory -> scope: ToolRuntimeScope -> ToolSpec

    val internal formatSpooledOutcome: exitCode: int -> output: string -> string
