namespace Wanxiangshu.Mission.Relay

type RelayState

type RoadView =
    {
        AuthorityRevision: AuthorityRevision
        AuthorityRevisions: AuthorityRevision list
        AuthorityMessageIds: PhysicalUserMessageId list
        /// How many iterations this road has opened, counting the active one.
        /// Derived purely from durable openings; never an execution cursor.
        IterationOrdinal: int
        ActiveIncumbency: IncumbencyId option
        ActivePhase: IncumbencyPhase option
        ActiveSnapshotId: WorkspaceSnapshotId option
        ActiveAuthorityRevision: AuthorityRevision option
        ActiveCleanupBlockerDigest: string option
        AcceptedAssessmentTransport: (string * string) option
        RetirementConfirmation: (string * string) option
        AcceptedAssessmentFindings: AssessmentFindings option
        RetiredIncumbencies: IncumbencyId list
        RetiredProviderRunIds: Set<string>
        Certificate: QualityCertificate option
        LatestRetirement: RetirementSummary option
        BoundDevOps: string option
        BoundDevOpsModelTarget: string option
    }

module Fold =
    val empty: RelayState
    val apply: state: RelayState -> roadId: RoadId -> transaction: RelayTransaction -> Result<RelayState, string>
    val view: state: RelayState -> roadId: RoadId -> RoadView option

    val tryReplayAssessment:
        state: RelayState ->
        roadId: RoadId ->
        incumbencyId: IncumbencyId ->
        binding: AssessmentBinding ->
        snapshotId: WorkspaceSnapshotId ->
        authorityRevision: AuthorityRevision ->
        findings: AssessmentFindings ->
            Result<AssessmentFindings, string>

    /// obligation-ledger-004: enumerate every durable road id for read-only
    /// projection forwarding (owner-provided accessor; no private state escapes).
    val roads: state: RelayState -> RoadId list

module Decision =
    val openIncumbency:
        state: RelayState ->
        roadId: RoadId ->
        incumbentId: IncumbencyId ->
        snapshotId: WorkspaceSnapshotId ->
        authorityRevision: AuthorityRevision ->
            Result<RelayState, string>

    val bindRoadDevOps:
        state: RelayState ->
        roadId: RoadId ->
        devopsId: string ->
        modelTarget: string option ->
            Result<RelayState, string>

    val assess:
        state: RelayState ->
        roadId: RoadId ->
        incumbentId: IncumbencyId ->
        assessmentId: AssessmentId ->
        binding: AssessmentBinding ->
        snapshotId: WorkspaceSnapshotId ->
        authorityRevision: AuthorityRevision ->
        findings: AssessmentFindings ->
            Result<RelayState, string>

    val advanceAuthority:
        state: RelayState ->
        roadId: RoadId ->
        incumbentId: IncumbencyId ->
        expected: AuthorityRevision ->
        next: AuthorityRevision ->
        authorityMessageId: PhysicalUserMessageId ->
        snapshotId: WorkspaceSnapshotId ->
            Result<RelayState, string>

    val invalidateCertificate: state: RelayState -> roadId: RoadId -> reason: string -> Result<RelayState, string>

    val blockCleanup:
        state: RelayState ->
        roadId: RoadId ->
        incumbentId: IncumbencyId ->
        blockerDigest: string ->
            Result<RelayState, string>

    val confirmRetirement:
        state: RelayState ->
        roadId: RoadId ->
        incumbentId: IncumbencyId ->
        providerRunId: string ->
        toolCallId: string ->
            Result<RelayState, string>

    val retire:
        state: RelayState ->
        roadId: RoadId ->
        incumbentId: IncumbencyId ->
        retirement: RetirementSummary ->
            Result<RelayState, string>
