namespace Wanxiangshu.Change

open System.Threading.Tasks
open Wanxiangshu.Composition.Durable
open Wanxiangshu.Composition.Durable.Fact
open Wanxiangshu.Persistence.Journal

type OrchestratorJournalPort =
    { AppendFact: StreamId -> AgentFact -> Task<Result<ProjectionSet, string>>
      Snapshot: unit -> ProjectionSet }
