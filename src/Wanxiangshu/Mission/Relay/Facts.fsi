namespace Wanxiangshu.Mission.Relay

[<RequireQualifiedAccess>]
type RelayEvent =
    | RoadOpened of RoadId * AuthorityRevision * PhysicalUserMessageId
    | RoadDevOpsBound of RoadId * devopsId: string * modelTarget: string option
    | IncumbencyOpened of IncumbencyId * WorkspaceSnapshotId
    | AssessmentCommitted of
        AssessmentId *
        IncumbencyId *
        AssessmentBinding *
        WorkspaceSnapshotId *
        AuthorityRevision *
        ScoreVector
    | AuthorityRevisionAdvanced of
        IncumbencyId *
        expected: AuthorityRevision *
        next: AuthorityRevision *
        PhysicalUserMessageId *
        WorkspaceSnapshotId
    | QualityCertificateInvalidated of QualityCertificateId * reason: string
    | RetirementCleanupBlocked of IncumbencyId * blockerDigest: string
    | RetirementCommitted of RetirementSummary

type RelayTransaction

module RelayTransaction =
    val create: RelayEvent list -> Result<RelayTransaction, string>
    val events: RelayTransaction -> RelayEvent list

type IncumbencyOpening =
    { RoadId: RoadId
      IncumbencyId: IncumbencyId
      AuthorityRevision: AuthorityRevision
      Transaction: RelayTransaction }

module IncumbencyOpening =
    val nextId: sha256: (string -> string) -> retirementId: RetirementId -> IncumbencyId

    val initial:
        sha256: (string -> string) ->
        roadId: RoadId ->
        physicalUserMessageId: PhysicalUserMessageId ->
        snapshotId: WorkspaceSnapshotId ->
            IncumbencyOpening

    val next:
        sha256: (string -> string) ->
        roadId: RoadId ->
        retirementId: RetirementId ->
        authorityRevision: AuthorityRevision ->
        snapshotId: WorkspaceSnapshotId ->
            IncumbencyOpening

[<RequireQualifiedAccess>]
type RelayFactCases =
    | TransactionCommitted of
        {| RoadId: RoadId
           Transaction: RelayTransaction |}
