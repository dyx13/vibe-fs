namespace Wanxiangshu.OpenCode

open System
open Fable.Core.JsInterop
open Wanxiangshu.Execution.Session.ChatExecution
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Persistence.Journal

/// PROMPT-006 / execution-model-routing-009: chat.params is an observation barrier, not a routing
/// authority. chat.message / internal SendPrompt must already have established the
/// lease and projected model+variant before the provider reaches this hook.
module ChatParamsHook =

    let private normalizeText text =
        if String.IsNullOrWhiteSpace text then
            None
        else
            Some(text.Trim())

    let private textField (value: obj) (name: string) =
        if isNull value || isNull value?(name) then
            None
        else
            normalizeText (string value?(name))

    let private childObject (value: obj) (name: string) : obj =
        if isNull value then null else value?(name)

    let private extractModel (input: obj) =
        let rawModel: obj = input?model
        let message: obj = input?message
        let messageModel: obj = if isNull message then null else message?model

        let provider = textField rawModel "providerID"

        let modelId =
            // chat.params receives the resolved provider catalog Model. Its
            // canonical model identifier is 'id'; 'modelID' belongs to the
            // persisted UserMessage model reference. The compatibility fallback
            // is raw-model-local; message.model never supplies provider identity.
            textField rawModel "id"
            |> Option.orElseWith (fun () -> textField rawModel "modelID")

        let variant =
            textField messageModel "variant"
            |> Option.orElseWith (fun () -> textField rawModel "variant")

        match provider, modelId with
        | Some providerID, Some modelID ->
            Some
                { providerID = providerID
                  modelID = modelID
                  variant = variant }
        | _ -> None

    let private currentModel (input: obj) =
        if isNull input then None else extractModel input

    let private trySessionId (input: obj) =
        if isNull input then
            None
        elif not (isNull input?sessionID) then
            normalizeText (string input?sessionID) |> Option.map SessionId.create
        elif not (isNull input?sessionId) then
            normalizeText (string input?sessionId) |> Option.map SessionId.create
        elif not (isNull input?message) && not (isNull input?message?sessionID) then
            normalizeText (string input?message?sessionID) |> Option.map SessionId.create
        elif not (isNull input?info) && not (isNull input?info?sessionID) then
            normalizeText (string input?info?sessionID) |> Option.map SessionId.create
        else
            None

    /// host-boundary-008: decode the exact physical user message id for this
    /// request. The id is the physical user message, never an assistant id.
    let private tryPhysicalUserMessageId (input: obj) =
        if isNull input then
            None
        elif not (isNull input?messageID) then
            normalizeText (string input?messageID)
            |> Option.map PhysicalUserMessageId.create
        elif not (isNull input?messageId) then
            normalizeText (string input?messageId)
            |> Option.map PhysicalUserMessageId.create
        elif not (isNull input?message) && not (isNull input?message?id) then
            normalizeText (string input?message?id)
            |> Option.map PhysicalUserMessageId.create
        elif not (isNull input?info) && not (isNull input?info?id) then
            normalizeText (string input?info?id) |> Option.map PhysicalUserMessageId.create
        else
            None

    /// What the exact committed execution for one physical user message says
    /// this provider run must be. Read-only projection of owner truth: the hook
    /// never writes identity, never re-routes, never allocates a lease.
    let private readAdmission (key: ChatExecutionKey) = ModelRouting.readExecutionAdmission key

    /// host-boundary-008 / execution-model-routing-009: compare the Host's real
    /// observation against the exact execution. A managed input without exact
    /// lease evidence fails closed; nothing is inferred from a session cache.
    let private validateObservedProvider (key: ChatExecutionKey) expectedParticipant target agent model =
        if not (String.Equals(expectedParticipant, agent, StringComparison.Ordinal)) then
            invalidOp (
                sprintf
                    "PROMPT-006: provider agent drift for physical user message '%s' (%s -> %s)"
                    (PhysicalUserMessageId.value key.PhysicalUserMessageId)
                    expectedParticipant
                    agent
            )
        elif not (ModelRouting.sameTarget target model) then
            let expected = ModelRouting.toOpenCodeModel target

            invalidOp (
                sprintf
                    "PROMPT-006: provider model/reasoning drift for physical user message '%s' (%s/%s[%s] -> %s/%s[%s])"
                    (PhysicalUserMessageId.value key.PhysicalUserMessageId)
                    expected.providerID
                    expected.modelID
                    (expected.variant |> Option.defaultValue "<missing>")
                    model.providerID
                    model.modelID
                    (model.variant |> Option.defaultValue "<missing>")
            )

    let private validateModel (key: ChatExecutionKey) expectedParticipant target agent (input: obj) =
        match currentModel input with
        | None ->
            invalidOp (sprintf "PROMPT-006: managed provider run '%s' has no observable provider/model binding" agent)
        | Some model -> validateObservedProvider key expectedParticipant target agent model

    let private tryAgent (input: obj) =
        [ input; childObject input "info"; childObject input "message" ]
        |> List.tryPick (fun candidate -> textField candidate "agent")

    let private supportsTemperature (input: obj) =
        if
            isNull input
            || isNull input?model
            || isNull input?model?capabilities
            || isNull input?model?capabilities?temperature
        then
            true
        else
            input?model?capabilities?temperature <> box false

    let private applyManagedTemperature (input: obj) (output: obj) =
        if supportsTemperature input then
            emitJsStatement
                (input, output, 1.0)
                """
                if ($1 && typeof $1 === 'object') {
                    $1.temperature = $2;
                    if ($1.options && typeof $1.options === 'object') {
                        $1.options.temperature = $2;
                    }
                }
                if ($0 && typeof $0 === 'object' && $0.model && typeof $0.model === 'object') {
                    if (!$0.model.options || typeof $0.model.options !== 'object') {
                        $0.model.options = {};
                    }
                    $0.model.options.temperature = $2;
                    if ($0.model.variants && typeof $0.model.variants === 'object') {
                        for (const k of Object.keys($0.model.variants)) {
                            if ($0.model.variants[k] && typeof $0.model.variants[k] === 'object') {
                                $0.model.variants[k].temperature = $2;
                            }
                        }
                    }
                    const vName = $0.message && $0.message.model && typeof $0.message.model.variant === 'string'
                        ? $0.message.model.variant.trim()
                        : '';
                    if (vName) {
                        if (!$0.model.variants || typeof $0.model.variants !== 'object') {
                            $0.model.variants = {};
                        }
                        if (!$0.model.variants[vName] || typeof $0.model.variants[vName] !== 'object') {
                            $0.model.variants[vName] = {};
                        }
                        $0.model.variants[vName].temperature = $2;
                    }
                }
            """

    /// The exact user message carried by this observation. Host title requests
    /// reuse the original User but do not execute its managed work.
    let private tryExecutionKey (input: obj) =
        match trySessionId input, tryPhysicalUserMessageId input with
        | Some sessionId, Some physical ->
            Some
                { SessionId = sessionId
                  PhysicalUserMessageId = physical }
        | _ -> None

    /// A managed provider request needs durable Accepted evidence and the exact
    /// committed lease for its own physical message, or the observation fails
    /// closed. A message nobody accepted is entirely the Host's — never rejected
    /// for a binding this hook does not own.
    let private validateManagedObservation
        (journal: AgentJournal option)
        (agent: string)
        (key: ChatExecutionKey)
        input
        =
        match readAdmission key with
        | Some(participant, target) -> validateModel key participant target agent input
        | None when not (SessionExecutionBinding.isManagedExecution journal key) -> ()
        | None ->
            invalidOp (
                sprintf
                    "PROMPT-006: managed provider run '%s' for session '%s' has no committed execution lease for physical user message '%s'"
                    agent
                    (SessionId.value key.SessionId)
                    (PhysicalUserMessageId.value key.PhysicalUserMessageId)
            )

    /// The observation barrier's whole policy: validate the Host's real
    /// observation against the exact execution, then project only the approved
    /// temperature. A message nobody durably accepted is left untouched.
    /// Project only the approved temperature onto a validated observation.
    let private projectManagedTemperature (input: obj) (output: obj) =
        if supportsTemperature input then
            applyManagedTemperature input output

    let private applyManagedPolicy (journal: AgentJournal option) input output =
        match tryAgent input, tryExecutionKey input with
        | Some agent, Some key when readAdmission key |> Option.isSome ->
            validateManagedObservation journal agent key input
            projectManagedTemperature input output
        | Some agent, Some key -> validateManagedObservation journal agent key input
        | _ -> ()

    let private handleInput (journal: AgentJournal option) (input: obj) (output: obj) =
        if emitJsExpr input "$0 != null && $0.agent === 'title'" then
            ()
        else
            applyManagedPolicy journal input output

    let createWith (journal: AgentJournal option) : obj =
        box (fun (input: obj) (output: obj) -> handleInput journal input output)

    let create () : obj = createWith None
