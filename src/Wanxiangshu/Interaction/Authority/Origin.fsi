namespace Wanxiangshu.Interaction.Authority

type PromptRootAuthorityKind =
    | HumanRoot
    | AgentOwnerRoot

type PromptContinuationKind =
    | InteractionRepair
    | JoinGuard
    | ManagerGuard
    | BusyAgentNudge
    | HumanMessage
    | ManagedDelegationAssignment
    | ProviderRetryAttempt
    | DegenerationGuard
    | FissionHandoff
    | DeferredWorkPresentation of occurrenceIds: string list

type PromptOrigin =
    | AuthorityRoot of PromptRootAuthorityKind
    | Continuation of PromptContinuationKind
    | HostInternal
    | UnknownOrigin
