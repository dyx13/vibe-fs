namespace Wanxiangshu.Composition.Durable

open Wanxiangshu.Interaction.Attention
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Interaction.Concern
open Wanxiangshu.Persistence.Journal
open System.Threading.Tasks

[<RequireQualifiedAccess>]
module AttentionConcernJournalAdapter =
    val forAttention: journal: AgentJournal -> AttentionJournalPort
    val forConcern: journal: AgentJournal -> ConcernJournalPort
