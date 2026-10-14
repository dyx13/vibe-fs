namespace Wanxiangshu.OpenCode

open System
open Fable.Core
open Fable.Core.JsInterop
open Wanxiangshu.Participant.Provider

/// Raw OpenCode part codec. This is the only message-part module allowed to
/// inspect dynamic Host objects.
module HostMessageCodec =

    let private readField (value: obj) (name: string) : obj =
        if isNull value then
            null
        else
            emitJsExpr (value, name) "$0[$1]"

    let private readString (value: obj) (name: string) =
        let field = readField value name

        if isNull field then
            None
        else
            let text = unbox<string> field
            if String.IsNullOrWhiteSpace text then None else Some text

    let private canonicalArgs (value: obj) =
        if isNull value then
            "null"
        elif emitJsExpr value "typeof $0 === 'string'" then
            unbox<string> value
        else
            Wanxiangshu.Foundation.CanonicalJson.canonicalJson value

    let private firstCanonical (value: obj) (fields: string list) =
        fields
        |> List.tryPick (fun field ->
            let candidate = readField value field

            if isNull candidate then
                None
            else
                Some(canonicalArgs candidate))

    let private decodePendingToolCall raw callId name state =
        let args =
            firstCanonical state [ "input" ]
            |> Option.orElse (firstCanonical raw [ "args"; "arguments" ])
            |> Option.defaultValue "{}"

        match String.IsNullOrWhiteSpace name && String.IsNullOrWhiteSpace callId with
        | true -> None
        | false -> Some(MessagePart.ToolCall(callId, name, args))

    let private decodeToolCall raw =
        let callId =
            readString raw "callID"
            |> Option.orElse (readString raw "callId")
            |> Option.orElse (readString raw "id")
            |> Option.defaultValue ""

        let name =
            readString raw "tool"
            |> Option.orElse (readString raw "name")
            |> Option.defaultValue ""

        let state = readField raw "state"

        let status =
            readString state "status" |> Option.map (fun value -> value.ToLowerInvariant())

        match status with
        | Some "completed" when not (String.IsNullOrWhiteSpace callId) ->
            let result =
                firstCanonical state [ "output"; "result"; "content" ]
                |> Option.defaultValue "null"

            Some(MessagePart.ToolResult(callId, result))
        | Some "error" when not (String.IsNullOrWhiteSpace callId) ->
            let result =
                firstCanonical state [ "error"; "errorText"; "output" ]
                |> Option.defaultValue "null"

            Some(MessagePart.ToolResult(callId, result))
        | _ -> decodePendingToolCall raw callId name state

    let private decodeNonNullPart raw =
        let kind =
            readString raw "type"
            |> Option.defaultValue ""
            |> fun value -> value.ToLowerInvariant()

        match kind with
        | "text" -> readString raw "text" |> Option.map MessagePart.Text
        | "reasoning"
        | "thinking" ->
            readString raw "text"
            |> Option.orElse (readString raw "reasoning")
            |> Option.orElse (readString raw "thinking")
            |> Option.map MessagePart.Reasoning
        | "tool-call"
        | "tool_call"
        | "tool" -> decodeToolCall raw
        | "tool-result"
        | "tool_result" ->
            let callId =
                readString raw "callID"
                |> Option.orElse (readString raw "callId")
                |> Option.orElse (readString raw "id")
                |> Option.defaultValue ""

            let result =
                firstCanonical raw [ "result"; "output"; "content" ]
                |> Option.defaultValue "null"

            Some(MessagePart.ToolResult(callId, result))
        | "patch"
        | "step-start"
        | "step-finish"
        | "step_start"
        | "step_finish" -> Some(MessagePart.Activity(kind.Replace('_', '-')))
        | _ -> None

    let decodePart (raw: obj) : MessagePart option =
        if isNull raw then None else decodeNonNullPart raw

    let decodeParts (rawParts: obj array) =
        if isNull rawParts then
            [||]
        else
            rawParts |> Array.choose decodePart
