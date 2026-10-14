namespace Wanxiangshu.Host.CompilerProbe

open Wanxiangshu.Participant.Provider

module LegalMessageEvidence =
    let verify () =
        let parts =
            [| MessagePart.Text " 文本\r\n "
               MessagePart.Reasoning " 推理\n "
               MessagePart.ToolCall("call-byte", "read", "{ \"z\": 2 }\n")
               MessagePart.ToolResult("call-byte", " 结果\r\n ")
               MessagePart.Activity "step-start" |]

        match parts with
        | [| MessagePart.Text " 文本\r\n "
             MessagePart.Reasoning " 推理\n "
             MessagePart.ToolCall("call-byte", "read", "{ \"z\": 2 }\n")
             MessagePart.ToolResult("call-byte", " 结果\r\n ")
             MessagePart.Activity "step-start" |] -> ()
        | _ -> failwith "Complete message evidence changed"
