namespace Wanxiangshu.Composition.Durable

open Wanxiangshu.Change
open Wanxiangshu.Context.Companion
open Wanxiangshu.Context.Companion.Blogger
open Wanxiangshu.Context.Companion.Blogger.Runtime
open Wanxiangshu.Context.Prefix
open Wanxiangshu.Context.Trace
open Wanxiangshu.Execution.Delegation
open Wanxiangshu.Execution.Fission
open Wanxiangshu.Execution.Session
open Wanxiangshu.Execution.Session.ChatExecution
open Wanxiangshu.Enforcer
open Wanxiangshu.Enforcer.Guidance
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Interaction.Attention
open Wanxiangshu.Interaction.Authority
open Wanxiangshu.Interaction.Concern
open Wanxiangshu.Mission.Relay
open Wanxiangshu.OpenCode.Host.PairProgramming
open Wanxiangshu.OpenCode.Host.RequirementGrounding
open Wanxiangshu.Participant.Provider.Attempt.Fallback

/// Bounded projections one session owns (PERSIST-008).
///
/// Each is `option` because a session acquires state only when a fact concerning
/// it arrives. "No fact yet" and "an empty projection" are different claims and
/// must stay distinguishable — collapsing them is how a missing fact starts
/// looking like a satisfied precondition.
/// DSL-state-combination: domain — this aggregate is the durable per-session
/// projection of independently-owned fact families; each optional field is a
/// bounded-context projection, not an execution cursor.
type SessionAgentProjection =
    {
        Companion: CompanionProjection option
        /// COMPANION-003 / HOST-005: the XTrace — the session's unique raw
        /// semantic trajectory. Separate from `Blog` because the frame sequence
        /// is Y's compressed view while this is the raw record LWR is built from.
        XTrace: XTraceProjectionState option
        /// docs/what/context.md: the Companion frame sequence and what it covers. Separate from
        /// `Companion` because that record is the runtime cache's durable mirror,
        /// while this one is the frame history CTX-011 builds probe candidates from.
        Blog: BlogProjectionState option
        /// COMPANION-009: which X prefix generation is in force. Not folded into
        /// `Blog`: a squash advances the frame epoch without touching the prefix, and
        /// a reanchor retires the prefix without touching frames, so one record for
        /// both would make each change look like it moved the other.
        PrefixEpoch: ActivePrefixEpoch option
        Handles: AgentLinkageProjection option
        ProviderFailures: ProviderFailureProjection option
        PromptAuthority: PromptAuthority.PromptAuthorityProjection option
        /// ENFORCER-044/045/154: committed Blogger enforcement cycles for this
        /// session's Companion. Per-session because a cycle belongs to one
        /// main session's Companion, keyed by the Blogger provider run.
        Enforcement: EnforcementProjectionState option
        /// C5: open materializations + unified Entry|Squash receipts.
        BloggerCycles: BloggerCycleProjectionState option
        /// Relay Road/Incumbency projection for the single current Manager protocol.
        Relay: RelayState option
        /// HOST-013: permanent auto-injected pairs for this transcript.
        Guidelines: GuidelineProjectionState option
        RequirementGrounding: RequirementGroundingProjectionState option
        /// Rulebook Main tip delivery: occurrence frontier + TipName coverage (TipGuidanceDelivered fold).
        TipDelivery: TipDeliveryProjectionState option
        SessionStartedAt: SessionStartedAtProjectionState option
        DelegatedToolEstimate: DelegatedToolEstimateProjectionState option
    }

