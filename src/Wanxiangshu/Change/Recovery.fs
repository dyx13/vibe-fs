namespace Wanxiangshu.Change

open System.Threading.Tasks
open Wanxiangshu.Execution.Delegation

/// Lazy durable recovery for persisted ManagerJobs.
///
/// RECOVERY-FAMILY: caller must hold FamilyRecoveryPermit for the orchestrator
/// session before starting publication programs. This module only registers
/// worktree directories and hands each active job to RecoverManagerJob.
///
/// No recovery prompt is built here. ORCH-006 does not persist the Manager's prompt,
/// and ORCH-007 decides the resume action from the last durable fact.
module OrchestratorManagerJob =
    let recoverJobs
        (readView: unit -> OrchestratorRecoveryView)
        (registerWorktree: ManagerJobProjection -> unit)
        (registerHandles: AgentLinkageProjection option -> unit)
        (recoverJob: ManagerJobProjection -> unit)
        : Task<unit> =
        task {
            let view = readView ()

            // ORCH-004: only jobs still owed work. A Published or Failed job's worktree
            // is swept, not resumed, and re-registering its directory would hand a live
            // path to a job that is finished.
            let active = view.ActiveJobs

            for job in active do
                registerWorktree job

            registerHandles view.Handles

            for job in active do
                recoverJob job
        }
