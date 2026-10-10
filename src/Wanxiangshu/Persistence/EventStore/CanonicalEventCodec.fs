namespace Wanxiangshu.Persistence.EventStore

open Fable.Core
open Fable.Core.JsInterop
open Wanxiangshu.Foundation.Identity

/// §5.0 canonical event bytes: UTF-8, no BOM, single trailing LF,
/// recursive Unicode-codepoint key order, parents / payload_refs set-normalized.
module CanonicalEventCodec =

    [<Emit("Buffer.from($0).toString('base64')")>]
    let private base64OfBytes (bytes: byte[]) : string = jsNative

    [<Emit("Buffer.from($0, 'base64')")>]
    let private bytesOfBase64 (value: string) : byte[] = jsNative

    let private payloadsObject (payloads: Map<PayloadRef, byte[]>) : obj =
        payloads
        |> Map.toList
        |> List.map (fun (payloadRef, bytes) -> PayloadRef.value payloadRef, box (base64OfBytes bytes))
        |> createObj

    let private payloadsOfParsed (parsed: obj) : Map<PayloadRef, byte[]> =
        if isNull parsed || isNull (parsed?payloads) then
            Map.empty
        else
            emitJsExpr parsed "Object.keys($0.payloads || {}).map(function (key) { return [key, $0.payloads[key]]; })"
            |> unbox<(string * string) array>
            |> Array.fold (fun acc (key, value) -> Map.add (PayloadRef.create key) (bytesOfBase64 value) acc) Map.empty

    let private envelopeObject (envelope: EventEnvelope) : obj =
        let normalized = EventEnvelope.normalize envelope

        let fields =
            [ "event_id" ==> EventId.value normalized.EventId
              "stream_id" ==> EventStreamId.value normalized.StreamId
              "event_type" ==> normalized.EventType
              "parents" ==> (normalized.Parents |> List.map EventId.value |> Array.ofList)
              "payload" ==> normalized.Payload
              "payload_refs"
              ==> (normalized.PayloadRefs |> List.map PayloadRef.value |> Array.ofList) ]

        // durable-events-012: `payloads` appears exactly when the event carries
        // inline payload content. An empty object would rewrite the canonical
        // bytes of every payload-free event without adding truth.
        let payloads =
            if Map.isEmpty normalized.Payloads then
                []
            else
                [ "payloads" ==> payloadsObject normalized.Payloads ]

        createObj (fields @ payloads)

    /// Canonical JSON text including exactly one trailing LF (§5.0).
    let encode (envelope: EventEnvelope) : string =
        let json =
            Wanxiangshu.Foundation.CanonicalJson.canonicalJson (envelopeObject envelope)

        json + "\n"

    /// Same EventId with different canonical bytes → IdentityCollision (§5.3).
    /// Distinct EventIds are not a collision (Ok).
    let checkIdentity (left: EventEnvelope) (right: EventEnvelope) : Result<unit, StorageInvalid> =
        if left.EventId <> right.EventId then Ok()
        elif encode left = encode right then Ok()
        else Error(StorageInvalid.IdentityCollision left.EventId)

    let private mergeOne (head: EventEnvelope) (tail: EventEnvelope list) (acc: Map<string, EventEnvelope * string>) =
        let normalized = EventEnvelope.normalize head
        let id = EventId.value normalized.EventId
        let bytes = encode normalized

        match Map.tryFind id acc with
        | Some(_, existingBytes) when existingBytes = bytes -> Ok(tail, acc)
        | Some _ -> Error(StorageInvalid.IdentityCollision normalized.EventId)
        | None -> Ok(tail, Map.add id (normalized, bytes) acc)

    /// Set-union by EventId with identity dedupe. Collision → fail closed.
    /// This is a pure identity utility; writer-stream ordering belongs to EventKWayMerge.
    let mergeByIdentity (events: EventEnvelope list) : Result<EventEnvelope list, StorageInvalid> =
        let rec loop remaining (acc: Map<string, EventEnvelope * string>) =
            match remaining with
            | [] ->
                acc
                |> Map.toList
                |> List.sortBy fst
                |> List.map (fun (_, (envelope, _)) -> envelope)
                |> Ok
            | head :: tail -> mergeOne head tail acc |> Result.bind (fun (next, updated) -> loop next updated)

        loop events Map.empty

    [<Emit("""
    (function (value) {
      function sortedUnique(values) {
        for (let i = 1; i < values.length; i += 1) {
          if (!(values[i - 1] < values[i])) return false;
        }
        return true;
      }

      const allowed = new Set(['event_id', 'event_type', 'parents', 'payload', 'payload_refs', 'payloads', 'stream_id']);
      const payloads = value.payloads || {};
      const payloadKeys = Object.keys(payloads).sort();
      const sortedPayloadKeys = payloadKeys.every((key, i) => i === 0 || payloadKeys[i - 1] < key);
      return Object.keys(value).every(key => allowed.has(key))
        && sortedUnique(value.parents)
        && sortedUnique(value.payload_refs)
        && sortedPayloadKeys;
    })($0)
    """)>]
    let private hasCanonicalStructure (parsed: obj) : bool = jsNative

    let private hasCanonicalJsonText (parsed: obj) (text: string) : bool =
        Wanxiangshu.Foundation.CanonicalJson.canonicalJson parsed + "\n" = text

    let private ensureCanonicalParsed (text: string) (parsed: obj) =
        if hasCanonicalStructure parsed && hasCanonicalJsonText parsed text then
            Ok()
        else
            Error(StorageInvalid.NonCanonical "event bytes are not §5.0 canonical")

    let private decodeParsed (text: string) (parsed: obj) : Result<EventEnvelope, StorageInvalid> =
        let hasShape: bool =
            emitJsExpr
                parsed
                "!!$0 && typeof $0 === 'object' && typeof $0.event_id === 'string' && typeof $0.stream_id === 'string' && typeof $0.event_type === 'string' && Array.isArray($0.parents) && Array.isArray($0.payload_refs)"

        if not hasShape then
            Error(StorageInvalid.MalformedEnvelope "event JSON missing required fields")
        else
            ensureCanonicalParsed text parsed
            |> Result.map (fun () ->
                { EventId = EventId.create (unbox<string> parsed?event_id)
                  StreamId = EventStreamId.create (unbox<string> parsed?stream_id)
                  EventType = unbox<string> parsed?event_type
                  Parents = (unbox<string[]> parsed?parents) |> Array.toList |> List.map EventId.create
                  Payload = parsed?payload
                  PayloadRefs =
                    (unbox<string[]> parsed?payload_refs)
                    |> Array.toList
                    |> List.map PayloadRef.create
                  Payloads = payloadsOfParsed parsed })

    let private tryDecodeCanonical (text: string) : Result<EventEnvelope, StorageInvalid> =
        try
            let body = text.Substring(0, text.Length - 1)
            let parsed = JS.JSON.parse body
            decodeParsed text parsed
        with ex ->
            Error(StorageInvalid.MalformedEnvelope ex.Message)

    /// Decode canonical JSON+LF into EventEnvelope. Re-encode must match (§5.0).
    let tryDecode (text: string) : Result<EventEnvelope, StorageInvalid> =
        if isNull text then
            Error(StorageInvalid.MalformedEnvelope "null event text")
        elif not (text.EndsWith("\n")) || text.EndsWith("\n\n") then
            Error(StorageInvalid.NonCanonical "event bytes must end with exactly one LF")
        else
            tryDecodeCanonical text

    [<Emit("new TextDecoder('utf-8', { fatal: true }).decode($0)")>]
    let private decodeUtf8Fatal (bytes: byte[]) : string = jsNative

    [<Emit("$0.length >= 3 && $0[0] === 0xef && $0[1] === 0xbb && $0[2] === 0xbf")>]
    let private hasUtf8Bom (bytes: byte[]) : bool = jsNative

    let private decodeUtf8WithoutBom bytes =
        try
            Ok(decodeUtf8Fatal bytes)
        with _ ->
            Error(StorageInvalid.NonCanonical "event bytes are not valid UTF-8")

    let tryDecodeUtf8Text (bytes: byte[]) : Result<string, StorageInvalid> =
        if hasUtf8Bom bytes then
            Error(StorageInvalid.NonCanonical "event bytes must not contain a BOM")
        else
            decodeUtf8WithoutBom bytes

    let tryDecodeUtf8 (bytes: byte[]) : Result<EventEnvelope, StorageInvalid> =
        tryDecodeUtf8Text bytes |> Result.bind tryDecode