type AgentProjectionSet =
    {
        Sessions: Map<SessionId, SessionAgentProjection>
        /// HOST-008: the Work ↔ Companion relation.
        ///
        /// Workspace-scoped rather than per-session, because the relation spans two
        /// sessions and both directions must be answerable from one keyed lookup
        /// (PERSIST-008). Held per-session, "is this id somebody's Y" would require
        /// scanning every session.
        Associations: Map<SessionId, SessionAssociation>
        Orchestrator: OrchestratorProjection
        /// PERSIST-008: child session → handle record, across ALL parents.
        ///
        /// Child-link queries answer "is this session somebody's child" from
        /// this one keyed lookup; scanning every parent's handle map instead is
        /// the scan PERSIST-008 forbids. Fold keeps it in step with the
        /// three handle facts (link / complete / retire), and retired records stay
        /// — the tombstone is permanent (EXEC-009).
        HandleByChildSession: Map<SessionId, HandleRecord>
        /// Same-participant multi-present groups and physical lane aliases.
        Fission: FissionProjectionState
        /// Exact durable managed-chat executions, keyed by physical user message.
        ChatExecutions: ChatExecutionProjectionState
        /// context-compression-028: successful native todowrite checkpoints that
        /// are still on the raw side of the committed prefix. Each checkpoint
        /// carries the K chosen on that call; a committed rebase prunes only
        /// checkpoints it has actually crossed.
        TodoCheckpoints: Map<SessionId, PhaseWindow.PhaseCommitWindow>
        /// Canonical per-Life Magic Todo checkpoint projection.
        /// delegation-024: last parent XTrace cursor physically handed to each reusable
        /// delegate session. Keyed pair lookup; never inferred from prompt text.
        DelegationCompletedHandoffs: Map<string, int64>

        Attention: AttentionProjectionState
        Concern: ConcernProjectionState

        /// Historical count of folded `RuntimeStarted` envelopes. Retained for
        /// audit/backward-compatible projections; it no longer drives recovery.
        RuntimeStartCount: int
    }

/// Composition of bounded session projections. Fact routing lives in Fold.fs.
module AgentProjection =

    let emptySession =
        { Companion = None
          XTrace = None
          Blog = None
          PrefixEpoch = None
          Handles = None
          ProviderFailures = None
          PromptAuthority = None
          Enforcement = None
          BloggerCycles = None
          Relay = None
          Guidelines = None
          RequirementGrounding = None
          TipDelivery = None
          SessionStartedAt = None
          DelegatedToolEstimate = None }

    let empty =
        { Sessions = Map.empty
          Associations = SessionAssociationProjection.empty
          Orchestrator = OrchestratorProjection.empty
          HandleByChildSession = Map.empty
          Fission = FissionProjection.empty
          ChatExecutions = ChatExecutionProjection.empty
          DelegationCompletedHandoffs = Map.empty
          Attention = AttentionProjection.empty
          TodoCheckpoints = Map.empty
          Concern = ConcernProjection.empty
          RuntimeStartCount = 0 }

    let tryFind (sessionId: SessionId) (projection: AgentProjectionSet) =
        Map.tryFind sessionId projection.Sessions

    /// Fork-child main is sealed for Blogger when its handle is joinable/retired.
    /// Human root (no handle) → false.
    let mainSealedForBlogger (mainSessionId: SessionId) (projection: AgentProjectionSet) : bool =
        match Map.tryFind mainSessionId projection.HandleByChildSession with
        | Some record -> HandleProjection.recordSealsBlogger record
        | None -> false

    let hasActiveOrchestratorJobs (projection: AgentProjectionSet) : bool =
        OrchestratorProjection.activeJobs projection.Orchestrator |> List.isEmpty |> not

    let activeOrchestratorJobPairs (projection: AgentProjectionSet) : (ManagerJobId * SessionId) list =
        OrchestratorProjection.activeJobs projection.Orchestrator
        |> List.map (fun job -> job.ManagerJobId, job.ManagerSessionId)

    let pendingAttentionWorkPairs (sessionId: SessionId) (projection: AgentProjectionSet) : (string * string) list =
        AttentionProjection.pending sessionId projection.Attention
        |> List.map (fun item -> item.OccurrenceId, item.Text)

    let private sessionOrEmpty sessionId projection =
        Map.tryFind sessionId projection.Sessions |> Option.defaultValue emptySession

    let update sessionId apply projection =
        { projection with
            Sessions = Map.add sessionId (apply (sessionOrEmpty sessionId projection)) projection.Sessions }

    /// Update one session when the change itself may be refused.
    ///
    /// Threads the rejection out rather than swallowing it. A projection that
    /// silently ignores an invalid fact cannot fail closed.
    let tryUpdate
        (sessionId: SessionId)
        (apply: SessionAgentProjection -> Result<SessionAgentProjection, 'rejection>)
        (projection: AgentProjectionSet)
        : Result<AgentProjectionSet, 'rejection> =
        sessionOrEmpty sessionId projection
        |> apply
        |> Result.map (fun session ->
            { projection with
                Sessions = Map.add sessionId session projection.Sessions })
