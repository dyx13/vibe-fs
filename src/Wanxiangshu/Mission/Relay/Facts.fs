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
        AssessmentFindings
    | AuthorityRevisionAdvanced of
        IncumbencyId *
        expected: AuthorityRevision *
        next: AuthorityRevision *
        PhysicalUserMessageId *
        WorkspaceSnapshotId
    | QualityCertificateInvalidated of QualityCertificateId * reason: string
    | RetirementCleanupBlocked of IncumbencyId * blockerDigest: string
    | RetirementConfirmationCommitted of IncumbencyId * providerRunId: string * toolCallId: string
    | RetirementCommitted of RetirementSummary

type RelayTransaction = private RelayTransaction of RelayEvent list

module RelayTransaction =
    let create events =
        match events with
        | [] -> Error "Relay transaction must contain at least one event."
        | _ -> Ok(RelayTransaction events)

    let events (RelayTransaction events) = events

type IncumbencyOpening =
    { RoadId: RoadId
      IncumbencyId: IncumbencyId
      AuthorityRevision: AuthorityRevision
      Transaction: RelayTransaction }

module IncumbencyOpening =
    let nextId (sha256: string -> string) (retirementId: RetirementId) =
        sha256 ("manager-loop-v1\n" + RetirementId.value retirementId)
        |> fun digest -> IncumbencyId.create ("incumbency:" + digest)

    let private buildTransaction events =
        match RelayTransaction.create events with
        | Ok transaction -> transaction
        | Error error -> failwith error

    let initial
        (sha256: string -> string)
        (roadId: RoadId)
        (physicalUserMessageId: PhysicalUserMessageId)
        (snapshotId: WorkspaceSnapshotId)
        =
        let authorityRevision =
            AuthorityRevision.create (PhysicalUserMessageId.value physicalUserMessageId)

        let incumbencyId =
            sha256 (
                "incumbency-v1\n"
                + RoadId.value roadId
                + "\n"
                + PhysicalUserMessageId.value physicalUserMessageId
            )
            |> fun digest -> IncumbencyId.create ("incumbency:" + digest)

        let transaction =
            buildTransaction
                [ RelayEvent.RoadOpened(roadId, authorityRevision, physicalUserMessageId)
                  RelayEvent.IncumbencyOpened(incumbencyId, snapshotId) ]

        { RoadId = roadId
          IncumbencyId = incumbencyId
          AuthorityRevision = authorityRevision
          Transaction = transaction }

    let next
        (sha256: string -> string)
        (roadId: RoadId)
        (retirementId: RetirementId)
        (authorityRevision: AuthorityRevision)
        (snapshotId: WorkspaceSnapshotId)
        =
        let incumbencyId = nextId sha256 retirementId

        let transaction =
            buildTransaction [ RelayEvent.IncumbencyOpened(incumbencyId, snapshotId) ]

        { RoadId = roadId
          IncumbencyId = incumbencyId
          AuthorityRevision = authorityRevision
          Transaction = transaction }

[<RequireQualifiedAccess>]
type RelayFactCases =
    | TransactionCommitted of
        {| RoadId: RoadId
           Transaction: RelayTransaction |}
