namespace Wanxiangshu.Interaction.Authority

open Wanxiangshu.Foundation.Identity

type AuthorityRootAcceptedPayload =
    { SchemaVersion: int
      SessionId: SessionId
      LogicalRunId: LogicalRunId
      AuthorityRootUserMessageId: AuthorityRootUserMessageId
      AuthorityKind: string
      IdentitySeed: PromptIdentitySeed }

[<RequireQualifiedAccess>]
type PromptAbandonReason =
    | SendFailed of error: string
    | SupersededBeforePhysicalSend
    | UnresolvedAfterRecovery

type PromptFactCases =
    | PluginPromptClaimed of
        {| PromptKey: PromptKey
           SessionId: SessionId
           ContinuationKind: string
           LogicalRunId: LogicalRunId option
           AuthorityRootUserMessageId: AuthorityRootUserMessageId option
           IdentitySeed: PromptIdentitySeed
           PayloadDigest: string |}
    | DeferredWorkPresentationClaimed of
        {| PromptKey: PromptKey
           SessionId: SessionId
           LogicalRunId: LogicalRunId
           AuthorityRootUserMessageId: AuthorityRootUserMessageId
           IdentitySeed: PromptIdentitySeed
           PayloadDigest: string
           OccurrenceIds: string list |}
    | PluginPromptSubmitted of
        {| PromptKey: PromptKey
           SessionId: SessionId
           Receipt: TransportReceipt |}
    | PluginPromptPhysicalAccepted of
        {| PromptKey: PromptKey
           SessionId: SessionId
           PhysicalUserMessageId: PhysicalUserMessageId |}
    | PluginPromptAbandoned of
        {| PromptKey: PromptKey
           SessionId: SessionId
           Reason: PromptAbandonReason |}
    | AuthorityRootAccepted of AuthorityRootAcceptedPayload
