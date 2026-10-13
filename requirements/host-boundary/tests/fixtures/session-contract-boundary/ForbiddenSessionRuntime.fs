namespace Wanxiangshu.Host.CompilerProbe

open Wanxiangshu.OpenCode

module ForbiddenSessionRuntime =
    let create () = SessionQuiescenceGate()
