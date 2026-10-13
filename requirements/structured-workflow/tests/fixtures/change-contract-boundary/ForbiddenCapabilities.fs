namespace Wanxiangshu.Change.CompilerProbe

open Wanxiangshu.Persistence.Journal
open Wanxiangshu.Git

module ForbiddenCapabilities =
    let journal (value: AgentJournal) = value
    let worktree (value: WorktreeResource) = value
