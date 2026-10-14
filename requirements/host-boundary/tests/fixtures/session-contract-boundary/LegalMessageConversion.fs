namespace Wanxiangshu.Host.CompilerProbe

open Wanxiangshu.Context.Trace
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.OpenCode
open Wanxiangshu.Participant.Provider
open Wanxiangshu.Participant.Provider.Projection.ProviderProjection

module LegalMessageConversion =
    let verify () =
        let body = " 中文\r\n\u0000尾部 "
        let reasoning = "\t推理\r\n "
        let args = "{ \"z\": 2, \"a\": 1 }\n"
        let output = " 结果\r\n "

        let tool callId hostId =
            { HostToolPartId = HostToolPartId.create hostId
              ToolCallId = ToolCallId.create callId
              ToolName = "read"
              InputCanonical = args
              State = SnapshotToolPartState.Pending }

        let message: SessionMessage =
            { Id = "run-byte"
              Role = "assistant"
              Agent = None
              Finish = Some "tool-calls"
              ErrorName = None
              Model = None
              ParentId = Some "physical-byte"
              CreatedAt = Some 4.0
              Completed = true
              IsCompaction = false
              PromptKey = None
              Parts =
                [| MessagePart.Activity "patch"
                   MessagePart.Text body
                   MessagePart.ToolCall("call-a", "read", args)
                   MessagePart.Activity "step-start"
                   MessagePart.ToolResult("call-b", output)
                   MessagePart.Reasoning reasoning
                   MessagePart.ToolResult("call-a", output) |]
              PartIds =
                [| Some(HostMessagePartId.create "activity-0")
                   Some(HostMessagePartId.create "text-part")
                   Some(HostMessagePartId.create "call-part")
                   Some(HostMessagePartId.create "activity-1")
                   None |]
              ToolParts = [| tool "call-b" "host-b"; tool "call-a" "host-a" |] }

        let captured = XTraceMessageConversion.toCapturedWire message

        let ids =
            captured.Parts
            |> List.map (fun part -> part.HostPartId |> Option.map HostMessagePartId.value)

        if
            ids
            <> [ Some "text-part"; Some "call-part"; Some "host-b"; None; Some "host-a" ]
        then
            failwith "Parts must pair with original positions before Activity filtering"

        if captured.ProviderRun <> Some(ProviderRunIdentity.create "run-byte") then
            failwith "Assistant provider identity changed"

        let toolIds =
            captured.Parts
            |> List.map (fun part -> part.HostToolPartId |> Option.map HostToolPartId.value)

        if toolIds <> [ None; Some "host-a"; Some "host-b"; None; Some "host-a" ] then
            failwith "Tool identities must pair by callId, not tool order"

        if
            captured.Parts |> List.map (fun part -> part.WirePart)
            <> [ WireText body
                 WireToolCall(ToolCallId.create "call-a", "read", args)
                 WireToolResult(ToolCallId.create "call-b", output)
                 WireReasoning reasoning
                 WireToolResult(ToolCallId.create "call-a", output) ]
        then
            failwith "Captured message bytes or tool call identities changed"

        if
            XTraceMessageConversion.semanticPart message.Parts.[2]
            <> Some(SemanticToolCall("read", args))
        then
            failwith "Semantic projection must remove callId only at its boundary"

        if XTraceMessageConversion.semanticPart message.Parts.[0] <> None then
            failwith "Activity entered semantic projection"

        let missingTool =
            XTraceMessageConversion.toCapturedWire
                { message with
                    PartIds = [||]
                    ToolParts = [||] }

        if
            missingTool.Parts
            |> List.exists (fun part -> part.HostPartId.IsSome || part.HostToolPartId.IsSome)
        then
            failwith "Missing tool identity must remain missing"

        for altered in [ { message with Role = "user" }; { message with Id = " " } ] do
            if (XTraceMessageConversion.toCapturedWire altered).ProviderRun.IsSome then
                failwith "Capture invented provider identity"
