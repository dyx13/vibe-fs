namespace Wanxiangshu.Persistence.EventStore

open Fable.Core
open Fable.Core.JsInterop
open Thoth.Json
open Wanxiangshu.Foundation.Identity

/// Semantic owner for canonical EventEnvelope bytes and identity laws.
[<RequireQualifiedAccess>]
module EventCodecSurface =

    let private str (value: obj) : string =
        if isNull value then "" else string value

    let private payloadJson (value: obj) : string =
        match value with
        | null -> "null"
        | :? string as text -> text
        | _ -> JS.JSON.stringify value

    let private ids (value: obj) : EventId list =
        if isNull value then
            []
        else
            unbox<string array> value |> Array.toList |> List.map EventId.create

    let private refs (value: obj) : PayloadRef list =
        if isNull value then
            []
        else
            unbox<string array> value |> Array.toList |> List.map PayloadRef.create

    [<Emit("Buffer.from($0, 'base64')")>]
    let private bytesOfBase64 (value: string) : byte[] = jsNative

    let private payloadsOfJs (value: obj) : Map<PayloadRef, byte[]> =
        if isNull value then
            Map.empty
        else
            emitJsExpr value "Object.keys($0 || {}).map(function (key) { return [key, $0[key]]; })"
            |> unbox<(string * string) array>
            |> Array.fold
                (fun acc (key, base64) -> Map.add (PayloadRef.create key) (bytesOfBase64 base64) acc)
                Map.empty

    let private eventOfJs (value: obj) : EventEnvelope =
        { EventId = EventId.create (str (value?id))
          StreamId = EventStreamId.create (str (value?stream))
          EventType = str (value?``type``)
          Parents = ids (value?parents)
          Payload = unbox<JsonValue> (JS.JSON.parse (payloadJson (value?payload)))
          PayloadRefs = refs (value?payloadRefs)
          Payloads = payloadsOfJs (value?payloads) }
        |> EventEnvelope.normalize

    let private eventToJs (event: EventEnvelope) : obj =
        let payload =
            CanonicalEventCodec.encode event
            |> (fun text -> text.TrimEnd('\n'))
            |> JS.JSON.parse
            |> fun envelope -> envelope?payload

        box
            {| id = EventId.value event.EventId
               stream = EventStreamId.value event.StreamId
               ``type`` = event.EventType
               parents = event.Parents |> List.map EventId.value |> List.toArray
               payload = payload
               payloadRefs = event.PayloadRefs |> List.map PayloadRef.value |> List.toArray |}

    let private invalidToJs (error: StorageInvalid) : obj =
        match error with
        | StorageInvalid.IdentityCollision eventId ->
            box
                {| code = "IdentityCollision"
                   eventId = EventId.value eventId |}
        | StorageInvalid.NonCanonical reason ->
            box
                {| code = "NonCanonical"
                   reason = reason |}
        | StorageInvalid.MalformedEnvelope reason ->
            box
                {| code = "MalformedEnvelope"
                   reason = reason |}
        | StorageInvalid.MissingParent eventId ->
            box
                {| code = "MissingParent"
                   eventId = EventId.value eventId |}
        | StorageInvalid.CyclicParents -> box {| code = "CyclicParents" |}
        | StorageInvalid.MissingPayload payloadRef ->
            box
                {| code = "MissingPayload"
                   payloadRef = PayloadRef.value payloadRef |}
        | StorageInvalid.UnknownEventType eventType ->
            box
                {| code = "UnknownEventType"
                   eventType = eventType |}

    /// Encode one JS-native event as canonical JSON followed by exactly one LF.
    let encode (event: obj) : string =
        eventOfJs event |> CanonicalEventCodec.encode

    /// Decode canonical bytes without exposing EventEnvelope or Fable values.
    let decode (bytes: string) : obj =
        match CanonicalEventCodec.tryDecode bytes with
        | Ok event -> box {| ok = true; event = eventToJs event |}
        | Error error ->
            box
                {| ok = false
                   error = invalidToJs error |}

    /// Decode raw UTF-8 bytes to text without parsing an EventEnvelope.
    let decodeUtf8Text (bytes: byte[]) : obj =
        match CanonicalEventCodec.tryDecodeUtf8Text bytes with
        | Ok text -> box {| ok = true; text = text |}
        | Error error ->
            box
                {| ok = false
                   error = invalidToJs error |}

    /// Decode raw UTF-8 bytes before parsing; malformed byte sequences fail closed.
    let decodeUtf8 (bytes: byte[]) : obj =
        match CanonicalEventCodec.tryDecodeUtf8 bytes with
        | Ok event -> box {| ok = true; event = eventToJs event |}
        | Error error ->
            box
                {| ok = false
                   error = invalidToJs error |}

    /// Compare identity bytes for two JS-native events.
    let checkIdentity (left: obj) (right: obj) : obj =
        match CanonicalEventCodec.checkIdentity (eventOfJs left) (eventOfJs right) with
        | Ok() -> box {| ok = true |}
        | Error error ->
            box
                {| ok = false
                   error = invalidToJs error |}

    /// Set-union events by EventId with canonical-byte collision detection.
    let mergeByIdentity (events: obj array) : obj =
        match
            events
            |> Array.toList
            |> List.map eventOfJs
            |> CanonicalEventCodec.mergeByIdentity
        with
        | Ok merged ->
            box
                {| ok = true
                   events = merged |> List.map eventToJs |> List.toArray |}
        | Error error ->
            box
                {| ok = false
                   error = invalidToJs error |}
