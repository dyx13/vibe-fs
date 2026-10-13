namespace Wanxiangshu.Change.CompilerProbe

open Wanxiangshu.Persistence.Journal
open Wanxiangshu.Git
open Wanxiangshu.Change

module ForbiddenCapabilities =
    let journal (value: AgentJournal) = value
    let worktree (value: WorktreeResource) = value
    let engine (value: Orchestrator) = value
