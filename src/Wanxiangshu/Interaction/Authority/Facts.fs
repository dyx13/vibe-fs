namespace Wanxiangshu.Interaction.Authority

open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity

type AuthorityRootAcceptedPayload =
    { SchemaVersion: int
      SessionId: SessionId
      LogicalRunId: LogicalRunId
      AuthorityRootUserMessageId: AuthorityRootUserMessageId
      AuthorityKind: string
      IdentitySeed: PromptIdentitySeed }

/// Durable prompt-authority facts. These facts belong to the authority boundary;
/// Composition only routes the family through the journal's outer union.
[<RequireQualifiedAccess>]
type PromptAbandonReason =
    /// Transport proved the prompt was not accepted.
    | SendFailed of error: string
    /// An idle-derived prompt was durably claimed, but newer physical user
    /// material revoked its quiescence permit before SendPrompt was invoked.
    | SupersededBeforePhysicalSend
    /// Recovery budget expired without proving physical acceptance.
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
