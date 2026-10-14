namespace Wanxiangshu.Participant.Provider.Projection

open Wanxiangshu.Foundation.Identity

module ProviderProjection =
    type WirePart =
        | WireText of text: string
        | WireReasoning of text: string
        | WireToolCall of callId: ToolCallId * name: string * argsCanonical: string
        | WireToolResult of callId: ToolCallId * resultCanonical: string
        | WireMedia of mediaType: string option * contentDigest: string

    type WireMessage = { Role: string; Parts: WirePart list }

    type CapturedWirePart =
        { WirePart: WirePart
          HostPartId: HostMessagePartId option
          HostToolPartId: HostToolPartId option }

    type CapturedWireMessage =
        { Role: string
          ProviderRun: ProviderRunIdentity option
          Parts: CapturedWirePart list }

    type ProviderWireProjection =
        { ProviderId: string option
          ModelId: string option
          Variant: string option
          Tools: string list
          System: string list
          Messages: WireMessage list }

    type SemanticPart =
        | SemanticText of text: string
        | SemanticReasoning of text: string
        | SemanticToolCall of name: string * argsCanonical: string
        | SemanticToolResult of resultCanonical: string
        | SemanticMedia of mediaType: string option * contentDigest: string

    type SemanticMessage =
        { Role: string
          Parts: SemanticPart list }

    type ProviderSemanticProjection =
        { ProviderId: string option
          ModelId: string option
          Variant: string option
          Tools: string list
          System: string list
          Messages: SemanticMessage list }

    val toSemantic: wire: ProviderWireProjection -> ProviderSemanticProjection
    val renderWire: wire: ProviderWireProjection -> string
    val renderSemantic: semantic: ProviderSemanticProjection -> string
    val isAppendOnlyPrefix: previous: ProviderWireProjection -> next: ProviderWireProjection -> bool
    val semanticallyEqual: left: ProviderSemanticProjection -> right: ProviderSemanticProjection -> bool
