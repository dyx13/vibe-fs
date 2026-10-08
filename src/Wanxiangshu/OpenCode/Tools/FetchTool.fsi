namespace Wanxiangshu.OpenCode

open Wanxiangshu.Persistence.EventStore
open Wanxiangshu.Repository.Knowledge.Casebook

/// Conditional Casebook read. Provider identity is a public shelfmark; durable
/// session identity, freshness state and maintenance machinery remain internal.
module FetchTool =

    [<RequireQualifiedAccess>]
    module Path =
        [<Literal>]
        val Description: string = "tool/fetch/description"

        [<Literal>]
        val Fresh: string = "tool/fetch/fresh"

        [<Literal>]
        val Refreshed: string = "tool/fetch/refreshed"

        [<Literal>]
        val Stale: string = "tool/fetch/stale"

        [<Literal>]
        val NoCase: string = "tool/fetch/no-case"

        [<Literal>]
        val Unavailable: string = "tool/fetch/unavailable"

        [<Literal>]
        val ShelfmarkRequired: string = "tool/fetch/shelfmark-required"

    val admission: ToolAdmission

    val spec:
        factory: HostToolFactory -> workspaceRoot: string -> owner: CasebookSettlementOwner -> (IEventStore -> ToolSpec)
