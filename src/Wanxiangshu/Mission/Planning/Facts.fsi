namespace Wanxiangshu.Mission.Planning

open Wanxiangshu.Context.Trace

type PlanWorkId = private PlanWorkId of string

module PlanWorkId =
    val create: string -> PlanWorkId
    val value: PlanWorkId -> string

type PlanIncumbencyId = private PlanIncumbencyId of string

module PlanIncumbencyId =
    val create: string -> PlanIncumbencyId
    val value: PlanIncumbencyId -> string

[<RequireQualifiedAccess>]
type PlanStage =
    | S1
    | S2
    | S3

module PlanStage =
    val ordinal: PlanStage -> int
    val next: PlanStage -> PlanStage option
    val ofString: string -> PlanStage option
    val render: PlanStage -> string

[<RequireQualifiedAccess>]
type PlanRetirementOutcome =
    | Relayed
    | Delivered

module PlanRetirementOutcome =
    val ofString: string -> PlanRetirementOutcome option
    val render: PlanRetirementOutcome -> string

[<RequireQualifiedAccess>]
type PlanReviewedOutcome =
    | Promoted
    | Stayed

module PlanReviewedOutcome =
    val ofString: string -> PlanReviewedOutcome option
    val render: PlanReviewedOutcome -> string

type PlanDeliveryReceipt =
    { IncumbencyId: PlanIncumbencyId
      WorkId: PlanWorkId
      Digest: string
      Path: string
      ExecSessionId: string }

[<RequireQualifiedAccess>]
type PlanEvent =
    | PlanWorkOpened of workId: PlanWorkId * root: string
    | PlanDevOpsBound of workId: PlanWorkId * devopsId: string * target: string option
    | PlanIncumbencyOpened of
        workId: PlanWorkId *
        incumbencyId: PlanIncumbencyId *
        stage: PlanStage *
        openingCursor: XTraceCursor
    | PlanIncumbencyRetired of
        incumbencyId: PlanIncumbencyId *
        outcome: PlanRetirementOutcome *
        retirementCursor: XTraceCursor
    | PlanDelivered of
        incumbencyId: PlanIncumbencyId *
        workId: PlanWorkId *
        digest: string *
        path: string *
        execSessionId: string
    | PlanReviewed of incumbencyId: PlanIncumbencyId * stage: PlanStage * outcome: PlanReviewedOutcome
    | PlanReopened of incumbencyId: PlanIncumbencyId

module PlanEvents =
    val workOpened: string -> string -> PlanEvent
    val devOpsBound: string -> string -> string option -> PlanEvent
    val incumbencyOpened: string -> string -> PlanStage -> int64 -> PlanEvent
    val incumbencyRetired: string -> PlanRetirementOutcome -> int64 -> PlanEvent
    val delivered: string -> string -> string -> string -> string -> PlanEvent
    val reviewed: string -> PlanStage -> PlanReviewedOutcome -> PlanEvent
    val reopened: string -> PlanEvent
