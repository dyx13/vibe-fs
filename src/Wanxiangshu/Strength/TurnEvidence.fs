namespace Wanxiangshu.Strength

open System
open Wanxiangshu.Composition.Turn
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.OpenCode
open Wanxiangshu.Participant.Provider
open Wanxiangshu.Strength.Replica

/// STRENGTH-007: maps Host reconciliation material onto the domain's causal
/// consumption evidence. Host bookkeeping alone is never proof that a provider
/// saw the Candidate input.
[<RequireQualifiedAccess>]
module StrengthTurnEvidence =

    let classifyParts (parts: MessagePart array) : StrengthProviderOutputEvidence =
        let classify =
            function
            | MessagePart.Text text
            | MessagePart.Reasoning text when not (String.IsNullOrWhiteSpace text) -> 2
            | MessagePart.ToolCall(callId, name, _) when
                not (String.IsNullOrWhiteSpace callId) || not (String.IsNullOrWhiteSpace name)
                ->
                2
            | MessagePart.ToolResult _
            | MessagePart.Activity _ -> 1
            | MessagePart.Text _
            | MessagePart.Reasoning _
            | MessagePart.ToolCall _ -> 0

        match parts |> Array.fold (fun strongest part -> max strongest (classify part)) 0 with
        | 2 -> StrengthProviderOutputEvidence.RealOutput
        | 1 -> StrengthProviderOutputEvidence.TransportOnly
        | _ -> StrengthProviderOutputEvidence.NoOutput

    let private promoteOutcome targetProviderRun (turn: ReconciledTurn) =
        match turn.Outcome with
        | ReconcileProgram.TurnCompleted
        | ReconcileProgram.TurnNeedsContinuation _ ->
            StrengthPromotion.decide targetProviderRun turn.ProviderRun (classifyParts turn.Parts)
        | ReconcileProgram.TurnFailed _
        | ReconcileProgram.TurnAborted _
        | ReconcileProgram.TurnInProgress -> StrengthPromotionDecision.AwaitOrAbandon

    let promotionDecision
        (targetProviderRun: Wanxiangshu.Foundation.Identity.ProviderRunIdentity)
        (turn: ReconciledTurn)
        : StrengthPromotionDecision =
        if targetProviderRun <> turn.ProviderRun then
            StrengthPromotionDecision.IgnoreWrongRun
        else
            promoteOutcome targetProviderRun turn

    let completedRequestDecision
        (targetProviderRun: ProviderRunIdentity)
        (physicalUserMessageId: PhysicalUserMessageId)
        (assistant: SessionMessage)
        : StrengthPromotionDecision =
        let settled =
            assistant.Completed
            && assistant.ErrorName.IsNone
            && (assistant.Finish = Some "tool-calls"
                || assistant.Finish = Some "stop"
                || assistant.Finish = Some "length")

        let exact =
            assistant.Role = "assistant"
            && assistant.ParentId = Some(PhysicalUserMessageId.value physicalUserMessageId)

        let hasCall =
            assistant.ToolParts
            |> Array.exists (fun part ->
                not (String.IsNullOrWhiteSpace(ToolCallId.value part.ToolCallId))
                && not (String.IsNullOrWhiteSpace part.ToolName))

        let evidence =
            if hasCall then
                StrengthProviderOutputEvidence.RealOutput
            else
                classifyParts assistant.Parts

        if settled && exact then
            StrengthPromotion.decide targetProviderRun (ProviderRunIdentity.create assistant.Id) evidence
        else
            StrengthPromotionDecision.AwaitOrAbandon
