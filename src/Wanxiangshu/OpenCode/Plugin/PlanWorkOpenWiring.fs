namespace Wanxiangshu.OpenCode

open System.Threading.Tasks
open Wanxiangshu.Persistence.EventStore
open Wanxiangshu.OpenCode.Host

// planning-020 entry wiring: this module owns the workspace EventStore write
// surface for the plan entry. The transform pipeline writes its facts through
// AgentJournal, so the store surfaces stay in separate modules (unified-store
// dual-write gate).
module PlanWorkOpenWiring =

    // planning-020: the entry appends work opened, DevOps bound and the first
    // incumbency; it is idempotent for an existing work and fails with zero
    // writes when the store cannot serve it. A failure is diagnosed, never
    // raised: the caller continues without a forged tenure.
    let private runPlanWorkOpen (store: IEventStore) (root: string) (sid: string) : Task<unit> =
        task {
            match! Wanxiangshu.Mission.Planning.PlanWorkOpen.ensurePlanWorkOpened store root sid with
            | Ok() -> ()
            | Error err -> Diagnostic.emit "plan-work-open-failed" [ "work_id", sid; "error", err ]
        }

    let ensurePlanWorkOpenedForSession (workspaceDirectory: string option) (sid: string) : Task<unit> =
        task {
            let commonDirOpt =
                workspaceDirectory
                |> Option.map Wanxiangshu.Persistence.Journal.RuntimePath.gitCommonDir

            let storeOpt = commonDirOpt |> Option.bind WorkspaceEventStore.tryCurrent

            match commonDirOpt, storeOpt with
            | Some commonDir, Some store -> do! runPlanWorkOpen store (commonDir + "/wanxiangshu") sid
            | _ -> Diagnostic.emit "plan-work-open-store-unavailable" [ "work_id", sid ]
        }
