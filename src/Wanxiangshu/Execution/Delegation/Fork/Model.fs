namespace Wanxiangshu.Execution.Delegation.Fork

open System
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity

[<RequireQualifiedAccess>]
type AgentStatus =
    | Idle
    | Busy
    | Interrupted
    | Closed

[<RequireQualifiedAccess>]
type ForkResult =
    | Created of agentId: string
    | Nudged of agentId: string
    /// Host may have physically accepted the new AgentOwnerRoot, but the send
    /// boundary could not prove it synchronously. Recovery owns the durable
    /// Pending claim; callers must not interpret this as permission to resend.
    | DispatchUncertain of agentId: string
    | NotFound of agentId: string

[<RequireQualifiedAccess>]
type ForkError =
    | Empty
    | NothingToJoin
    | Cancelled
    /// A second concurrent join is rejected instead of waiting on a wake that another join consumed.
    | JoinInProgress
    /// EXEC-009: durable HandleAbandoned — not joinable, not a hang.
    | Abandoned of agentId: string * reason: string
    | NotFound of agentId: string
    /// Join budget exhausted; durable projection still had no joinable handle.
    | TimedOut
    /// Child appeared idle/terminal on the wire but handle materialization failed.
    | TerminalMaterializationFailed of agentId: string

type PtyRecord =
    { PtyId: string
      Command: string
      StartedAt: DateTimeOffset }

/// DSL-state-combination: physical — this read-only runtime snapshot combines
/// status, active-run identity, and completion-cell state derived from the
/// process-local ChildRun resource; it is not a durable workflow cursor.
type AgentRecord =
    {
        AgentId: string
        /// Managed agent name. Required; empty is refused at reuse.
        Agent: string
        Role: Role
        Status: AgentStatus
        CurrentRunId: string option
        TerminalStatusLabel: string option
        CompletionCellSettled: bool
        ChildSessionId: SessionId option
    }
