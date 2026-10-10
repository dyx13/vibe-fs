namespace Wanxiangshu.Persistence.EventStore

open Fable.Core
open Fable.Core.JsInterop
open Thoth.Json
open Wanxiangshu.Foundation.Identity

/// Semantic owner for deterministic k-way ordering of writer streams.
[<RequireQualifiedAccess>]
module EventMergeSurface =

    [<Emit("typeof($0)==='string'")>]
    let private isString (value: obj) : bool = jsNative

    let private str (value: obj) : string =
        if isNull value then "" else string value

    let private parsePayload (value: obj) : JsonValue =
        if isNull value then
            unbox<JsonValue> null
        elif isString value then
            unbox<JsonValue> (JS.JSON.parse (unbox<string> value))
        else
            unbox<JsonValue> value

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
          Payload = parsePayload (value?payload)
          PayloadRefs = refs (value?payloadRefs)
          Payloads = payloadsOfJs (value?payloads) }
        |> EventEnvelope.normalize

    let private eventToJs (event: EventEnvelope) : obj =
        box
            {| id = EventId.value event.EventId
               stream = EventStreamId.value event.StreamId
               ``type`` = event.EventType
               parents = event.Parents |> List.map EventId.value |> List.toArray
               payload = event.Payload
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

    let private streamsOfJs (streams: obj array) =
        streams
        |> Array.toList
        |> List.map (fun pair ->
            let values = unbox<obj array> pair
            let writer = str values[0]
            let events = unbox<obj array> values[1] |> Array.toList |> List.map eventOfJs
            writer, events)

    let private resultToJs result : obj =
        match result with
        | Ok events ->
            box
                {| ok = true
                   events = events |> List.map eventToJs |> List.toArray |}
        | Error error ->
            box
                {| ok = false
                   error = invalidToJs error |}

    /// Merge named JS-native writer streams. Writer names only break impossible
    /// duplicate ties; causal readiness and EventId determine the order.
    let merge (streams: obj array) : obj =
        streams |> streamsOfJs |> EventKWayMerge.merge |> resultToJs

    let mergeWithDiagnostics (streams: obj array) : obj =
        let observation = streams |> streamsOfJs |> EventKWayMerge.mergeWithDiagnostics
        let diagnostics = {| readyComparisons = string observation.ReadyComparisons |}

        match observation.Result with
        | Ok events ->
            box
                {| ok = true
                   events = events |> List.map eventToJs |> List.toArray
                   diagnostics = diagnostics |}
        | Error error ->
            box
                {| ok = false
                   error = invalidToJs error
                   diagnostics = diagnostics |}
