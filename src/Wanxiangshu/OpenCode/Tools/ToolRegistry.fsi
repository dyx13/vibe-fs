namespace Wanxiangshu.OpenCode

open System.Collections.Generic
open System.Threading.Tasks
open Wanxiangshu.Context.Companion.Blogger.Runtime
open Wanxiangshu.Execution.Delegation.SyncDelegate
open Wanxiangshu.Execution.Session.Wait
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Host.Contract
open Wanxiangshu.Mission.Relay
open Wanxiangshu.Persistence.Journal
open Wanxiangshu.Repository.Programming.Js

/// Assembly-only registry: tool behavior lives in one vertical verb module;
/// per-session resources live in ToolRuntimeScope.
type ToolRegistration =
    { Tools: obj
      Runtime: ToolRuntimeScope }

module ToolRegistry =

    [<RequireQualifiedAccess>]
    module Path =
        [<Literal>]
        val DeniedRole: string = "tool/registry/denied-role"

        [<Literal>]
        val DeniedStrength: string = "tool/registry/denied-strength"

        [<Literal>]
        val DeniedUnestablished: string = "tool/registry/denied-unestablished"

        [<Literal>]
        val DeniedTaskState: string = "tool/registry/denied-task-state"

    /// capability-enforcement-006: the authority the execute gate resolves for a tool, so a
    /// consumer can tell an office tool from an internal leaf without guessing
    /// from the tool name.
    val tryAdmission: specName: string -> bloggerHost: IBloggerRuntimeHost option -> ToolAdmission option

    /// capability-enforcement-006: the internal-leaf decision for a session that holds no public
    /// office profile at all. An office tool is never admitted this way.
    val privateAttachmentAdmits:
        specName: string -> bloggerHost: IBloggerRuntimeHost option -> sessionId: string -> bool

    /// AGENT-007 role gate, delegates to owner-defined tool admissions.
    /// sessionId is the tool call's Host session; bloggerHost is optional for tests.
    val rolePredicate:
        specName: string -> bloggerHost: IBloggerRuntimeHost option -> sessionId: string -> (Role -> bool)

    val create:
        toolModule: obj ->
        sessionPort: ISessionHostPort ->
        waitObserver: IWaitObserver ->
        rootWorkspace: IRootWorkspaceReader ->
        journal: AgentJournal option ->
        workspaceDirectory: string option ->
        sessionParents: Dictionary<string, string> ->
        currentPhysicalUserMessage: (string -> string option) ->
        sessionDirectories: Dictionary<string, string> ->
        onRunStarted: (SessionId -> Role -> string option -> unit) option ->
        parentWorkRecordFor: (string -> Task<string option>) option ->
        childWorkRecordFor: (string -> Task<string option>) option ->
        snapshot: ISessionSnapshotPort option ->
        cancelSignals: (SessionId seq -> unit) option ->
        beginToolExecution: (string -> unit) ->
        endToolExecution: (string -> unit) ->
        eventPort: IEventObservationPort option ->
        bloggerHost: IBloggerRuntimeHost option ->
        syncDelegateRuntime: SyncDelegateRuntime option ->
        isReplicaSession: (SessionId -> bool) option ->
        casebookToolSpecs: ToolSpec list ->
        jsTransactionPersistence: IJsTransactionPersistence option ->
        continueManagerLoop: (SessionId -> string -> Task<Result<unit, string>>) ->
        captureWorktreeSnapshot: (WorktreePath -> Result<WorkspaceSnapshotId, string>) ->
        childWorkRecordForRun:
            (SessionId -> Wanxiangshu.Context.Trace.XTraceRange -> ProviderRunIdentity -> Task<string option>) option ->
        workRecordCapability: Wanxiangshu.Execution.Delegation.DelegationWorkRecordCapability option ->
        userNotify: (string -> string -> unit) option ->
            ToolRegistration
