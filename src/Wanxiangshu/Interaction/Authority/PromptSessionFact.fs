namespace Wanxiangshu.Interaction.Authority

open Wanxiangshu.Foundation.Identity

[<RequireQualifiedAccess>]
type PromptSessionFact =
    | AuthorityRootAccepted of AuthorityRootAcceptedPayload
    | PromptClaimed of
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
    | PromptSubmitted of
        {| PromptKey: PromptKey
           SessionId: SessionId
           Receipt: TransportReceipt |}
    | PromptPhysicalAccepted of
        {| PromptKey: PromptKey
           SessionId: SessionId
           PhysicalUserMessageId: PhysicalUserMessageId |}
    | PromptAbandoned of
        {| PromptKey: PromptKey
           SessionId: SessionId
           Reason: PromptAbandonReason |}
