namespace Wanxiangshu.Execution.Delegation

open Wanxiangshu.Execution.Delegation.SyncDelegate

type DelegationHandoffRoute = private DelegationHandoffRoute of string

[<RequireQualifiedAccess>]
module DelegationHandoffRoute =
    let private create kind value =
        if System.String.IsNullOrWhiteSpace value then
            invalidArg "value" "delegation handoff route must be non-empty"

        DelegationHandoffRoute(kind + ":" + value.Trim().ToLowerInvariant())

    let forkByname byname = create "fork" byname

    let syncRole (scope: ReuseScopeId) role =
        match role with
        | SyncDelegateRole.Inspector -> create "sync" (ReuseScopeId.value scope + ":inspector")
        | SyncDelegateRole.Coder -> create "sync" (ReuseScopeId.value scope + ":coder")
        | SyncDelegateRole.Engineer -> create "sync" (ReuseScopeId.value scope + ":engineer")
        | SyncDelegateRole.DevOps -> create "sync" (ReuseScopeId.value scope + ":devops")

    let value (DelegationHandoffRoute value) = value
