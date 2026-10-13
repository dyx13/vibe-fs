namespace Wanxiangshu.OpenCode

open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Participant.Provider.Projection.ProviderProjection

module ProviderWireCapture =
    type CapturedWirePart =
        { WirePart: WirePart
          HostPartId: HostMessagePartId option
          HostToolPartId: HostToolPartId option }

    type CapturedWireMessage =
        { Role: string
          ProviderRun: ProviderRunIdentity option
          Parts: CapturedWirePart list }

    val decodeCapturedMessage: rawObj: obj -> CapturedWireMessage option
    val isSyntheticMessage: rawObj: obj -> bool
    val decodeMessage: rawObj: obj -> WireMessage option
    val visibleProviderRuns: rawMessages: obj list -> Set<ProviderRunIdentity>
    val decodeRequest: requestObj: obj -> ProviderWireProjection
    val decodeMessageView: rawMessages: obj list -> ProviderWireProjection
    val decodeCapturedMessageView: rawMessages: obj list -> CapturedWireMessage list
    val wireMessageView: captured: CapturedWireMessage list -> ProviderWireProjection
    val lastUserMessageId: rawMessages: obj list -> PhysicalUserMessageId option

    val tryPhysicalParentOfProviderRun:
        providerRun: ProviderRunIdentity -> rawMessages: obj list -> PhysicalUserMessageId option

    val trySemanticTurnOfHostMessageId: messageId: string -> rawMessages: obj list -> int option
    val lastUserPromptKey: rawMessages: obj list -> PromptKey option
    val formalText: rawObj: obj -> string
