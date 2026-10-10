namespace Wanxiangshu.OpenCode

open System
open System.Threading.Tasks
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Interaction.Attention
open Wanxiangshu.Participant.Provider
open Wanxiangshu.Resources

[<RequireQualifiedAccess>]
module AttentionTools =

    [<RequireQualifiedAccess>]
    module Path =
        [<Literal>]
        let DeferDescription = "attention-regulation/defer-description"

        [<Literal>]
        let DeferArgument = "attention-regulation/defer-argument"

        [<Literal>]
        let DeferAccepted = "attention-regulation/defer-accepted"

        [<Literal>]
        let Invalid = "attention-regulation/invalid"

        [<Literal>]
        let DurableUnavailable = "attention-regulation/durable-unavailable"

    let private languageOf (ctx: HostToolContext) =
        ProviderLanguageBinding.forSessionText ctx.SessionId

    let private render ctx path substitutions =
        ProviderProse.instructionLines (languageOf ctx) path substitutions
        |> LlmFacing.renderInstructions

    let private nonBlank (value: string) =
        if isNull value then "" else value.Trim()

    let private occurrenceId (ctx: HostToolContext) =
        ctx.ToolCallId |> Option.map ToolCallId.value

    let private persistDeferred (durable: AttentionJournalPort) sessionId occurrence text providerRun =
        taskResult {
            let projection = durable.Read()

            match AttentionProjection.tryFind sessionId occurrence projection with
            | Some _ -> return ()
            | None when AttentionProjection.wasConsumed sessionId occurrence projection -> return ()
            | None ->
                let fact =
                    AttentionFactCases.DeferredWorkRecorded
                        {| SessionId = sessionId
                           OccurrenceId = occurrence
                           Text = text |}

                do! durable.Append sessionId providerRun fact
                return ()
        }

    let private deferForDurable durable occurrence text (ctx: HostToolContext) =
        task {
            let sessionId = SessionId.create ctx.SessionId
            let! persisted = persistDeferred durable sessionId occurrence text ctx.ProviderRunId

            match persisted with
            | Ok() -> return render ctx Path.DeferAccepted (Map [ "value", text ])
            | Error _ -> return render ctx Path.DurableUnavailable Map.empty
        }

    let private deferExecute (journal: AttentionJournalPort option) (args: HostToolArguments) (ctx: HostToolContext) =
        task {
            let text = args.Text "new_work" |> nonBlank

            match journal, occurrenceId ctx with
            | _, _ when text.Length = 0 -> return render ctx Path.Invalid Map.empty
            | Some durable, Some occurrence when not (String.IsNullOrWhiteSpace ctx.SessionId) ->
                return! deferForDurable durable occurrence text ctx
            | _ -> return render ctx Path.DurableUnavailable Map.empty
        }

    let private argumentSchema factory language path =
        ToolHostCodec.stringSchemaDescribed (ProviderProse.render language path Map.empty) factory

    let admission: ToolAdmission =
        ToolAdmission.OfficeRole(fun _ (r: Role) -> r <> Role.Blogger && r <> Role.Distiller)

    let specs factory journal =
        let language = ProviderLanguageBinding.readGlobalPreference ()

        [ { Name = "defer"
            Description = ProviderProse.render language Path.DeferDescription Map.empty
            Arguments = [ "new_work", argumentSchema factory language Path.DeferArgument ]
            Admission = admission
            Execute = deferExecute journal } ]
