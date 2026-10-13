namespace Wanxiangshu.Change

open System.Threading.Tasks

/// ORCH-004/005/006/007: Relay quality candidate → deterministic artifact
/// admission → invalidation/rebase/loop when needed → short-CAS ff-only
/// publish.
module OrchestratorProgram =
    val run: deps: OrchestratorProgramDeps -> job: PublicationJob -> Task<OrchestratorVerdict>
