namespace Wanxiangshu.Interaction.Dispatch

open System.Threading.Tasks
open Wanxiangshu.Context.Prefix
open Wanxiangshu.Context.Trace
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Interaction.Authority
open Wanxiangshu.Participant.Provider.Attempt.Fallback
open Wanxiangshu.Participant.Provider.Projection
open Wanxiangshu.Participant.Provider.Attempt

/// Single-snapshot view required by Wire for one call.
/// Derived from exactly one Journal Snapshot read per call.
type WireSnapshotView =
    {
        State: WireSessionState option
        IsCompanion: bool
        ActiveAuthorityProfile: PromptAuthority.AuthorityExecutionProfile option
        ProviderFailureState: ProviderFailureProjection option
        /// context-compression-028: the admission origin recorded for one physical
        /// request. A checkpoint-boundary attempt plan must freeze the same provenance the
        /// request itself carries — guessing it would re-identify the prompt.
        AcceptedOrigin: PhysicalUserMessageId -> PromptAuthority.PromptOrigin option
    }

type AttemptPlanCapability =
    { TryAttemptPlan: SessionId -> ProviderRunIdentity -> AttemptPlan option
      TryBindAttemptPlan: SessionId -> PhysicalUserMessageId -> ProviderRunIdentity -> AttemptPlan option
      ConsumeAttemptPlan: SessionId -> ProviderRunIdentity -> AttemptPlan option
      FreezePendingAttemptPlan: SessionId -> PhysicalUserMessageId -> PendingAttemptPlan -> PendingAttemptPlanAdmission
      TryPendingAttemptPlan: SessionId -> PhysicalUserMessageId -> PendingAttemptPlan option }

type PrefixPresentationPort =
    { MemoryPreamble: SessionId -> string
      ReplaceMessages: obj -> obj list -> unit }

type WirePrefixRebasePayload =
    {| SessionId: SessionId
       PreviousEpochId: PrefixEpochId
       NextEpochId: PrefixEpochId
       FrozenRecordPrefixRef: BlobRef
       FrozenRecordPrefixDigest: BlobDigest
       CutoffExclusive: int
       CoveredPrefixDigest: string
       SealRoot: string
       SyntheticMessageId: string
       ProbeId: string
       SolvingProviderRun: ProviderRunIdentity |}

type WireJournalPort =
    { ReadView: SessionId -> WireSnapshotView
      Candidate: PrefixCandidatePort
      CurrentProjection: XTraceProjectionState -> Task<Result<ProviderProjection.ProviderSemanticProjection, string>>
      RecordConfirmedSuccess: SessionId -> ProviderRunIdentity -> Task<Result<unit, string>>
      CommitPrefixRebase: SessionId -> ProviderRunIdentity -> WirePrefixRebasePayload -> Task<Result<unit, string>> }
