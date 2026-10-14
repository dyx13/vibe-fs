namespace Wanxiangshu.Host.CompilerProbe

open Fable.Core.JsInterop
open Wanxiangshu.Context.Trace
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Interaction.Repair
open Wanxiangshu.OpenCode
open Wanxiangshu.Participant.Provider.Projection.ProviderProjection
open Wanxiangshu.Persistence.Journal
open Wanxiangshu.Strength
open Wanxiangshu.Strength.Replica

module MessageFlow =
    let observe (raw: obj array) : obj =
        let message = SessionSnapshotPort.projectMessages raw |> List.exactlyOne

        let turn =
            CompletedTurnClassifier.buildTurn
                (SessionId.create "session-byte")
                (PhysicalUserMessageId.create "physical-byte")
                (AuthorityRootUserMessageId.create "authority-byte")
                message
                None
                (Some "workspace-byte")

        let captured = XTraceMessageConversion.toCapturedWire message

        let call =
            captured.Parts
            |> List.tryPick (fun part ->
                match part.WirePart with
                | WireToolCall(callId, _, args) -> Some(ToolCallId.value callId, args)
                | _ -> None)

        let strength =
            match StrengthTurnEvidence.classifyParts turn.Parts with
            | StrengthProviderOutputEvidence.RealOutput -> "real-output"
            | StrengthProviderOutputEvidence.TransportOnly -> "transport-only"
            | StrengthProviderOutputEvidence.NoOutput -> "no-output"

        box
            {| partCount = turn.Parts.Length
               partIds =
                message.PartIds
                |> Array.map (Option.map HostMessagePartId.value >> Option.toObj)
               providerRun = ProviderRunIdentity.value turn.ProviderRun
               physicalUserMessageId = PhysicalUserMessageId.value turn.PhysicalUserMessageId
               authorityRoot = AuthorityRootUserMessageId.value turn.AuthorityRootUserMessageId
               modelId = turn.Model |> Option.map (fun model -> model.modelID) |> Option.toObj
               formalText = CompletedTurnClassifier.partsText turn.Parts
               sessionText = CompletedTurnClassifier.partsSessionText turn.Parts
               repairActivity = CompletedTurnClassifier.hasToolCallPart turn.Parts
               strengthEvidence = strength
               capturedIds =
                captured.Parts
                |> List.map (fun part -> part.HostPartId |> Option.map HostMessagePartId.value |> Option.toObj)
                |> List.toArray
               capturedCallId = call |> Option.map fst |> Option.toObj
               capturedArgs = call |> Option.map snd |> Option.toObj |}

    let capture (handle: JournalHandle) (raw: obj array) =
        task {
            let! result =
                raw
                |> SessionSnapshotPort.projectMessages
                |> XTraceCapture.captureSessionMessagesWithReceipt
                    (Some handle.Journal)
                    (SessionId.create "session-byte")

            match result with
            | Ok receipt -> return receipt.CapturedPartCount
            | Error reason -> return failwith (sprintf "%A" reason)
        }
