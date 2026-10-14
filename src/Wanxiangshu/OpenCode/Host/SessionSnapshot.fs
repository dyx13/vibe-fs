namespace Wanxiangshu.OpenCode

open System.Threading.Tasks
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Participant.Provider

/// One message as the Host transcript has it.
///
/// `Id` is a raw wire address, deliberately untyped. SSOT has no generic message
/// identity: PROMPT-001 gives `role=user` a `PhysicalUserMessageId`, HOST-010
/// gives `role=assistant` a `ProviderRunIdentity`, and the two are not
/// interchangeable. A single typed id here would have to be one of them, so it
/// would be wrong for half the transcript.
///
/// The reconcile layer constructs the typed identity at the point where the role
/// is known. This is the Host-raw boundary the migration allows an adapter at.
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

/// DSL-state-combination: physical — this is one raw Host snapshot message;
/// optional metadata and completion flags mirror wire absence/transport facts and
/// are interpreted at the boundary, never persisted as workflow state.
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

    /// Evidence → Decision: tool part id matches the callback → location.
    let private toolCallLocationOf
        (toolCallId: ToolCallId)
        (message: SessionMessage)
        (part: SessionToolPart)
        : ToolCallLocation option =
        if part.ToolCallId <> toolCallId then
            None
        else
            Some
                { ProviderRun = ProviderRunIdentity.create message.Id
                  HostToolPartId = part.HostToolPartId
                  ToolCallId = part.ToolCallId
                  ToolName = part.ToolName
                  InputCanonical = part.InputCanonical
                  State = part.State }

    let private assistantToolLocations (toolCallId: ToolCallId) (message: SessionMessage) =
        if message.Role <> "assistant" then
            []
        else
            message.ToolParts
            |> Array.toList
            |> List.choose (toolCallLocationOf toolCallId message)

    /// Resolve one tool callback through the Host's persisted assistant message.
    /// `callID` alone is not a ProviderRun binding; the enclosing assistant
    /// message and persisted ToolPart are the only admissible evidence.
    let locateToolCall
        (toolCallId: ToolCallId)
        (messages: SessionMessage list)
        : Result<ToolCallLocation, ToolCallLocationError> =
        let candidates = messages |> List.collect (assistantToolLocations toolCallId)

        match candidates with
        | [ location ] -> Ok location
        | [] -> Error(ToolCallLocationError.Missing toolCallId)
        | _ -> Error(ToolCallLocationError.Ambiguous toolCallId)
