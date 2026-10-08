namespace Wanxiangshu.OpenCode

open System.Threading.Tasks

module PluginTransformSurface =
    val ordinaryEffects: tentative: bool -> retired: bool -> Task<string array>
