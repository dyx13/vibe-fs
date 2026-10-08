namespace Wanxiangshu.Repository.Knowledge.Casebook.OpenCode

open Wanxiangshu.OpenCode
open Wanxiangshu.Persistence.Journal
open Wanxiangshu.Repository.Knowledge.Casebook
open Wanxiangshu.Repository.Programming.Js.OpenCode

/// CASE-009: assembles the conditional Casebook tool specs. This module is
/// the only place that names the EventStore for tool registration, keeping
/// ToolRegistry / PluginHostInterop / SpikePlugin free of the dual-write
/// token pair (AgentJournal + IEventStore in one file is forbidden).
module CasebookTools =

    /// Marker + EventStore availability → fetch + js-bookkeeper, or none.
    /// Acquire failure degrades the surface instead of failing the plugin —
    /// the schema gate and the execution gate stay in agreement.
    let private tryBuildSpecs
        (factory: HostToolFactory)
        (workspaceRoot: string)
        (owner: CasebookSettlementOwner)
        : ToolSpec list =
        try
            let bindFetch = FetchTool.spec factory workspaceRoot owner
            let store = WorkspaceEventStore.acquire (RuntimePath.gitCommonDir workspaceRoot)

            [ bindFetch store; JsBookkeeperTool.spec factory ]
        with _ ->
            []

    let buildSpecs (factory: HostToolFactory) (workspaceRoot: string) (owner: CasebookSettlementOwner) : ToolSpec list =
        if isNull (box owner) then
            nullArg "owner"

        if not (CasebookFeature.isEnabled workspaceRoot) then
            []
        else
            tryBuildSpecs factory workspaceRoot owner
