namespace Wanxiangshu.OpenCode

open System.Threading.Tasks
open Wanxiangshu.Execution.Session.ChatExecution
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Persistence.Journal

/// Optional Host capability bound to exact already-accepted physical material.
/// Absence is not permission to create a replacement PromptClaim or resend text.
type ExactAcceptedMessageRecoveryPort =
    { ResumeAccepted: PreProviderResumeRequest -> Task<bool> }

type SessionRecoveryHost =
    new:
        journal: AgentJournal *
        snapshot: ISessionSnapshotPort *
        scope: PluginRecoveryScope *
        acceptedMessageRecovery: ExactAcceptedMessageRecoveryPort option ->
            SessionRecoveryHost

    member Signal: event: ChatExecutionRecoveryLifecycleEvent -> Task

    member SignalSession:
        sessionId: SessionId * eventOf: (ChatExecutionKey -> ChatExecutionRecoveryLifecycleEvent) -> Task

    member Drain: sessionId: SessionId -> Task

    member ResumePreProvider: request: PreProviderResumeRequest -> Task

    member Finalize: request: TerminalFinalizationRequest -> Task

    /// managed-chat-execution-015：exact provider 启动边界拒绝的报告入口。
    /// 返回值是该信号的可观察结局：`terminalized` | `already-terminal` |
    /// `no-execution` | `ignored`。
    member SettleProviderStartBoundaryRejected: key: ChatExecutionKey * reason: string -> Task<string>

    /// provider-attempt-recovery-024：加载期同源 stale Blogger execution 的定夺入口。
    /// 返回（本次定夺数, 该 session 已 terminal 数）；无 Accepted 的执行不伪造。
    member SettleStaleBloggerAcceptedExecutions: sessionId: SessionId -> Task<int * int>
