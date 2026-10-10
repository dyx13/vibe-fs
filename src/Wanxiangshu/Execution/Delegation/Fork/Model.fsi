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
    | DispatchUncertain of agentId: string
    | NotFound of agentId: string

[<RequireQualifiedAccess>]
type ForkError =
    | Empty
    | NothingToJoin
    | Cancelled
    | JoinInProgress
    | Abandoned of agentId: string * reason: string
    | NotFound of agentId: string
    | TimedOut
    | TerminalMaterializationFailed of agentId: string

type PtyRecord =
    { PtyId: string
      Command: string
      StartedAt: DateTimeOffset }

type AgentRecord =
    { AgentId: string
      Agent: string
      Role: Role
      Status: AgentStatus
      CurrentRunId: string option
      TerminalStatusLabel: string option
      CompletionCellSettled: bool
      ChildSessionId: SessionId option }
