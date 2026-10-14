namespace Wanxiangshu.Participant.Provider

[<RequireQualifiedAccess>]
type MessagePart =
    | Text of text: string
    | Reasoning of text: string
    | ToolCall of callId: string * name: string * argsCanonical: string
    | ToolResult of callId: string * resultCanonical: string
    | Activity of kind: string
