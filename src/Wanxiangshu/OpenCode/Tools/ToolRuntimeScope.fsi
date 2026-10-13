namespace Wanxiangshu.OpenCode

open System
open System.Collections.Generic
open Fable.Core
open System.Threading.Tasks
open Wanxiangshu.Change.Host
open Wanxiangshu.Context.Trace
open Wanxiangshu.Execution.Delegation
open Wanxiangshu.Execution.Delegation
open Wanxiangshu.Execution.Delegation.Fork.Host
open Wanxiangshu.Execution.Delegation.Handle
open Wanxiangshu.Execution.Session.Recovery.SessionRecovery
open Wanxiangshu.Execution.Session.Wait
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Interaction.Authority
open Wanxiangshu.Mission.Relay
open Wanxiangshu.Persistence.Journal

/// Owns every per-session tool runtime.
///
/// AGENT-007: Role comes from the Authority Root's CanonicalRole and nothing
/// else. The previous version consulted three sources in order — authority, a
/// per-session role cache, then the Host context's `agent` field — so a session
/// whose authority said Coder could still be gated as DevOps because a cache
/// entry or a message field said so. Two of the three are gone.
type ToolRuntimeScope =
    new:
        sessions: ISessionHostPort *
        waitObserver: IWaitObserver *
        rootWorkspace: IRootWorkspaceReader *
        journal: AgentJournal option *
        workspaceDirectory: string option *
        sessionParents: Dictionary<string, string> *
        currentPhysicalUserMessage: (string -> string option) *
        sessionDirectories: Dictionary<string, string> *
        onRunStarted: (SessionId -> Role -> string option -> unit) option *
        parentWorkRecordFor: (string -> Task<string option>) option *
        childWorkRecordFor: (string -> Task<string option>) option *
        snapshot: ISessionSnapshotPort option *
        cancelSignals: (SessionId seq -> unit) option *
        ?childWorkRecordForRun: (SessionId -> XTraceRange -> ProviderRunIdentity -> Task<string option>) *
        ?workRecordCapability: DelegationWorkRecordCapability *
        ?continueManagerLoop: (SessionId -> string -> Task<Result<unit, string>>) *
        ?captureWorktreeSnapshot: (WorktreePath -> Result<WorkspaceSnapshotId, string>) *
        ?eventPort: IEventObservationPort ->
            ToolRuntimeScope

    interface ISessionRuntimeOwner
    interface IDisposable

    member Sessions: ISessionHostPort
    member WaitObserver: IWaitObserver
    member RootWorkspace: IRootWorkspaceReader
    member Journal: AgentJournal option
    member Snapshot: ISessionSnapshotPort option
    member EventPort: IEventObservationPort option
    member WorkspaceDirectory: string option
    member ActiveProfileFor: sessionId: SessionId -> PromptAuthority.AuthorityExecutionProfile option
    /// Run-started callback wired by plugin bootstrap for Host child reconciliation.
    member RunStarted: (SessionId -> Role -> string option -> unit)

    /// EXEC-011: the administrator's ceiling on any single process.
    ///
    /// Resolved once per scope so every executor call in a session shares one
    /// ceiling. A non-positive or unparseable setting falls back to the default
    /// rather than being treated as "no limit": the clause requires the hard limit
    /// to be finite, so an unreadable configuration must not widen it.
    member ProcessHardLimit: TimeSpan

    member SessionParents: Dictionary<string, string>
    member CurrentPhysicalUserMessage: sessionId: string -> string option
    member DirectoryFor: sessionId: string -> string option
    member LogicalOwnerFor: sessionId: SessionId -> SessionId

    member RegisterPhysicalParent: sessionId: SessionId * parentId: SessionId option -> unit

    member ParentWorkRecordFor: sessionId: string -> Task<string option>
    member ChildWorkRecordFor: sessionId: string -> Task<string option>

    member RegisterDirectory: sessionId: string * path: string -> unit

    member RoleFor: ctx: HostToolContext -> Role option
    member EnsureRoleFor: ctx: HostToolContext -> Task<Role option>

    member EnsureCommandRoleFor:
        sessionId: SessionId * resolveAgent: (SessionId -> Task<string option>) -> Task<string option>

    static member emptyManagerFacts: ManagerCapabilityFacts
    member ManagerCapabilityFactsFor: sessionId: string -> ManagerCapabilityFacts
    member TryFreezeRetirement: sessionId: string * incumbentId: IncumbencyId -> bool
    member UnfreezeRetirement: sessionId: string -> unit
    member IsRetirementFrozen: sessionId: string -> bool
    member RetirementBlockersFor: sessionId: string -> string list

    /// AGENT-013 + PROMPT-008: the managed agent a PTY is opened for.
    member ManagedAgentFor: ctx: HostToolContext -> ManagedAgent option

    member IsRole: ctx: HostToolContext * expected: Role -> bool

    /// Wire PluginRuntimeScope.RequireCurrentProcessJoin (or test double).
    member AttachCurrentProcessJoin: fn: (SessionId -> Task<FamilyRecovery>) -> unit

    /// Wire current-process join recovery mode directly by string label ("ready", "waiting", or "blocked").
    member AttachCurrentProcessJoinMode: mode: string -> unit

    /// EXEC-017: share PluginRuntimeScope.JoinAttempts with JoinTool.
    member AttachJoinAttempts: registry: IJoinAttemptRegistry -> unit

    member JoinAttempts: IJoinAttemptRegistry

    /// Process-local join admission: join / JoinPublishedAvailable require FamilyReady. Missing attach → FamilyBlocked.
    member RequireCurrentProcessJoin: root: SessionId -> Task<FamilyRecovery>

    member RuntimeFor: ctx: HostToolContext -> Result<HostForkRuntime, string>
    member PtyCapabilityFor: ctx: HostToolContext -> Result<DelegationPtyCapability, string>

    member EnsureRoadDevOpsBound: parentSessionId: SessionId -> Task<unit>

    /// planning-023: spawn a parentless execution session (agent, no parentID)
    /// and deliver the init prompt. Returns the spawned session id, or a typed
    /// error when the Host transport is missing or the prompt is not admitted.
    member SpawnExecutionSession: agent: string * prompt: string -> Task<Result<string, string>>

    /// crash-reconciliation-018: process-local adoption for explicit /continue. The durable
    /// handle stays byte-for-byte as it was at the crash boundary; a later LLM
    /// fork reuse is the first action allowed to reopen it durably.
    member AdoptExistingChild: parentSessionId: SessionId * record: HandleRecord -> Result<unit, string>

    member ExecutorRuntimeFor: ctx: HostToolContext -> HostForkRuntime

    member OrchestratorHostFor: sessionId: string -> OrchestratorHost

    member RunOwnedWork: start: (unit -> Task) -> bool

    member DisposeExecutorRuntime: sessionId: string -> Task

    /// EXEC-016: live PTY on the parent fork runtime (not Executor runtime).
    member HasLivePty: sessionId: string -> bool

    member CancelSessionChildren: sessionId: string -> Task

    /// managed-session-lifecycle-017: an internal stop is a synchronous
    /// logical termination CE. Failed delivery is what completes the durable
    /// fork handle and wakes the parent; no future TurnAborted callback carries
    /// workflow continuation state.
    member TerminateSession: sessionId: string * reason: string -> Task<Result<unit, string>>

    /// managed-session-lifecycle-024: Replace crashed DevOps physical session under single logical authority
    member ReplacePhysicalSession:
        parentSessionId: SessionId * devopsAgentId: string * oldChildSessionId: SessionId ->
            Task<Result<SessionId, string>>

    member DisposeSession: sessionId: string -> Task

    member DisposeAsync: unit -> Task

    member Dispose: unit -> unit
