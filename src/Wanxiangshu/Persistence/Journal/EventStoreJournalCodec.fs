namespace Wanxiangshu.Persistence.Journal

open System
open Fable.Core
open Thoth.Json
open Wanxiangshu.Persistence.EventStore
open Wanxiangshu.Foundation.Identity

/// Bidirectional Journal.Envelope ↔ Domain.EventEnvelope (W1-codec).
///
/// Contract with G4U18W1Vocab: EventType is exactly `"JournalEnvelope"`.
/// No NDJSON file I/O; no RuntimePath blob writes — PayloadRefs are opaque
/// handles the writer fills later.
module EventStoreJournalCodec =

    /// Authoritative event_type for journal lines lifted into EventStore.
    let JournalEnvelopeEventType = "JournalEnvelope"

    /// Deterministic Journal.StreamId → EventStreamId encoding (stable scheme).
    ///
    /// | Journal.StreamId     | EventStreamId string              |
    /// |----------------------|-----------------------------------|
    /// | Workspace            | `journal/workspace`               |
    /// | Session \<id\>       | `journal/session/<SessionId>`     |
    /// | Child \<id\>         | `journal/child/<ChildId>`         |
    /// | Process \<id\>       | `journal/process/<ProcessId>`     |
    ///
    /// Identity segments are the typed id's canonical string value (opaque;
    /// may contain `/`). Prefixes are fixed and disjoint.
    let encodeStreamId (stream: StreamId) : EventStreamId =
        match stream with
        | Workspace -> EventStreamId.create "journal/workspace"
        | Session id -> EventStreamId.create ("journal/session/" + SessionId.value id)
        | Child id -> EventStreamId.create ("journal/child/" + ChildId.value id)
        | Process id -> EventStreamId.create ("journal/process/" + ProcessId.value id)

    let private decodeIdSegment
        (prefix: string)
        (emptyError: string)
        (create: string -> 'a)
        (raw: string)
        : Result<'a, string> =
        let id = raw.Substring(prefix.Length)

        if String.IsNullOrEmpty id then
            Error emptyError
        else
            Ok(create id)

    let tryDecodeStreamId (streamId: EventStreamId) : Result<StreamId, string> =
        let raw = EventStreamId.value streamId

        if raw = "journal/workspace" then
            Ok Workspace
        elif raw.StartsWith("journal/session/", StringComparison.Ordinal) then
            decodeIdSegment "journal/session/" "empty session id in EventStreamId" SessionId.create raw
            |> Result.map Session
        elif raw.StartsWith("journal/child/", StringComparison.Ordinal) then
            decodeIdSegment "journal/child/" "empty child id in EventStreamId" ChildId.create raw
            |> Result.map Child
        elif raw.StartsWith("journal/process/", StringComparison.Ordinal) then
            decodeIdSegment "journal/process/" "empty process id in EventStreamId" ProcessId.create raw
            |> Result.map Process
        else
            Error(sprintf "unrecognized journal EventStreamId: %s" raw)

    let private payloadFromEnvelope (envelope: Envelope) : JsonValue =
        // Envelope.serialize pins ObservedAt to +00:00 and uses FactCodec-safe Auto JSON.
        // Parse to an object so CanonicalEventCodec can nest it under `payload` (§5.0).
        unbox<JsonValue> (JS.JSON.parse (Envelope.serialize envelope))

    let private envelopeFromPayload (payload: JsonValue) : Result<Envelope, string> =
        try
            Envelope.deserializeValue payload
        with ex ->
            Error ex.Message

    /// Encode a journal Envelope as a Domain EventEnvelope.
    ///
    /// - EventId is preserved from the journal Envelope.
    /// - parents: explicit causal predecessors (writer supplies the linear
    ///   same-stream predecessor later); canonicalized via EventParents.
    /// - payloadRefs: opaque large-body handles (writer fills later); codec
    ///   never materializes RuntimePath blobs/.
    let encode (parents: EventId list) (payloadRefs: PayloadRef list) (envelope: Envelope) : EventEnvelope =
        EventEnvelope.normalize
            { EventId = envelope.EventId
              StreamId = encodeStreamId envelope.Stream
              EventType = JournalEnvelopeEventType
              Parents = parents
              Payload = payloadFromEnvelope envelope
              PayloadRefs = payloadRefs
              Payloads = Map.empty }

    let private ensureStreamMatches (stream: StreamId) (decoded: Envelope) =
        if stream <> decoded.Stream then
            Error "EventStreamId does not match journal payload Stream"
        else
            Ok decoded

    let private ensureStreamId (event: EventEnvelope) (decoded: Envelope) =
        tryDecodeStreamId event.StreamId
        |> Result.bind (fun stream -> ensureStreamMatches stream decoded)

    let private validateDecoded (event: EventEnvelope) (decoded: Envelope) =
        if decoded.EventId <> event.EventId then
            Error "EventId mismatch between EventEnvelope and journal payload"
        else
            ensureStreamId event decoded

    /// Decode a Domain EventEnvelope back to a journal Envelope.
    /// Requires EventType = JournalEnvelope; EventId / Stream must agree with payload.
    let tryDecode (event: EventEnvelope) : Result<Envelope, string> =
        if event.EventType <> JournalEnvelopeEventType then
            Error(sprintf "expected EventType %s, got %s" JournalEnvelopeEventType event.EventType)
        else
            envelopeFromPayload event.Payload |> Result.bind (validateDecoded event)
