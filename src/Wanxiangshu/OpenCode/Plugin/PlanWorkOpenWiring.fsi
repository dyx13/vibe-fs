namespace Wanxiangshu.OpenCode

open System.Threading.Tasks

module PlanWorkOpenWiring =
    /// planning-020 entry wiring: opens the plan work (work opened, DevOps
    /// bound, first incumbency at S1) on the workspace EventStore for the
    /// first prompt of a plan session. Failures are diagnosed, never raised.
    val ensurePlanWorkOpenedForSession: workspaceDirectory: string option -> sid: string -> Task<unit>
