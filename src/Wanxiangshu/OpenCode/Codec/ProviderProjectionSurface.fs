namespace Wanxiangshu.OpenCode

open Fable.Core
open Fable.Core.JsInterop
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Interaction.Dispatch.OpenCode
open Wanxiangshu.Participant.Provider.Projection
open Wanxiangshu.Participant.Provider

/// JS-native provider projection codec owner surface.
/// Raw Host objects are decoded here; tests never import internal codec modules
/// or observe Fable unions and records directly.
module ProviderProjectionSurface =

    let private optionObj value = Option.toObj value

    let private wirePartToJs part : obj =
        match part with
        | ProviderProjection.WireText text -> box {| kind = "Text"; text = text |}
        | ProviderProjection.WireReasoning text -> box {| kind = "Reasoning"; text = text |}
        | ProviderProjection.WireToolCall(callId, name, args) ->
            box
                {| kind = "ToolCall"
                   callId = ToolCallId.value callId
                   name = name
                   args = args |}
        | ProviderProjection.WireToolResult(callId, result) ->
            box
                {| kind = "ToolResult"
                   callId = ToolCallId.value callId
                   result = result |}
        | ProviderProjection.WireMedia(mediaType, digest) ->
            box
                {| kind = "Media"
                   mediaType = optionObj mediaType
                   contentDigest = digest |}

    let private messagePartToJs part : obj =
        match part with
        | MessagePart.Text text -> box {| kind = "Text"; text = text |}
        | MessagePart.Reasoning text -> box {| kind = "Reasoning"; text = text |}
        | MessagePart.ToolCall(callId, name, args) ->
            box
                {| kind = "ToolCall"
                   callId = callId
                   name = name
                   args = args |}
        | MessagePart.ToolResult(callId, result) ->
            box
                {| kind = "ToolResult"
                   callId = callId
                   result = result |}
        | MessagePart.Activity kind -> box {| kind = "Activity"; activity = kind |}

    let decodeWirePart (raw: obj) : obj =
        ProviderWireDecode.decodePart raw |> Option.map wirePartToJs |> Option.toObj

    let decodeWireParts (raw: obj array) : obj array =
        if isNull raw then
            [||]
        else
            raw |> Array.choose (ProviderWireDecode.decodePart >> Option.map wirePartToJs)

    let decodeMessage (raw: obj) : obj =
        ProviderWireCapture.decodeMessage raw
        |> Option.map (fun message ->
            box
                {| role = message.Role
                   parts = message.Parts |> List.map wirePartToJs |> List.toArray |})
        |> Option.toObj

    let decodeRequest (raw: obj) : obj =
        let projection = ProviderWireCapture.decodeRequest raw

        box
            {| providerId = optionObj projection.ProviderId
               modelId = optionObj projection.ModelId
               variant = optionObj projection.Variant
               tools = List.toArray projection.Tools
               system = List.toArray projection.System
               messages =
                projection.Messages
                |> List.map (fun message ->
                    box
                        {| role = message.Role
                           parts = message.Parts |> List.map wirePartToJs |> List.toArray |})
                |> List.toArray |}

    let decodeMessageView (raw: obj array) : obj =
        let projection =
            ProviderWireCapture.decodeMessageView (if isNull raw then [] else Array.toList raw)

        box
            {| providerId = null
               modelId = null
               variant = null
               tools = [||]
               system = [||]
               messages =
                projection.Messages
                |> List.map (fun message ->
                    box
                        {| role = message.Role
                           parts = message.Parts |> List.map wirePartToJs |> List.toArray |})
                |> List.toArray |}

    let decodeCapturedMessage (raw: obj) : obj =
        ProviderWireCapture.decodeCapturedMessage raw
        |> Option.map (fun message ->
            box
                {| role = message.Role
                   providerRun = message.ProviderRun |> Option.map ProviderRunIdentity.value |> Option.toObj
                   parts =
                    message.Parts
                    |> List.map (fun part ->
                        box
                            {| wire = wirePartToJs part.WirePart
                               hostToolPartId = part.HostToolPartId |> Option.map HostToolPartId.value |> Option.toObj |})
                    |> List.toArray |})
        |> Option.toObj

    let decodeHostPart (raw: obj) : obj =
        HostMessageCodec.decodePart raw |> Option.map messagePartToJs |> Option.toObj

    let decodeHostParts (raw: obj array) : obj array =
        HostMessageCodec.decodeParts raw |> Array.map messagePartToJs

    let private optionString value = Option.toObj value

    let decodeIngress (input: obj) (output: obj) : obj =
        let decoded = PromptIngressCodec.decodeWith input output

        let physicalUserMessageId =
            decoded.PhysicalUserMessageId |> Option.map PhysicalUserMessageId.value

        box
            {| sessionId = decoded.SessionId |> Option.map SessionId.value |> optionString
               physicalUserMessageId = physicalUserMessageId |> optionString
               explicitAgent = optionString decoded.ExplicitAgent
               promptKey = decoded.PromptKey |> Option.map PromptKey.value |> optionString
               isHostCompaction = decoded.IsHostCompaction
               isHostSynthetic = decoded.IsHostSynthetic
               text = optionString decoded.Text |}

    let opencodeModel (providerId: string) (modelId: string) (variant: obj) : obj =
        let value: OpencodeModel =
            { providerID = providerId
              modelID = modelId
              variant = if isNull variant then None else Some(unbox<string> variant) }

        box
            {| providerID = value.providerID
               modelID = value.modelID
               variant = optionObj value.variant |}

    let opencodeTextPart (id: string) (kind: string) (text: string) (synthetic: bool) : obj =
        let value: OpencodeTextPart =
            { id = id
              ``type`` = kind
              text = text
              synthetic = Some synthetic }

        box
            {| id = value.id
               ``type`` = value.``type``
               text = value.text
               synthetic = value.synthetic |> Option.defaultValue false |}

    let opencodeToolCallPart (id: string) (kind: string) (callId: string) (tool: string) (args: obj) : obj =
        let value: OpencodeToolCallPart =
            { id = id
              ``type`` = kind
              callID = callId
              tool = tool
              args = if isNull args then None else Some args }

        box
            {| id = value.id
               ``type`` = value.``type``
               callID = value.callID
               tool = value.tool
               args = optionObj value.args |}

    let opencodeCompactionPart (id: string) (kind: string) (auto: bool) (overflow: bool) : obj =
        let value: OpencodeCompactionPart =
            { id = id
              ``type`` = kind
              auto = auto
              overflow = overflow }

        box
            {| id = value.id
               ``type`` = value.``type``
               auto = value.auto
               overflow = value.overflow |}

    let opencodeUserMessage
        (id: string)
        (role: string)
        (sessionId: string)
        (agent: obj)
        (model: obj)
        (parts: obj array)
        : obj =
        let modelValue: OpencodeModel option =
            if isNull model then
                None
            else
                Some
                    { providerID = string model?providerID
                      modelID = string model?modelID
                      variant =
                        if isNull model?variant then
                            None
                        else
                            Some(string model?variant) }

        let value: OpencodeUserMessage =
            { id = id
              role = role
              sessionID = sessionId
              agent = if isNull agent then None else Some(unbox<string> agent)
              model = modelValue
              parts = if isNull parts then [] else Array.toList parts }

        box
            {| id = value.id
               role = value.role
               sessionID = value.sessionID
               agent = optionObj value.agent
               model =
                value.model
                |> Option.map (fun model ->
                    box
                        {| providerID = model.providerID
                           modelID = model.modelID
                           variant = optionObj model.variant |})
                |> optionObj
               parts = List.toArray value.parts |}

    let opencodeAssistantMessage
        (id: string)
        (parentId: obj)
        (role: string)
        (sessionId: string)
        (agent: obj)
        (providerId: obj)
        (modelId: obj)
        (summary: bool)
        (error: obj)
        (parts: obj array)
        : obj =
        let value: OpencodeAssistantMessage =
            { id = id
              parentID =
                if isNull parentId then
                    None
                else
                    Some(unbox<string> parentId)
              role = role
              sessionID = sessionId
              agent = if isNull agent then None else Some(unbox<string> agent)
              providerID =
                if isNull providerId then
                    None
                else
                    Some(unbox<string> providerId)
              modelID = if isNull modelId then None else Some(unbox<string> modelId)
              summary = Some summary
              error = if isNull error then None else Some error
              parts = if isNull parts then [] else Array.toList parts }

        box
            {| id = value.id
               parentID = optionObj value.parentID
               role = value.role
               sessionID = value.sessionID
               agent = optionObj value.agent
               providerID = optionObj value.providerID
               modelID = optionObj value.modelID
               summary = value.summary |> Option.defaultValue false
               error = optionObj value.error
               parts = List.toArray value.parts |}

    let opencodeHookInput (sessionId: string) (messageId: string) (agent: string) (model: obj) : obj =
        let modelValue: OpencodeModel =
            { providerID = string model?providerID
              modelID = string model?modelID
              variant =
                if isNull model?variant then
                    None
                else
                    Some(string model?variant) }

        let value: OpencodeHookInput =
            { sessionID = sessionId
              messageID = Some messageId
              agent = Some agent
              model = Some modelValue }

        box
            {| sessionID = value.sessionID
               messageID = optionObj value.messageID
               agent = optionObj value.agent
               model =
                value.model
                |> Option.map (fun model ->
                    box
                        {| providerID = model.providerID
                           modelID = model.modelID
                           variant = optionObj model.variant |})
                |> optionObj |}

    let opencodeToolExecuteInput (tool: string) (sessionId: string) (callId: string) : obj =
        let value: OpencodeToolExecuteInput =
            { tool = tool
              sessionID = sessionId
              callID = callId }

        box
            {| tool = value.tool
               sessionID = value.sessionID
               callID = value.callID |}

    let opencodeToolExecuteOutput (args: obj) : obj =
        let value: OpencodeToolExecuteOutput = { args = args }
        box {| args = value.args |}

    let promptOriginOfMessage (raw: obj) : obj =
        ProviderWireDecode.promptOriginOfMessage raw
        |> Option.map box
        |> Option.defaultValue null

    let semanticTurnOfHostMessageId (messageId: string) (raw: obj array) : obj =
        ProviderWireCapture.trySemanticTurnOfHostMessageId messageId (if isNull raw then [] else Array.toList raw)
        |> Option.map box
        |> Option.defaultValue null

    let private wireMessageOf value : ProviderProjection.WireMessage =
        { Role = string value?role
          Parts =
            if isNull value?parts then
                []
            else
                value?parts
                |> unbox<obj array>
                |> Array.toList
                |> List.map (fun part ->
                    match string part?kind with
                    | "text" -> ProviderProjection.WireText(string part?text)
                    | "reasoning" -> ProviderProjection.WireReasoning(string part?text)
                    | "tool-call" ->
                        ProviderProjection.WireToolCall(
                            ToolCallId.create (string part?callId),
                            string part?name,
                            string part?args
                        )
                    | "tool-result" ->
                        ProviderProjection.WireToolResult(ToolCallId.create (string part?callId), string part?result)
                    | "media" ->
                        let mediaType: string option =
                            if isNull part?mediaType then
                                None
                            else
                                Some(string part?mediaType)

                        ProviderProjection.WireMedia(mediaType, string part?contentDigest)
                    | other -> failwithf "ProviderProjectionSurface: unknown wire part kind %s" other) }

    let private renderedMessagesOf (value: obj) : RenderedMessages =
        let hostMessageIds: string option list =
            value?hostMessageIds
            |> unbox<obj array>
            |> Array.toList
            |> List.map (fun id -> if isNull id then None else Some(string id))

        let hostIsPhysical: bool list =
            value?hostIsPhysical |> unbox<bool array> |> Array.toList

        { Messages = value?messages |> unbox<obj array> |> Array.toList |> List.map wireMessageOf
          HostMessageIds = hostMessageIds
          HostIsPhysical = hostIsPhysical }

    let private appliedResult result =
        match result with
        | Ok values ->
            box
                {| ok = true
                   value = values |> List.toArray |}
        | Error error -> box {| ok = false; error = error |}

    let tryApplyRenderedMessages (sessionId: string) (sha256: string -> string) (rendered: obj) : obj =
        ProjectionMessageEdit.tryApplyRenderedMessages sessionId sha256 (renderedMessagesOf rendered)
        |> appliedResult


    let tryApplyRenderedInsertionsPreservingBase
        (sessionId: string)
        (sha256: string -> string)
        (rawMessages: obj array)
        (rendered: obj)
        : obj =
        ProjectionMessageEdit.tryApplyRenderedInsertionsPreservingBase
            sessionId
            sha256
            (if isNull rawMessages then [] else Array.toList rawMessages)
            (renderedMessagesOf rendered)
        |> appliedResult

    let messagesFromTransformOutput (output: obj) : obj array =
        if isNull output || isNull output?messages then
            [||]
        else
            unbox<obj array> output?messages

    let hostMessageId (raw: obj) =
        ProviderWireDecode.hostMessageId raw |> Option.toObj

    let projectionSessionIdFromMessages (raw: obj) =
        ProviderWireDecode.projectionSessionIdFromMessages raw |> Option.toObj

    let lastUserMessageId (raw: obj array) =
        ProviderWireCapture.lastUserMessageId (Array.toList raw)
        |> Option.map PhysicalUserMessageId.value
        |> Option.toObj

    let lastUserPromptKey (raw: obj array) =
        ProviderWireCapture.lastUserPromptKey (Array.toList raw)
        |> Option.map PromptKey.value
        |> Option.toObj

    let formalText (raw: obj) = ProviderWireCapture.formalText raw
