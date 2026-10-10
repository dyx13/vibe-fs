namespace Wanxiangshu.OpenCode

open System.Threading.Tasks
open Wanxiangshu.Interaction.Concern

[<RequireQualifiedAccess>]
module ConcernTools =
    val admission: ToolAdmission

    val specs:
        factory: HostToolFactory ->
        journal: ConcernJournalPort option ->
        toast: (string -> string -> Task<Result<unit, string>>) option ->
            ToolSpec list
