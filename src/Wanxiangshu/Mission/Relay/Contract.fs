namespace Wanxiangshu.Mission.Relay

open FsToolkit.ErrorHandling

type RoadId = private RoadId of string
type IncumbencyId = private IncumbencyId of string
type WorkspaceSnapshotId = private WorkspaceSnapshotId of string
type AuthorityRevision = private AuthorityRevision of string
type AssessmentId = private AssessmentId of string
type QualityCertificateId = private QualityCertificateId of string
type RetirementId = private RetirementId of string
type PhysicalUserMessageId = private PhysicalUserMessageId of string

module PhysicalUserMessageId =
    let create value = PhysicalUserMessageId value
    let value (PhysicalUserMessageId value) = value

module RoadId =
    let create value = RoadId value
    let value (RoadId value) = value

module IncumbencyId =
    let create value = IncumbencyId value
    let value (IncumbencyId value) = value

module WorkspaceSnapshotId =
    let create value = WorkspaceSnapshotId value
    let value (WorkspaceSnapshotId value) = value

module AuthorityRevision =
    let create value = AuthorityRevision value
    let value (AuthorityRevision value) = value

module AssessmentId =
    let create value = AssessmentId value
    let value (AssessmentId value) = value

module QualityCertificateId =
    let create value = QualityCertificateId value
    let value (QualityCertificateId value) = value

module RetirementId =
    let create value = RetirementId value
    let value (RetirementId value) = value

/// The single gate-kind vocabulary for the manager loop prompt, shared by
/// the Change sender and the projection cut so the two never drift apart.
module ManagerLoopGate =
    let gateKind (retirementId: RetirementId) =
        "manager-loop:" + RetirementId.value retirementId

type AssessmentFinding =
    { AcceptanceCriteria: string
      WorkPlan: string }

type AssessmentFindings = private AssessmentFindings of AssessmentFinding list

module AssessmentFindings =
    let tryCreate (findings: AssessmentFinding list) =
        if
            findings
            |> List.forall (fun finding ->
                not (System.String.IsNullOrWhiteSpace finding.AcceptanceCriteria)
                && not (System.String.IsNullOrWhiteSpace finding.WorkPlan))
        then
            Ok(AssessmentFindings findings)
        else
            Error "AssessmentFinding requires non-empty acceptance criteria and work plan"

    let values (AssessmentFindings findings) = findings

    let isEmpty (AssessmentFindings findings) = List.isEmpty findings

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
