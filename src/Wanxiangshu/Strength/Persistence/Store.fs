namespace Wanxiangshu.Strength.Persistence

open System.Text
open System.Threading.Tasks
open Thoth.Json
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Persistence.EventStore
open Wanxiangshu.Strength

/// STRENGTH-006/007/008 + DELEGATE-6.2/6.3: Persist adapter for Strength facts.
///
/// There is no feature-owned journal/ref/blob namespace. Large material is first
/// written to the existing Git raw object store and then named only by the
/// EventEnvelope.PayloadRefs closure. One decision owns one EventStore stream;
/// DelegationRequested -> DelegationBound -> Prepared -> Promoted -> Traced,
/// plus Requested/Bound -> DelegationClosed and Prepared -> Abandoned parent
/// edges make restart fold deterministic and let the generic store reject
/// missing causal predecessors.
[<RequireQualifiedAccess>]
module StrengthStore =

    let private decisionText decisionId = StrengthDecisionId.value decisionId

    let private kindOf =
        function
        | StrengthEvent.DelegationRequested _ -> StrengthEventTypes.DelegationRequested
        | StrengthEvent.DelegationBound _ -> StrengthEventTypes.DelegationBound
        | StrengthEvent.DelegationClosed _ -> StrengthEventTypes.DelegationClosed
        | StrengthEvent.DelegationHistoryImported _ -> StrengthEventTypes.DelegationHistoryImported
        | StrengthEvent.Prepared _ -> StrengthEventTypes.CandidatePrepared
        | StrengthEvent.Promoted _ -> StrengthEventTypes.CandidatePromoted
        | StrengthEvent.Traced _ -> StrengthEventTypes.FramesTraced
        | StrengthEvent.Abandoned _ -> StrengthEventTypes.CandidateAbandoned

    let private decisionOf =
        function
        | StrengthEvent.DelegationRequested requested -> requested.DecisionId
        | StrengthEvent.DelegationBound bound -> bound.DecisionId
        | StrengthEvent.DelegationClosed closed -> closed.DecisionId
        | StrengthEvent.DelegationHistoryImported imported -> imported.DecisionId
        | StrengthEvent.Prepared prepared -> prepared.DecisionId
        | StrengthEvent.Promoted promoted -> promoted.DecisionId
        | StrengthEvent.Traced traced -> traced.DecisionId
        | StrengthEvent.Abandoned abandoned -> abandoned.DecisionId

    /// Fixed identity per decision+fact-kind. A second payload for the same fact
    /// therefore becomes EventStore IdentityCollision instead of a second truth.
    let eventIdFor (sha256: string -> string) (decisionId: StrengthDecisionId) (eventType: string) : EventId =
        String.concat "" [ "strength-event-v1"; decisionText decisionId; eventType ]
        |> sha256
        |> EventId.create

    /// Imported history is the one fact kind that repeats within a decision:
    /// every imported legacy event carries its own ImportId, and that identity
    /// — not the decision and fact kind — decides the envelope EventId. Two
    /// imports of one decision must not collide, and re-running the same
    /// import must land on the identical id so the dedupe stays idempotent.
    let private eventIdOf (sha256: string -> string) (event: StrengthEvent) : EventId =
        match event with
        | StrengthEvent.DelegationHistoryImported imported ->
            String.concat "\u001f" [ "strength-import-v1"; decisionText imported.DecisionId; imported.ImportId ]
            |> sha256
            |> EventId.create
        | _ -> eventIdFor sha256 (decisionOf event) (kindOf event)

    let private streamIdFor decisionId =
        EventStreamId.create ("strength/" + decisionText decisionId)

    let private closedParentFor (id: string -> EventId) =
        function
        | DelegationClosedFrom.Requested -> [ id StrengthEventTypes.DelegationRequested ]
        | DelegationClosedFrom.Bound -> [ id StrengthEventTypes.DelegationBound ]

    let private parentsFor sha256 event =
        let decisionId = decisionOf event
        let id eventType = eventIdFor sha256 decisionId eventType

        match event with
        | StrengthEvent.DelegationHistoryImported _ -> []
        | StrengthEvent.DelegationRequested _ -> []
        | StrengthEvent.DelegationBound _ -> [ id StrengthEventTypes.DelegationRequested ]
        | StrengthEvent.DelegationClosed closed -> closedParentFor id closed.From
        | StrengthEvent.Prepared _ -> [ id StrengthEventTypes.DelegationBound ]
        | StrengthEvent.Promoted _ -> [ id StrengthEventTypes.CandidatePrepared ]
        | StrengthEvent.Traced _ -> [ id StrengthEventTypes.CandidatePromoted ]
        | StrengthEvent.Abandoned _ -> [ id StrengthEventTypes.CandidatePrepared ]

    let private closedFromText =
        function
        | DelegationClosedFrom.Requested -> "requested"
        | DelegationClosedFrom.Bound -> "bound"

    let private closedFromOf =
        function
        | "requested" -> Some DelegationClosedFrom.Requested
        | "bound" -> Some DelegationClosedFrom.Bound
        | _ -> None

    let private closedReasonText =
        function
        | DelegationClosedReason.NoMaterial -> "no-material"
        | DelegationClosedReason.CannotContinue -> "cannot-continue"
        | DelegationClosedReason.Cancelled -> "cancelled"
        | DelegationClosedReason.Superseded -> "superseded"
        | DelegationClosedReason.RecoveryAbandoned -> "recovery-abandoned"

    let private closedReasonOf =
        function
        | "no-material" -> Some DelegationClosedReason.NoMaterial
        | "cannot-continue" -> Some DelegationClosedReason.CannotContinue
        | "cancelled" -> Some DelegationClosedReason.Cancelled
        | "superseded" -> Some DelegationClosedReason.Superseded
        | "recovery-abandoned" -> Some DelegationClosedReason.RecoveryAbandoned
        | _ -> None

    let private encodeImportOutcome =
        function
        | DelegationImportOutcome.Adopted material ->
            Encode.object
                [ "kind", Encode.string "adopted"
                  "target_provider_run", Encode.string (ProviderRunIdentity.value material.TargetProviderRun)
                  "frame_digest", Encode.string material.FrameDigest
                  "byte_length", Encode.int material.ByteLength
                  "payload_refs",
                  Encode.list (
                      material.MaterialPayloads
                      |> List.map (fun payloadRef -> Encode.string (PayloadRef.value payloadRef))
                  )
                  "traced_start_inclusive",
                  (match material.TracedStartInclusive with
                   | Some value -> Encode.int64 value
                   | None -> Encode.nil)
                  "traced_end_exclusive",
                  (match material.TracedEndExclusive with
                   | Some value -> Encode.int64 value
                   | None -> Encode.nil) ]
        | DelegationImportOutcome.Relinquished material ->
            Encode.object
                [ "kind", Encode.string "relinquished"
                  "target_provider_run",
                  (match material.TargetProviderRun with
                   | Some value -> Encode.string (ProviderRunIdentity.value value)
                   | None -> Encode.nil)
                  "reason", Encode.string material.Reason ]

    let private encodePayload =
        function
        | StrengthEvent.DelegationHistoryImported imported ->
            let outcomeJson = encodeImportOutcome imported.Outcome

            Encode.object
                [ "decision_id", Encode.string (decisionText imported.DecisionId)
                  "source_stream_id", Encode.string imported.SourceStreamId
                  "source_event_id", Encode.string imported.SourceEventId
                  "import_id", Encode.string imported.ImportId
                  "old_budget_evidence",
                  (match imported.OldBudgetEvidence with
                   | Some value -> Encode.string value
                   | None -> Encode.nil)
                  "outcome", outcomeJson ]
        | StrengthEvent.DelegationRequested requested ->
            Encode.object
                [ "owner_session_id", Encode.string (SessionId.value requested.OwnerSessionId)
                  "decision_id", Encode.string (decisionText requested.DecisionId)
                  "logical_run_id", Encode.string (LogicalRunId.value requested.OwnerLogicalRun.LogicalRunId)
                  "authority_root_user_message_id",
                  Encode.string (AuthorityRootUserMessageId.value requested.OwnerLogicalRun.AuthorityRootUserMessageId)
                  "source_physical_user_message_id",
                  Encode.string (PhysicalUserMessageId.value requested.SourcePhysicalUserMessageId)
                  "source_provider_run", Encode.string (ProviderRunIdentity.value requested.SourceProviderRun)
                  "source_tool_call_ids",
                  Encode.list (
                      requested.SourceToolCallIds
                      |> List.map (fun callId -> Encode.string (ToolCallId.value callId))
                  )
                  "requested_rounds", Encode.int (ReadonlyRoundBudget.value requested.RequestedRounds)
                  "contract_revision", Encode.int (DelegationContractRevisions.value requested.ContractRevision) ]
        | StrengthEvent.DelegationBound bound ->
            Encode.object
                [ "decision_id", Encode.string (decisionText bound.DecisionId)
                  "target_provider_run", Encode.string (ProviderRunIdentity.value bound.TargetProviderRun)
                  "replica_session_id", Encode.string (SessionId.value bound.ReplicaSessionId)
                  "anchor_digest", Encode.string bound.AnchorDigest ]
        | StrengthEvent.DelegationClosed closed ->
            Encode.object
                [ "decision_id", Encode.string (decisionText closed.DecisionId)
                  "closed_from", Encode.string (closedFromText closed.From)
                  "closed_reason", Encode.string (closedReasonText closed.Reason) ]
        | StrengthEvent.Prepared prepared ->
            Encode.object
                [ "owner_session_id", Encode.string (SessionId.value prepared.OwnerSessionId)
                  "decision_id", Encode.string (decisionText prepared.DecisionId)
                  "target_provider_run", Encode.string (ProviderRunIdentity.value prepared.TargetProviderRun)
                  "replica_session_id", Encode.string (SessionId.value prepared.ReplicaSessionId)
                  "anchor_digest", Encode.string prepared.AnchorDigest
                  "frame_digest", Encode.string prepared.FrameDigest
                  "byte_length", Encode.int prepared.ByteLength ]
        | StrengthEvent.Promoted promoted ->
            Encode.object
                [ "owner_session_id", Encode.string (SessionId.value promoted.OwnerSessionId)
                  "decision_id", Encode.string (decisionText promoted.DecisionId)
                  "target_provider_run", Encode.string (ProviderRunIdentity.value promoted.TargetProviderRun)
                  "frame_digest", Encode.string promoted.FrameDigest ]
        | StrengthEvent.Traced traced ->
            Encode.object
                [ "decision_id", Encode.string (decisionText traced.DecisionId)
                  "start_inclusive", Encode.int64 traced.StartInclusive
                  "end_exclusive", Encode.int64 traced.EndExclusive ]
        | StrengthEvent.Abandoned abandoned ->
            Encode.object
                [ "decision_id", Encode.string (decisionText abandoned.DecisionId)
                  "target_provider_run", Encode.string (ProviderRunIdentity.value abandoned.TargetProviderRun) ]

    let encodeFrameBundlePayload (bundle: StrengthFrameBundle) : byte[] =
        let encodeExchange (exchange: StrengthToolExchange) =
            Encode.object
                [ "tool_name", Encode.string exchange.ToolName
                  "arguments", Encode.string exchange.CanonicalArguments
                  "result", Encode.string exchange.CanonicalResult ]

        let encodeBatch (batch: StrengthRequestBatch) =
            Encode.object
                [ "request_ordinal", Encode.int batch.RequestOrdinal
                  "assistant_text", Encode.list (List.map Encode.string batch.AssistantText)
                  "exchanges", Encode.list (List.map encodeExchange batch.Exchanges) ]

        Encode.object
            [ "version", Encode.int 2
              "digest", Encode.string bundle.Digest
              "byte_length", Encode.int bundle.ByteLength
              "batches", Encode.list (List.map encodeBatch bundle.Batches) ]
        |> Encode.toString 0
        |> Encoding.UTF8.GetBytes

    let private validateBundleDigest (digest: string) (byteLength: int) (bundle: StrengthFrameBundle) =
        if bundle.Digest <> digest || bundle.ByteLength <> byteLength then
            Error "Strength frame payload digest/length mismatch"
        else
            Ok bundle

    let decodeFrameBundlePayload (sha256: string -> string) (content: byte[]) : Result<StrengthFrameBundle, string> =
        let exchangeDecoder =
            Decode.object (fun get ->
                { ToolName = get.Required.Field "tool_name" Decode.string
                  CanonicalArguments = get.Required.Field "arguments" Decode.string
                  CanonicalResult = get.Required.Field "result" Decode.string })

        let batchDecoder version =
            Decode.object (fun get ->
                { RequestOrdinal = get.Required.Field "request_ordinal" Decode.int
                  AssistantText =
                    if version = 1 then
                        []
                    else
                        get.Required.Field "assistant_text" (Decode.list Decode.string)
                  Exchanges = get.Required.Field "exchanges" (Decode.list exchangeDecoder) })

        let decoder =
            Decode.object (fun get ->
                let version = get.Required.Field "version" Decode.int

                version,
                get.Required.Field "digest" Decode.string,
                get.Required.Field "byte_length" Decode.int,
                get.Required.Field "batches" (Decode.list (batchDecoder version)))

        Encoding.UTF8.GetString content
        |> Decode.fromString decoder
        |> Result.bind (fun (version, digest, byteLength, batches) ->
            if version <> 1 && version <> 2 then
                Error(sprintf "unsupported Strength frame payload version: %d" version)
            else
                StrengthFrame.tryBuild sha256 batches
                |> Result.mapError (sprintf "invalid Strength frame payload: %A")
                |> Result.bind (validateBundleDigest digest byteLength))

    let private payloadRefsOf =
        function
        | StrengthEvent.Prepared prepared -> prepared.MaterialPayloads
        | StrengthEvent.Promoted promoted -> promoted.MaterialPayloads
        | StrengthEvent.DelegationHistoryImported _
        | StrengthEvent.DelegationRequested _
        | StrengthEvent.DelegationBound _
        | StrengthEvent.DelegationClosed _
        | StrengthEvent.Traced _
        | StrengthEvent.Abandoned _ -> []

    let toEnvelope (sha256: string -> string) (event: StrengthEvent) : EventEnvelope =
        let eventType = kindOf event
        let decisionId = decisionOf event

        EventEnvelope.normalize
            { EventId = eventIdOf sha256 event
              StreamId = streamIdFor decisionId
              EventType = eventType
              Parents = parentsFor sha256 event
              Payload = encodePayload event
              PayloadRefs = payloadRefsOf event
              Payloads = Map.empty }

    let private decodeRequested payload : Result<StrengthEvent, string> =
        let decoder =
            Decode.object (fun get ->
                get.Required.Field "owner_session_id" Decode.string,
                get.Required.Field "decision_id" Decode.string,
                get.Required.Field "logical_run_id" Decode.string,
                get.Required.Field "authority_root_user_message_id" Decode.string,
                get.Required.Field "source_physical_user_message_id" Decode.string,
                get.Required.Field "source_provider_run" Decode.string,
                get.Required.Field "source_tool_call_ids" (Decode.list Decode.string),
                get.Required.Field "requested_rounds" Decode.int,
                get.Required.Field "contract_revision" Decode.int)

        Decode.fromValue "$" decoder payload
        |> Result.bind
            (fun (owner, decision, logicalRun, authorityRoot, sourcePhysical, sourceRun, calls, rounds, revision) ->
                match ReadonlyRoundBudget.tryCreate rounds with
                | Error reason -> Error(sprintf "invalid Strength requested rounds: %s" reason)
                | Ok budget ->
                    Ok(
                        StrengthEvents.requested
                            (StrengthDecisionId.create decision)
                            (SessionId.create owner)
                            { LogicalRunId = LogicalRunId.create logicalRun
                              AuthorityRootUserMessageId = AuthorityRootUserMessageId.create authorityRoot }
                            (PhysicalUserMessageId.create sourcePhysical)
                            (ProviderRunIdentity.create sourceRun)
                            (calls |> List.map ToolCallId.create)
                            budget
                            (DelegationContractRevisions.create revision)
                    ))

    let private decodeBound payload : Result<StrengthEvent, string> =
        let decoder =
            Decode.object (fun get ->
                get.Required.Field "decision_id" Decode.string,
                get.Required.Field "target_provider_run" Decode.string,
                get.Required.Field "replica_session_id" Decode.string,
                get.Required.Field "anchor_digest" Decode.string)

        Decode.fromValue "$" decoder payload
        |> Result.map (fun (decision, target, replica, anchor) ->
            StrengthEvents.bound
                (StrengthDecisionId.create decision)
                (ProviderRunIdentity.create target)
                (SessionId.create replica)
                anchor)

    let private decodeClosed payload : Result<StrengthEvent, string> =
        let decoder =
            Decode.object (fun get ->
                get.Required.Field "decision_id" Decode.string,
                get.Required.Field "closed_from" Decode.string,
                get.Required.Field "closed_reason" Decode.string)

        Decode.fromValue "$" decoder payload
        |> Result.bind (fun (decision, fromText, reasonText) ->
            match closedFromOf fromText, closedReasonOf reasonText with
            | Some from, Some reason -> Ok(StrengthEvents.closed (StrengthDecisionId.create decision) from reason)
            | _ -> Error(sprintf "invalid Strength delegation closed fact: from=%s reason=%s" fromText reasonText))

    let private decodePrepared payload refs : Result<StrengthEvent, string> =
        let decoder =
            Decode.object (fun get ->
                get.Required.Field "owner_session_id" Decode.string,
                get.Required.Field "decision_id" Decode.string,
                get.Required.Field "target_provider_run" Decode.string,
                get.Required.Field "replica_session_id" Decode.string,
                get.Required.Field "anchor_digest" Decode.string,
                get.Required.Field "frame_digest" Decode.string,
                get.Required.Field "byte_length" Decode.int)

        Decode.fromValue "$" decoder payload
        |> Result.map (fun (owner, decision, target, replica, anchor, digest, byteLength) ->
            StrengthEvents.prepared
                (SessionId.create owner)
                (StrengthDecisionId.create decision)
                (ProviderRunIdentity.create target)
                (SessionId.create replica)
                anchor
                digest
                byteLength
                refs)

    let private decodePromoted payload refs : Result<StrengthEvent, string> =
        let decoder =
            Decode.object (fun get ->
                get.Required.Field "owner_session_id" Decode.string,
                get.Required.Field "decision_id" Decode.string,
                get.Required.Field "target_provider_run" Decode.string,
                get.Required.Field "frame_digest" Decode.string)

        match Decode.fromValue "$" decoder payload with
        | Error error -> Error error
        | Ok(owner, decision, target, digest) ->
            Ok(
                StrengthEvents.promoted
                    (SessionId.create owner)
                    (StrengthDecisionId.create decision)
                    (ProviderRunIdentity.create target)
                    digest
                    refs
            )

    let private decodeTraced payload : Result<StrengthEvent, string> =
        let decoder =
            Decode.object (fun get ->
                get.Required.Field "decision_id" Decode.string,
                get.Required.Field "start_inclusive" Decode.int64,
                get.Required.Field "end_exclusive" Decode.int64)

        Decode.fromValue "$" decoder payload
        |> Result.map (fun (decision, startInclusive, endExclusive) ->
            StrengthEvents.traced (StrengthDecisionId.create decision) startInclusive endExclusive)

    let private decodeAbandoned payload : Result<StrengthEvent, string> =
        let decoder =
            Decode.object (fun get ->
                get.Required.Field "decision_id" Decode.string, get.Required.Field "target_provider_run" Decode.string)

        Decode.fromValue "$" decoder payload
        |> Result.map (fun (decision, target) ->
            StrengthEvents.abandoned (StrengthDecisionId.create decision) (ProviderRunIdentity.create target))

    let private decodeImported payload : Result<StrengthEvent, string> =
        let outcomeDecoder =
            Decode.object (fun get ->
                get.Required.Field "kind" Decode.string,
                get.Optional.Field "target_provider_run" Decode.string,
                get.Optional.Field "frame_digest" Decode.string,
                get.Optional.Field "byte_length" Decode.int,
                get.Optional.Field "payload_refs" (Decode.list Decode.string),
                get.Optional.Field "traced_start_inclusive" Decode.int64,
                get.Optional.Field "traced_end_exclusive" Decode.int64,
                get.Optional.Field "reason" Decode.string)

        let decoder =
            Decode.object (fun get ->
                get.Required.Field "decision_id" Decode.string,
                get.Required.Field "source_stream_id" Decode.string,
                get.Required.Field "source_event_id" Decode.string,
                get.Required.Field "import_id" Decode.string,
                get.Optional.Field "old_budget_evidence" Decode.string,
                get.Required.Field "outcome" outcomeDecoder)

        Decode.fromValue "$" decoder payload
        |> Result.bind (fun (decision, sourceStream, sourceEvent, importId, budget, outcome) ->
            match outcome with
            | "adopted", Some target, Some digest, Some byteLength, Some refs, startInclusive, endExclusive, _ ->
                Ok(
                    StrengthEvents.historyImported
                        (StrengthDecisionId.create decision)
                        sourceStream
                        sourceEvent
                        importId
                        budget
                        (DelegationImportOutcome.Adopted
                            { TargetProviderRun = ProviderRunIdentity.create target
                              FrameDigest = digest
                              ByteLength = byteLength
                              MaterialPayloads = refs |> List.map PayloadRef.create
                              TracedStartInclusive = startInclusive
                              TracedEndExclusive = endExclusive })
                )
            | "relinquished", target, _, _, _, _, _, reason ->
                Ok(
                    StrengthEvents.historyImported
                        (StrengthDecisionId.create decision)
                        sourceStream
                        sourceEvent
                        importId
                        budget
                        (DelegationImportOutcome.Relinquished
                            { TargetProviderRun = target |> Option.map ProviderRunIdentity.create
                              Reason = Option.defaultValue "" reason })
                )
            | other, _, _, _, _, _, _, _ -> Error(sprintf "invalid Strength delegation import outcome: %s" other))

    let tryDecodeEnvelope (envelope: EventEnvelope) : Result<StrengthEvent, string> =
        match envelope.EventType with
        | eventType when eventType = StrengthEventTypes.DelegationHistoryImported -> decodeImported envelope.Payload
        | eventType when eventType = StrengthEventTypes.DelegationRequested -> decodeRequested envelope.Payload
        | eventType when eventType = StrengthEventTypes.DelegationBound -> decodeBound envelope.Payload
        | eventType when eventType = StrengthEventTypes.DelegationClosed -> decodeClosed envelope.Payload
        | eventType when eventType = StrengthEventTypes.CandidatePrepared ->
            decodePrepared envelope.Payload envelope.PayloadRefs
        | eventType when eventType = StrengthEventTypes.CandidatePromoted ->
            decodePromoted envelope.Payload envelope.PayloadRefs
        | eventType when eventType = StrengthEventTypes.FramesTraced -> decodeTraced envelope.Payload
        | eventType when eventType = StrengthEventTypes.CandidateAbandoned -> decodeAbandoned envelope.Payload
        | other -> Error(sprintf "not a Strength event: %s" other)

    let private requireFrameMatches (prepared: StrengthCandidatePrepared) (bundle: StrengthFrameBundle) =
        if bundle.Digest <> prepared.FrameDigest then
            Error "Strength Prepared frame digest does not match payload"
        elif bundle.ByteLength <> prepared.ByteLength then
            Error "Strength Prepared byte length does not match payload"
        else
            Ok()

    let loadFrameBundle
        (store: IEventStore)
        (sha256: string -> string)
        (prepared: StrengthCandidatePrepared)
        : Task<Result<StrengthFrameBundle, string>> =
        taskResult {
            match prepared.MaterialPayloads with
            | [ payloadRef ] ->
                let! payloadOpt = store.ReadPayload payloadRef

                let! bytes =
                    payloadOpt
                    |> Option.map Ok
                    |> Option.defaultValue (
                        Error(sprintf "missing Strength frame payload: %s" (PayloadRef.value payloadRef))
                    )

                let! bundle = decodeFrameBundlePayload sha256 bytes
                do! requireFrameMatches prepared bundle
                return bundle
            | [] -> return! Error "Strength Prepared has no frame payload"
            | _ -> return! Error "Strength Prepared has ambiguous frame payload closure"
        }

    let private appendReceiptResult eventId (receipt: AppendReceipt) =
        match AppendReceipt.cutFor eventId receipt with
        | Some cut -> Error(AppendError.SemanticCut cut)
        | None -> Ok()

    let append
        (store: IEventStore)
        (sha256: string -> string)
        (event: StrengthEvent)
        : Task<Result<unit, EventId * AppendError>> =
        task {
            let envelope = toEnvelope sha256 event

            match! store.Append [ envelope ] with
            | Ok receipt ->
                return
                    appendReceiptResult envelope.EventId receipt
                    |> Result.mapError (fun error -> envelope.EventId, error)
            | Error error -> return Error(envelope.EventId, error)
        }

    let private publishReceiptResult event eventId (receipt: AppendReceipt) =
        match AppendReceipt.cutFor eventId receipt with
        | Some cut -> Error(PublishError.SemanticCut cut)
        | None -> Ok event

    /// STRENGTH-006: payload bytes become local content-addressed PayloadRefs
    /// before the Prepared event is appended. Git object identity is absent from
    /// the runtime path; remote sync blobifies these files later.
    let private appendToPublish eventId =
        function
        | AppendError.StorageInvalid error -> PublishError.StorageInvalid error
        | AppendError.SemanticCut cut -> PublishError.SemanticCut cut
        | AppendError.AppendFailed reason -> PublishError.PublishFailed reason
        | (AppendError.AppendNotAttempted _ | AppendError.CommitUnknown _ | AppendError.NoNewWriteReleaseFailed _) as failure ->
            PublishError.AppendSettlementFailed(eventId, failure)

    let publishWithPayloads
        (store: IEventStore)
        (sha256: string -> string)
        (contents: byte[] list)
        (buildEvent: PayloadRef list -> StrengthEvent)
        : Task<Result<StrengthEvent, PublishError>> =
        let writePayloads: Task<Result<PayloadRef list, PublishError>> =
            contents
            |> TaskResultList.traverseM (fun bytes ->
                store.WritePayload bytes |> TaskResult.mapError PublishError.PublishFailed)
            |> TaskValue.map (Result.map PayloadRefs.canonicalize)

        taskResult {
            let! payloadRefs = writePayloads
            let event = buildEvent payloadRefs
            let envelope = toEnvelope sha256 event

            let! receipt =
                store.Append [ envelope ]
                |> TaskResult.mapError (appendToPublish envelope.EventId)

            return! publishReceiptResult event envelope.EventId receipt
        }
