namespace Wanxiangshu.OpenCode

open System.Threading.Tasks
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Participant.Provider

[<RequireQualifiedAccess>]
type SnapshotToolPartState =
    | Pending
    | Completed of outputCanonical: string
    | Failed of errorCanonical: string

type SessionToolPart =
    { HostToolPartId: HostToolPartId
      ToolCallId: ToolCallId
      ToolName: string
      InputCanonical: string
      State: SnapshotToolPartState }

type SessionMessage =
    { Id: string
      Role: string
      Agent: string option
      Finish: string option
      ErrorName: string option
      Model: OpencodeModel option
      ParentId: string option
      CreatedAt: float option
      Completed: bool
      IsCompaction: bool
      PromptKey: string option
      Parts: MessagePart array
      PartIds: HostMessagePartId option array
      ToolParts: SessionToolPart array }

type ISessionSnapshotPort =
    abstract GetMessages: sessionId: SessionId -> Task<Result<SessionMessage list, string>>

module SessionSnapshot =
    type ToolCallLocation =
        { ProviderRun: ProviderRunIdentity
          HostToolPartId: HostToolPartId
          ToolCallId: ToolCallId
          ToolName: string
          InputCanonical: string
          State: SnapshotToolPartState }

    [<RequireQualifiedAccess>]
    type ToolCallLocationError =
        | Missing of toolCallId: ToolCallId
        | Ambiguous of toolCallId: ToolCallId

    val locateToolCall:
        toolCallId: ToolCallId -> messages: SessionMessage list -> Result<ToolCallLocation, ToolCallLocationError>
