namespace Wanxiangshu.Mission.Planning

open System.Threading.Tasks
open Wanxiangshu.Persistence.EventStore

module PlanWorkOpen =
    /// root is the plan root directory (<git-common-dir>/wanxiangshu in
    /// production); sessionId is the plan session id, which becomes the workId.
    val ensurePlanWorkOpened: store: IEventStore -> root: string -> sessionId: string -> Task<Result<unit, string>>

    /// planning-020 / planning-010: the single runtime derivation of the
    /// fixed DevOps identity for a plan work. The entry binding and the
    /// single-flight ask binding must resolve the same devopsId for the same
    /// work, so the derivation lives here once.
    val internal deriveDevOpsId: workId: string -> string
