namespace Wanxiangshu.Git.Hook

open System.Threading.Tasks

/// Plain-data hook installation surface. HookDispatcher owns the physical
/// membrane; this module prevents its DU and path types crossing into tests.
[<RequireQualifiedAccess>]
module HookSurface =
    val classifyExistingHook: existingBody: obj -> string
    val installOrDiagnose: hooksDirectory: string -> kind: string -> shimBody: string -> string
    val ensure: workspace: string -> bool
    val convergeExpiredAt: originMs: float -> budgetMs: float -> observedMs: float -> Task<obj>
