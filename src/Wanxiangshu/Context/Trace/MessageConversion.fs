namespace Wanxiangshu.Context.Trace

open System
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.OpenCode
open Wanxiangshu.Participant.Provider
open Wanxiangshu.Participant.Provider.Projection.ProviderProjection

[<RequireQualifiedAccess>]
module XTraceMessageConversion =
    let semanticPart (part: MessagePart) : SemanticPart option =
        match part with
        | MessagePart.Text text -> Some(SemanticText text)
        | MessagePart.Reasoning text -> Some(SemanticReasoning text)
        | MessagePart.ToolCall(_callId, name, args) -> Some(SemanticToolCall(name, args))
        | MessagePart.ToolResult(_callId, result) -> Some(SemanticToolResult result)
        | MessagePart.Activity _ -> None

    let toCapturedWire (message: SessionMessage) : CapturedWireMessage =
        let hostToolByCall =
            message.ToolParts
            |> Array.fold (fun acc part -> Map.add (ToolCallId.value part.ToolCallId) part.HostToolPartId acc) Map.empty

        { Role = message.Role
          ProviderRun =
            if message.Role = "assistant" && not (String.IsNullOrWhiteSpace message.Id) then
                Some(ProviderRunIdentity.create message.Id)
            else
                None
          Parts =
            message.Parts
            |> Array.mapi (fun index part ->
                let hostPartId =
                    if index < message.PartIds.Length then
                        message.PartIds.[index]
                    else
                        None

                part, hostPartId)
            |> Array.toList
            |> List.choose (fun (part, hostPartId) ->
                match part with
                | MessagePart.Text text ->
                    Some
                        { WirePart = WireText text
                          HostPartId = hostPartId
                          HostToolPartId = None }
                | MessagePart.Reasoning text ->
                    Some
                        { WirePart = WireReasoning text
                          HostPartId = hostPartId
                          HostToolPartId = None }
                | MessagePart.ToolCall(callId, name, args) ->
                    let hostToolPartId = Map.tryFind callId hostToolByCall

                    Some
                        { WirePart = WireToolCall(ToolCallId.create callId, name, args)
                          HostPartId =
                            hostPartId
                            |> Option.orElseWith (fun () ->
                                hostToolPartId |> Option.map (HostToolPartId.value >> HostMessagePartId.create))
                          HostToolPartId = hostToolPartId }
                | MessagePart.ToolResult(callId, result) ->
                    let hostToolPartId = Map.tryFind callId hostToolByCall

                    Some
                        { WirePart = WireToolResult(ToolCallId.create callId, result)
                          HostPartId =
                            hostPartId
                            |> Option.orElseWith (fun () ->
                                hostToolPartId |> Option.map (HostToolPartId.value >> HostMessagePartId.create))
                          HostToolPartId = hostToolPartId }
                | MessagePart.Activity _ -> None) }
