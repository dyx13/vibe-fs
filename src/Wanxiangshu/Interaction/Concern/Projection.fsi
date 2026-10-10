namespace Wanxiangshu.Interaction.Concern

open Wanxiangshu.Foundation.Identity

[<RequireQualifiedAccess>]
module ReservedAddress =
    val User: string
    val Root: string

type ConcernMailbox =
    { Id: string
      Concern: string
      Generation: string
      OwnerSessionId: SessionId
      Active: bool }

type ConcernMessage =
    { OccurrenceId: string
      Generation: string
      Id: string
      SenderSessionId: SessionId
      Message: string }

type ConcernProjectionState =
    { Addresses: Map<string, string>
      Mailboxes: Map<string, ConcernMailbox>
      KnownGenerations: Map<string, ConcernMailbox>
      Messages: Map<string, ConcernMessage>
      AnnouncementCoverage: Set<string * SessionId>
      DeliveryCoverage: Set<string> }

type ConcernPreparedFragments =
    { Batch: ConcernPlacementBatch
      Announcements: (string * string) list
      Messages: (string * string) list }

[<RequireQualifiedAccess>]
module ConcernProjection =
    val empty: ConcernProjectionState
    val activeMailbox: id: string -> state: ConcernProjectionState -> ConcernMailbox option
    val tryFindMessage: occurrenceId: string -> state: ConcernProjectionState -> ConcernMessage option

    val subscribe:
        owner: SessionId ->
        occurrenceId: string ->
        id: string ->
        concern: string ->
        state: ConcernProjectionState ->
            Result<ConcernFactCases option, string>

    val publish:
        sender: SessionId ->
        occurrenceId: string ->
        id: string ->
        message: string ->
        state: ConcernProjectionState ->
            Result<ConcernFactCases, string>

    val applyFact: fact: ConcernFactCases -> state: ConcernProjectionState -> Result<ConcernProjectionState, string>

    val prepareFragments: recipient: SessionId -> state: ConcernProjectionState -> ConcernPreparedFragments

    val applyPlacement:
        recipient: SessionId ->
        batch: ConcernPlacementBatch ->
        state: ConcernProjectionState ->
            Result<ConcernProjectionState, string>
