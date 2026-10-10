namespace Wanxiangshu.Interaction.Concern

open Wanxiangshu.Foundation.Identity

/// Reserved semantic addresses that do not belong to any session mailbox.
[<RequireQualifiedAccess>]
module ReservedAddress =
    /// The human user. Publishing here raises a user-visible notification.
    let User = "user"
    /// The user-facing session without an assigned name.
    let Root = "root"

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

    let empty =
        { Addresses = Map.empty
          Mailboxes = Map.empty
          KnownGenerations = Map.empty
          Messages = Map.empty
          AnnouncementCoverage = Set.empty
          DeliveryCoverage = Set.empty }

    let activeMailbox id (state: ConcernProjectionState) =
        Map.tryFind id state.Mailboxes |> Option.filter _.Active

    let tryFindMessage occurrenceId (state: ConcernProjectionState) = Map.tryFind occurrenceId state.Messages

    let private validateAddress id concern =
        if System.String.IsNullOrWhiteSpace id then
            Error "concern id must be non-empty"
        elif System.String.IsNullOrWhiteSpace concern then
            Error "concern must be non-empty"
        else
            Ok()

    let private decideSubscription owner occurrenceId id concern (state: ConcernProjectionState) =
        let semanticConflict =
            Map.tryFind id state.Addresses
            |> Option.exists (fun existing -> existing <> concern)

        match semanticConflict, activeMailbox id state with
        | true, _ -> Error "concern id is permanently bound to another concern"
        | false, Some mailbox when mailbox.OwnerSessionId = owner && mailbox.Concern = concern -> Ok None
        | false, Some _ -> Error "concern id already has a live owner"
        | false, None ->
            Ok(
                Some(
                    ConcernFactCases.MailboxSubscribed
                        {| Id = id
                           Concern = concern
                           Generation = occurrenceId
                           OwnerSessionId = owner |}
                )
            )

    let subscribe owner occurrenceId id concern (state: ConcernProjectionState) =
        validateAddress id concern
        |> Result.bind (fun () -> decideSubscription owner occurrenceId id concern state)

    let publish sender occurrenceId id message (state: ConcernProjectionState) =
        match activeMailbox id state with
        | None -> Error "concern id has no live mailbox"
        | Some mailbox ->
            Ok(
                ConcernFactCases.MessagePublished
                    {| OccurrenceId = occurrenceId
                       Generation = mailbox.Generation
                       Id = id
                       SenderSessionId = sender
                       Message = message |}
            )

    let private sameMailbox (left: ConcernMailbox) (right: ConcernMailbox) =
        left.Id = right.Id
        && left.Concern = right.Concern
        && left.Generation = right.Generation
        && left.OwnerSessionId = right.OwnerSessionId

    let private sameMessage (left: ConcernMessage) (right: ConcernMessage) =
        left.OccurrenceId = right.OccurrenceId
        && left.Generation = right.Generation
        && left.Id = right.Id
        && left.SenderSessionId = right.SenderSessionId
        && left.Message = right.Message

    let private applyValidatedSubscription id concern generation ownerSessionId (state: ConcernProjectionState) =
        let mailbox =
            { Id = id
              Concern = concern
              Generation = generation
              OwnerSessionId = ownerSessionId
              Active = true }

        match Map.tryFind generation state.KnownGenerations, Map.tryFind id state.Addresses, activeMailbox id state with
        | Some known, _, _ when sameMailbox known mailbox -> Ok state
        | Some _, _, _ -> Error "generation identity conflict"
        | None, Some knownConcern, _ when knownConcern <> concern -> Error "concern identity conflict"
        | None, _, Some _ -> Error "mailbox already active"
        | None, _, None ->
            Ok
                { state with
                    Addresses = Map.add id concern state.Addresses
                    Mailboxes = Map.add id mailbox state.Mailboxes
                    KnownGenerations = Map.add generation mailbox state.KnownGenerations }

    let private applySubscribed id concern generation ownerSessionId (state: ConcernProjectionState) =
        validateAddress id concern
        |> Result.bind (fun () -> applyValidatedSubscription id concern generation ownerSessionId state)

    let private applyPublished occurrenceId generation id senderSessionId body (state: ConcernProjectionState) =
        let message =
            { OccurrenceId = occurrenceId
              Generation = generation
              Id = id
              SenderSessionId = senderSessionId
              Message = body }

        match Map.tryFind occurrenceId state.Messages, activeMailbox id state with
        | Some known, _ when sameMessage known message -> Ok state
        | Some _, _ -> Error "message occurrence identity conflict"
        | None, Some mailbox when mailbox.Generation = generation ->
            Ok
                { state with
                    Messages = Map.add occurrenceId message state.Messages }
        | None, _ -> Error "published generation is no longer live"

    let private applyRetired id generation (state: ConcernProjectionState) =
        match Map.tryFind id state.Mailboxes with
        | Some mailbox when mailbox.Generation = generation ->
            Ok
                { state with
                    Mailboxes = Map.add id { mailbox with Active = false } state.Mailboxes }
        | _ when Map.containsKey generation state.KnownGenerations -> Ok state
        | _ -> Error "unknown mailbox generation"

    let closeLife owner (state: ConcernProjectionState) =
        { state with
            Mailboxes =
                state.Mailboxes
                |> Map.map (fun _ mailbox ->
                    if mailbox.OwnerSessionId = owner then
                        { mailbox with Active = false }
                    else
                        mailbox) }

    let applyFact fact (state: ConcernProjectionState) : Result<ConcernProjectionState, string> =
        match fact with
        | ConcernFactCases.MailboxSubscribed payload ->
            applySubscribed payload.Id payload.Concern payload.Generation payload.OwnerSessionId state
        | ConcernFactCases.MessagePublished payload ->
            applyPublished
                payload.OccurrenceId
                payload.Generation
                payload.Id
                payload.SenderSessionId
                payload.Message
                state
        | ConcernFactCases.MailboxRetired payload -> applyRetired payload.Id payload.Generation state

    let prepareFragments recipient (state: ConcernProjectionState) =
        // Test/plugin fixtures and pre-feature in-memory projections may carry the
        // older AgentProjectionSet shape. Missing concern state is semantically the
        // same as an empty mailbox projection; durable facts still create the field
        // through the canonical fold before any real concern can exist.
        let state = if isNull (box state) then empty else state

        let announcements =
            state.Mailboxes
            |> Map.values
            |> Seq.filter _.Active
            |> Seq.filter (fun mailbox -> not (Set.contains (mailbox.Generation, recipient) state.AnnouncementCoverage))
            |> Seq.sortBy _.Id
            |> Seq.toList

        let activeGenerations =
            state.Mailboxes
            |> Map.values
            |> Seq.filter (fun mailbox -> mailbox.Active && mailbox.OwnerSessionId = recipient)
            |> Seq.map _.Generation
            |> Set.ofSeq

        let messages =
            state.Messages
            |> Map.values
            |> Seq.filter (fun message ->
                Set.contains message.Generation activeGenerations
                && not (Set.contains message.OccurrenceId state.DeliveryCoverage))
            |> Seq.sortBy _.OccurrenceId
            |> Seq.toList

        let batch =
            { AnnouncedGenerations = announcements |> List.map _.Generation
              DeliveredMessages = messages |> List.map _.OccurrenceId }

        { Batch = batch
          Announcements = announcements |> List.map (fun mailbox -> mailbox.Id, mailbox.Concern)
          Messages = messages |> List.map (fun message -> message.Id, message.Message) }

    let applyPlacement recipient batch (state: ConcernProjectionState) : Result<ConcernProjectionState, string> =
        let announcementsValid =
            batch.AnnouncedGenerations
            |> List.forall (fun generation -> Map.containsKey generation state.KnownGenerations)

        let deliveriesValid =
            batch.DeliveredMessages
            |> List.forall (fun occurrence ->
                match Map.tryFind occurrence state.Messages with
                | Some message ->
                    state.Mailboxes
                    |> Map.tryFind message.Id
                    |> Option.exists (fun mailbox ->
                        mailbox.Active
                        && mailbox.Generation = message.Generation
                        && mailbox.OwnerSessionId = recipient)
                | None -> false)

        if not announcementsValid || not deliveriesValid then
            Error "concern placement references stale or unknown material"
        else
            Ok
                { state with
                    AnnouncementCoverage =
                        batch.AnnouncedGenerations
                        |> List.fold
                            (fun covered generation -> Set.add (generation, recipient) covered)
                            state.AnnouncementCoverage
                    DeliveryCoverage =
                        batch.DeliveredMessages
                        |> List.fold (fun covered occurrence -> Set.add occurrence covered) state.DeliveryCoverage }
