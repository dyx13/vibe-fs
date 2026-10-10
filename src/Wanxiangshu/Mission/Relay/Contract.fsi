namespace Wanxiangshu.Mission.Relay

type RoadId
type IncumbencyId
type WorkspaceSnapshotId
type AuthorityRevision
type AssessmentId
type QualityCertificateId
type RetirementId
type PhysicalUserMessageId

module PhysicalUserMessageId =
    val create: string -> PhysicalUserMessageId
    val value: PhysicalUserMessageId -> string

module RoadId =
    val create: string -> RoadId
    val value: RoadId -> string

module IncumbencyId =
    val create: string -> IncumbencyId
    val value: IncumbencyId -> string

module WorkspaceSnapshotId =
    val create: string -> WorkspaceSnapshotId
    val value: WorkspaceSnapshotId -> string

module AuthorityRevision =
    val create: string -> AuthorityRevision
    val value: AuthorityRevision -> string

module AssessmentId =
    val create: string -> AssessmentId
    val value: AssessmentId -> string

module QualityCertificateId =
    val create: string -> QualityCertificateId
    val value: QualityCertificateId -> string

module RetirementId =
    val create: string -> RetirementId
    val value: RetirementId -> string

/// The single gate-kind vocabulary for the manager loop prompt, shared by
/// the Change sender and the projection cut so the two never drift apart.
module ManagerLoopGate =
    val gateKind: retirementId: RetirementId -> string

type AssessmentFinding =
    { AcceptanceCriteria: string
      WorkPlan: string }

type AssessmentFindings

module AssessmentFindings =
    val tryCreate: AssessmentFinding list -> Result<AssessmentFindings, string>
    val values: AssessmentFindings -> AssessmentFinding list
    val isEmpty: AssessmentFindings -> bool

type AssessmentBinding =
    { PhysicalUserMessageId: string
      ProviderRunId: string
      ToolCallId: string
      NarrativeDigest: string
      PayloadDigest: string
      RootRequestDigest: string
      RequirementSetDigest: string
      EvidenceFrontierDigest: string }

[<RequireQualifiedAccess>]
type IncumbencyPhase =
    | AuditPending
    | WorkOwned
    | PerfectAwaitingRetirement
    | RetirementCleanupBlocked

type QualityCertificate =
    { Id: QualityCertificateId
      AssessmentId: AssessmentId
      IncumbencyId: IncumbencyId
      SnapshotId: WorkspaceSnapshotId
      AuthorityRevision: AuthorityRevision
      Binding: AssessmentBinding
      Valid: bool
      InvalidationReason: string option }

[<RequireQualifiedAccess>]
type RetirementOutcome =
    | Continue
    | Accepted of QualityCertificateId

type ProjectionCut =
    { ProviderRunId: string
      ToolCallId: string }

type RetirementSummary =
    { Id: RetirementId
      IncumbencyId: IncumbencyId
      SnapshotId: WorkspaceSnapshotId
      AuthorityRevision: AuthorityRevision
      ProjectionCut: ProjectionCut
      Outcome: RetirementOutcome }
