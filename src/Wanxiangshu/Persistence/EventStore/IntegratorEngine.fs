namespace Wanxiangshu.Persistence.EventStore

open System
open FsToolkit.ErrorHandling
open Thoth.Json
open Wanxiangshu.Foundation.Identity

/// Structural frontier oracle. It sees every durable event but owns no business
/// meaning; DomainConflict is simply `heads.Count > 1` in this Integrator slot.
[<RequireQualifiedAccess>]
module StructuralIntegration =
    let rule: IntegrationRule =
        { Name = "Structural"
          Initial = box StructuralProjection.empty
          Accepts = fun _ -> true
          FaultScope = fun _ -> "global"
          Integrate =
            fun current envelope ->
                StructuralProjection.apply (unbox<StructuralProjection> current) envelope
                |> box
                |> Ok
          PlanCut = fun _ _ _ _ -> Error "Structural integration cannot be cut"
          ApplyCut = fun current _ -> Ok current }

[<RequireQualifiedAccess>]
module IntegratorEngine =

    let private structuralRule = StructuralIntegration.rule

    let private requireStructuralRule (program: IntegrationRule list) =
        if program |> List.exists (fun rule -> rule.Name = structuralRule.Name) |> not then
            invalidArg "rules" (sprintf "IntegratorEngine program is missing required rule '%s'" structuralRule.Name)

    type private RuleFaultKey = { Rule: string; Scope: string }

    type private RuleFault =
        { FailedEventId: EventId
          Reason: string }

    /// PayloadIndex (durable-events-012) maps inline payload content addresses to
    /// their bytes, folded from every accepted envelope. It is part of the same
    /// replay that derives Current, never a second pass over durable history.
    type private IntegratorState =
        { Currents: Map<string, obj>
          Events: Map<string, EventEnvelope>
          PayloadIndex: Map<PayloadRef, byte[]>
          Faults: Map<RuleFaultKey, RuleFault> }

    type private IntegrationStep =
        { State: IntegratorState
          FailedRules: (RuleFaultKey * string) list }

    type private BusinessRuleDecision =
        | RuleSkipped
        | RuleAdvanced of obj
        | RuleFailed of string

    type private CutPayload =
        { Rule: string
          FailedEventId: EventId
          Reason: string
          ResetJson: string }

    let private initialState (program: IntegrationRule list) =
        { Currents = program |> List.map (fun rule -> rule.Name, rule.Initial) |> Map.ofList
          Events = Map.empty
          PayloadIndex = Map.empty
          Faults = Map.empty }

    let private eventKey (eventId: EventId) = EventId.value eventId

    let private businessOf (program: IntegrationRule list) =
        program |> List.filter (fun rule -> rule.Name <> structuralRule.Name)

    let private matchingBusinessRules (program: IntegrationRule list) (envelope: EventEnvelope) =
        businessOf program |> List.filter (fun rule -> rule.Accepts envelope)

    let private tryRule (program: IntegrationRule list) name =
        businessOf program |> List.tryFind (fun rule -> rule.Name = name)

    let private faultKey (rule: IntegrationRule) (envelope: EventEnvelope) =
        { Rule = rule.Name
          Scope = rule.FaultScope envelope }

    let private encodeCutPayload (payload: CutPayload) =
        Encode.object
            [ "rule", Encode.string payload.Rule
              "failed_event_id", Encode.string (EventId.value payload.FailedEventId)
              "reason", Encode.string payload.Reason
              "reset_json", Encode.string payload.ResetJson ]

    let private tryDecodeCutPayload (envelope: EventEnvelope) =
        if envelope.EventType <> ProjectionCutTailEvent.EventType then
            None
        else
            Decode.fromValue
                "$"
                (Decode.object (fun get ->
                    { Rule = get.Required.Field "rule" Decode.string
                      FailedEventId = EventId.create (get.Required.Field "failed_event_id" Decode.string)
                      Reason = get.Required.Field "reason" Decode.string
                      ResetJson = get.Required.Field "reset_json" Decode.string }))
                envelope.Payload
            |> Result.toOption

    let private structuralStep (state: IntegratorState) (normalized: EventEnvelope) =
        let current =
            state.Currents
            |> Map.tryFind structuralRule.Name
            |> Option.defaultValue structuralRule.Initial

        match structuralRule.Integrate current normalized with
        | Ok next ->
            { state with
                Currents = Map.add structuralRule.Name next state.Currents }
        | Error _ -> state

    let private applyCutForRule
        (state: IntegratorState)
        (payload: CutPayload)
        (rule: IntegrationRule)
        (key: RuleFaultKey)
        =
        let current =
            state.Currents |> Map.tryFind rule.Name |> Option.defaultValue rule.Initial

        match rule.ApplyCut current payload.ResetJson with
        | Error _ -> state
        | Ok reset ->
            { state with
                Currents = Map.add rule.Name reset state.Currents
                Faults = Map.remove key state.Faults }

    let private applyCut (program: IntegrationRule list) (state: IntegratorState) (payload: CutPayload) =
        match tryRule program payload.Rule, Map.tryFind (eventKey payload.FailedEventId) state.Events with
        | Some rule, Some failed -> applyCutForRule state payload rule (faultKey rule failed)
        | _ -> state

    let private evaluateBusinessRule (state: IntegratorState) (normalized: EventEnvelope) (rule: IntegrationRule) =
        let prior =
            state.Currents |> Map.tryFind rule.Name |> Option.defaultValue rule.Initial

        match rule.Integrate prior normalized with
        | Ok next -> RuleAdvanced next
        | Error reason -> RuleFailed reason

    let private decideBusinessRule (state: IntegratorState) (normalized: EventEnvelope) (rule: IntegrationRule) =
        if Map.containsKey (faultKey rule normalized) state.Faults then
            RuleSkipped
        else
            evaluateBusinessRule state normalized rule

    let private applyBusinessDecision
        (normalized: EventEnvelope)
        (rule: IntegrationRule)
        ((state: IntegratorState), (failures: (RuleFaultKey * string) list))
        (decision: BusinessRuleDecision)
        =
        match decision with
        | RuleSkipped -> state, failures
        | RuleAdvanced next ->
            { state with
                Currents = Map.add rule.Name next state.Currents },
            failures
        | RuleFailed reason ->
            let key = faultKey rule normalized

            let fault =
                { FailedEventId = normalized.EventId
                  Reason = reason }

            { state with
                Faults = Map.add key fault state.Faults },
            (key, reason) :: failures

    let private applyBusinessRule
        (normalized: EventEnvelope)
        ((state: IntegratorState), (failures: (RuleFaultKey * string) list))
        (rule: IntegrationRule)
        =
        decideBusinessRule state normalized rule
        |> applyBusinessDecision normalized rule (state, failures)

    let private integrateBusiness (program: IntegrationRule list) (state: IntegratorState) (normalized: EventEnvelope) =
        let next, failures =
            matchingBusinessRules program normalized
            |> List.fold (applyBusinessRule normalized) (state, [])

        { State = next
          FailedRules = List.rev failures }

    let private semanticStep (program: IntegrationRule list) state normalized =
        match tryDecodeCutPayload normalized with
        | Some payload ->
            { State = applyCut program state payload
              FailedRules = [] }
        | None -> integrateBusiness program state normalized

    let private addIntegratedEvent key normalized (semantic: IntegrationStep) =
        let payloadIndex =
            normalized.Payloads
            |> Map.fold (fun acc payloadRef bytes -> Map.add payloadRef bytes acc) semantic.State.PayloadIndex

        { semantic with
            State =
                { semantic.State with
                    Events = Map.add key normalized semantic.State.Events
                    PayloadIndex = payloadIndex } }

    let private integrateNew
        (program: IntegrationRule list)
        allowExternalParents
        (state: IntegratorState)
        (normalized: EventEnvelope)
        key
        =
        let missingParent =
            normalized.Parents
            |> List.tryFind (fun parent -> not (Map.containsKey (eventKey parent) state.Events))

        match missingParent with
        | Some parent when not allowExternalParents ->
            Error(sprintf "missing parent during integration: %s" (EventId.value parent))
        | None ->
            semanticStep program (structuralStep state normalized) normalized
            |> addIntegratedEvent key normalized
            |> Ok
        | Some _ ->
            // Retained replay may begin after this event's causal predecessor
            // aged out as a whole writer. EventKWayMerge.mergeRetained already
            // proved the parent is absent from the entire retained set; only
            // this boot/reload mode may treat that boundary as satisfied.
            semanticStep program (structuralStep state normalized) normalized
            |> addIntegratedEvent key normalized
            |> Ok

    /// The only single-event integration primitive. Replay preserves timeline
    /// order exactly: a semantic failure leaves last-good Current in place and
    /// marks that rule faulted; a later durable ProjectionCutTail applies the
    /// rule-owned reset patch and clears the fault.
    let private integrateOne
        (program: IntegrationRule list)
        allowExternalParents
        (state: IntegratorState)
        (envelope: EventEnvelope)
        : Result<IntegrationStep, string> =
        let normalized = EventEnvelope.normalize envelope
        let key = eventKey normalized.EventId

        match Map.tryFind key state.Events with
        | Some existing ->
            CanonicalEventCodec.checkIdentity existing normalized
            |> Result.mapError (sprintf "identity collision: %A")
            |> Result.map (fun () -> { State = state; FailedRules = [] })
        | None -> integrateNew program allowExternalParents state normalized key

    /// Boot history ordering is delegated to the one structural k-way primitive.
    /// Business semantic failures never abort replay; they cut only that rule's
    /// tail until an in-order ProjectionCutTail reset fact is encountered.
    let private replay
        (program: IntegrationRule list)
        (streams: (string * EventEnvelope list) list)
        : Result<IntegratorState, string> =
        EventKWayMerge.mergeRetained streams
        |> Result.mapError (sprintf "writer-stream replay invalid: %A")
        |> Result.bind (fun ordered ->
            // DSL-MUTABLE: algorithm-scratch — stack depth must not scale with history length.
            let mutable state = initialState program
            let mutable remaining = ordered
            // DSL-MUTABLE: algorithm-scratch — first integrateOne failure cuts this replay
            let mutable failure: string option = None

            let advance () =
                match integrateOne program true state (List.head remaining) with
                | Ok step ->
                    state <- step.State
                    remaining <- List.tail remaining
                | Error reason -> failure <- Some reason

            while not (List.isEmpty remaining) && failure.IsNone do
                advance ()

            match failure with
            | Some reason -> Error reason
            | None -> Ok state)

    let private fullReplayGate = obj ()
    // DSL-MUTABLE: resource — one process-wide emergency full-history replay budget.
    let mutable private fullReplayUsed = false

    let private trySpendFullReplayBudget () =
        lock fullReplayGate (fun () ->
            if fullReplayUsed then
                false
            else
                fullReplayUsed <- true
                true)

    let private validateLocalHistory (isEventTypeKnown: string -> bool) commonDir streams =
        result {
            let events = streams |> List.collect snd

            do!
                events
                |> List.tryFind (fun envelope -> not (isEventTypeKnown envelope.EventType))
                |> Option.map (fun envelope ->
                    Error(sprintf "unknown durable event type during replay: %s" envelope.EventType))
                |> Option.defaultValue (Ok())

            do!
                events
                |> List.tryPick (fun envelope ->
                    // durable-events-012: inline payloads are self-contained; a
                    // PayloadRef is satisfied exactly when the event line embeds it
                    // with a matching content address. Absence and digest mismatch are
                    // distinct physical faults and stay distinguishable in the message.
                    envelope.PayloadRefs
                    |> List.tryPick (fun payloadRef ->
                        match envelope.Payloads |> Map.tryFind payloadRef with
                        | None ->
                            Some(
                                sprintf
                                    "missing durable inline payload during replay: %s"
                                    (PayloadRef.value payloadRef)
                            )
                        | Some content when ProcessEventLog.payloadDigest content <> PayloadRef.value payloadRef ->
                            Some(
                                sprintf
                                    "durable inline payload digest mismatch during replay: %s"
                                    (PayloadRef.value payloadRef)
                            )
                        | Some _ -> None))
                |> Option.map Error
                |> Option.defaultValue (Ok())
        }

    let create (rules: IntegrationRule list) (isEventTypeKnown: string -> bool) : ICanonicalIntegrator =
        requireStructuralRule rules
        let program = rules
        let gate = obj ()
        // DSL-MUTABLE: resource — the sole process Current owned by this Integrator.
        let mutable state = initialState program
        // DSL-MUTABLE: resource — last loaded local EventStore for the one allowed
        // process-wide full replay fallback when a business rule cannot infer a cut.
        let mutable loadedCommonDir: string option = None

        let currentForRule (rule: IntegrationRule) (currentState: IntegratorState) =
            currentState.Currents
            |> Map.tryFind rule.Name
            |> Option.defaultValue rule.Initial

        let validateCutPlan (rule: IntegrationRule) current (plan: SemanticCutPlan) =
            rule.ApplyCut current plan.ResetJson |> Result.map (fun _ -> plan)

        let inferCutPlan (rule: IntegrationRule) current (failed: EventEnvelope) (fault: RuleFault) afterFullReplay =
            rule.PlanCut current failed fault.Reason afterFullReplay
            |> Result.bind (validateCutPlan rule current)

        let retryCutPlanAfterFullReplay (rule: IntegrationRule) (failed: EventEnvelope) (fault: RuleFault) firstReason =
            match loadedCommonDir with
            | Some commonDir when trySpendFullReplayBudget () ->
                result {
                    let! streams =
                        ProcessEventLog.readStreams commonDir
                        |> Result.mapError (sprintf "cut-tail full replay read failed: %A")

                    do! validateLocalHistory isEventTypeKnown commonDir streams
                    let! replayed = replay program streams
                    let replayCurrent = currentForRule rule replayed

                    return!
                        inferCutPlan rule replayCurrent failed fault true
                        |> Result.mapError (fun secondReason ->
                            sprintf
                                "cut-tail inference failed before and after the one full replay: %s; %s"
                                firstReason
                                secondReason)
                }
            | _ ->
                Error(
                    "cut-tail inference failed and full replay budget is unavailable: "
                    + firstReason
                )

        let chooseCutPlan firstAttempt retry =
            match firstAttempt with
            | Ok plan -> Ok plan
            | Error firstReason -> retry firstReason

        let planCut (currentState: IntegratorState) (rule: IntegrationRule) (fault: RuleFault) =
            result {
                let! failed =
                    currentState.Events
                    |> Map.tryFind (eventKey fault.FailedEventId)
                    |> Option.map Ok
                    |> Option.defaultValue (Error("cut-tail lost failed event: " + EventId.value fault.FailedEventId))

                let liveCurrent = currentForRule rule currentState

                return!
                    chooseCutPlan
                        (inferCutPlan rule liveCurrent failed fault false)
                        (retryCutPlanAfterFullReplay rule failed fault)
            }

        let cutEnvelope
            (currentState: IntegratorState)
            (rule: IntegrationRule)
            (fault: RuleFault)
            (plan: SemanticCutPlan)
            =
            let streamId = ProjectionCutTailEvent.streamId rule.Name

            let existingHeads =
                match Map.tryFind structuralRule.Name currentState.Currents with
                | None -> []
                | Some current -> StructuralProjection.heads streamId (unbox<StructuralProjection> current)

            let payload =
                { Rule = rule.Name
                  FailedEventId = fault.FailedEventId
                  Reason = fault.Reason
                  ResetJson = plan.ResetJson }

            { EventId = EventId.create (Guid.NewGuid().ToString("N"))
              StreamId = streamId
              EventType = ProjectionCutTailEvent.EventType
              Parents = fault.FailedEventId :: existingHeads
              Payload = encodeCutPayload payload
              PayloadRefs = []
              Payloads = Map.empty }
            |> EventEnvelope.normalize

        let ensureRuleReset (currentState: IntegratorState) (rule: IntegrationRule) (key: RuleFaultKey) =
            result {
                match Map.tryFind key currentState.Faults with
                | None -> return currentState, [], []
                | Some fault ->
                    let! plan = planCut currentState rule fault
                    let cut = cutEnvelope currentState rule fault plan
                    let! integrated = integrateOne program false currentState cut

                    let receipt =
                        { Rule = rule.Name
                          FailedEventId = fault.FailedEventId
                          Reason = fault.Reason
                          CutEventId = cut.EventId }

                    return integrated.State, [ cut ], [ receipt ]
            }

        let ensureMatchingResets (currentState: IntegratorState) (envelope: EventEnvelope) =
            let rec loop state cuts receipts remaining =
                result {
                    match remaining with
                    | [] -> return state, cuts, receipts
                    | rule :: tail ->
                        let key = faultKey rule envelope
                        let! next, addedCuts, addedReceipts = ensureRuleReset state rule key
                        return! loop next (cuts @ addedCuts) (receipts @ addedReceipts) tail
                }

            loop currentState [] [] (matchingBusinessRules program envelope)

        let closeFailure (state, addedEvents, addedCuts) ((key: RuleFaultKey), _) =
            match tryRule program key.Rule with
            | None -> Ok(state, addedEvents, addedCuts)
            | Some rule ->
                result {
                    let! next, eventCuts, receipts = ensureRuleReset state rule key
                    return next, addedEvents @ eventCuts, addedCuts @ receipts
                }

        let closeFailures state failures =
            failures
            |> List.fold
                (fun aggregate failure -> aggregate |> Result.bind (fun current -> closeFailure current failure))
                (Ok(state, [], []))

        let prepareLive (startState: IntegratorState) (events: EventEnvelope list) =
            let rec loop current durable cuts remaining =
                result {
                    match remaining with
                    | [] -> return current, durable, cuts
                    | raw :: tail ->
                        let normalized = EventEnvelope.normalize raw
                        let! before, resetEvents, resetCuts = ensureMatchingResets current normalized
                        let! step = integrateOne program false before normalized
                        let! after, postCutEvents, postCuts = closeFailures step.State step.FailedRules

                        return!
                            loop
                                after
                                (durable @ resetEvents @ [ normalized ] @ postCutEvents)
                                (cuts @ resetCuts @ postCuts)
                                tail
                }

            loop startState [] [] events

        { new ICanonicalIntegrator with
            member _.ReloadLocal(commonDir) =
                lock gate (fun () ->
                    result {
                        let! streams =
                            ProcessEventLog.readStreams commonDir
                            |> Result.mapError (sprintf "local event history read failed: %A")

                        do! validateLocalHistory isEventTypeKnown commonDir streams
                        let! replayed = replay program streams
                        state <- replayed
                        loadedCommonDir <- Some commonDir
                        return ()
                    })

            member _.PrepareLive(events) =
                lock gate (fun () ->
                    result {
                        let! preparedState, durableEvents, cuts = prepareLive state events
                        // Optimistic concurrency: capture the current state reference.
                        // A ReloadLocal or another commit creates a new IntegratorState
                        // heap object, invalidating this prepare via reference inequality.
                        let expectedState = state

                        return
                            { DurableEvents = durableEvents
                              Cuts = cuts
                              Commit =
                                fun () ->
                                    lock gate (fun () ->
                                        if not (obj.ReferenceEquals(state, expectedState)) then
                                            failwith
                                                "CanonicalIntegrator Current changed between prepare and durable append"

                                        state <- preparedState) }
                    })

            member _.IsEventTypeKnown(eventType) = isEventTypeKnown eventType

            member _.TryCurrent(key) =
                lock gate (fun () -> Map.tryFind key state.Currents)

            member _.TryEvent(eventId) =
                lock gate (fun () -> Map.tryFind (eventKey eventId) state.Events)

            member _.TryPayload(payloadRef) =
                lock gate (fun () -> Map.tryFind payloadRef state.PayloadIndex)

            member _.TryHeads(streamId) =
                lock gate (fun () ->
                    match Map.tryFind structuralRule.Name state.Currents with
                    | None -> []
                    | Some current -> StructuralProjection.heads streamId (unbox<StructuralProjection> current))

            member this.TryHead(streamId) =
                match this.TryHeads streamId with
                | [ head ] -> Some head
                | _ -> None

            member _.AllHeads() =
                lock gate (fun () ->
                    match Map.tryFind structuralRule.Name state.Currents with
                    | None -> []
                    | Some current -> StructuralProjection.allHeads (unbox<StructuralProjection> current)) }
