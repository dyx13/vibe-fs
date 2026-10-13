namespace Wanxiangshu.OpenCode

module ForbiddenRecoveryScope =
    let identity (scope: PluginRecoveryScope) = scope
    let create () : PluginRecoveryScope = PluginRecoveryScope(None)
