namespace Wanxiangshu.Context.Trace

open Wanxiangshu.OpenCode
open Wanxiangshu.Participant.Provider
open Wanxiangshu.Participant.Provider.Projection.ProviderProjection

[<RequireQualifiedAccess>]
module XTraceMessageConversion =
    val semanticPart: part: MessagePart -> SemanticPart option
    val toCapturedWire: message: SessionMessage -> CapturedWireMessage
