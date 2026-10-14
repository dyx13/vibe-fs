namespace Wanxiangshu.Composition.Durable

open Wanxiangshu.Interaction.Dispatch
open Wanxiangshu.Participant.Provider.Attempt.Fallback
open Wanxiangshu.Persistence.Journal

[<RequireQualifiedAccess>]
module PrefixJournalAdapter =
    val create: failurePort: ProviderFailureJournalPort -> journal: AgentJournal -> WireJournalPort
