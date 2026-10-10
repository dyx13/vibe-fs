namespace Wanxiangshu.OpenCode

open System
open System.Threading.Tasks
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Interaction.Concern
open Wanxiangshu.Participant.Provider
open Wanxiangshu.Resources

[<RequireQualifiedAccess>]
module ConcernTools =

    [<RequireQualifiedAccess>]
    module Path =
        [<Literal>]
        let PublishDescription = "concern-routing/publish-description"

        [<Literal>]
        let PublishId = "concern-routing/publish-id"

        [<Literal>]
        let PublishMessage = "concern-routing/publish-message"

        [<Literal>]
        let PublishAccepted = "concern-routing/publish-accepted"

        [<Literal>]
        let PublishUnknown = "concern-routing/publish-unknown"

        [<Literal>]
        let PublishConflict = "concern-routing/publish-conflict"

        [<Literal>]
        let Invalid = "concern-routing/invalid"

        [<Literal>]
        let DurableUnavailable = "concern-routing/durable-unavailable"

        [<Literal>]
        let UserNotificationTitle = "concern-routing/user-notification-title"

        [<Literal>]
        let UserNotificationUnavailable = "concern-routing/user-notification-unavailable"

    let private languageOf (ctx: HostToolContext) =
        ProviderLanguageBinding.forSessionText ctx.SessionId

    let private render (ctx: HostToolContext) path substitutions =
        ProviderProse.instructionLines (languageOf ctx) path substitutions
        |> LlmFacing.renderInstructions

    let private trim (value: string) =
        if isNull value then "" else value.Trim()

    let private occurrenceId (ctx: HostToolContext) =
        ctx.ToolCallId |> Option.map ToolCallId.value

    type private PublishFailure =
        | UnknownMailbox
        | OccurrenceConflict
        | DurableUnavailable

    let private persistPublication (durable: ConcernJournalPort) sender occurrence id message providerRun =
        taskResult {
            let state = durable.ReadState sender

            match ConcernProjection.tryFindMessage occurrence state with
            | Some existing when
                existing.SenderSessionId = sender
                && existing.Id = id
                && existing.Message = message
                ->
                return ()
            | Some _ -> return! Error PublishFailure.OccurrenceConflict
            | None ->
                let! fact =
                    ConcernProjection.publish sender occurrence id message state
                    |> Result.mapError (fun _ -> PublishFailure.UnknownMailbox)

                let! _ =
                    durable.Append sender providerRun fact
                    |> TaskResult.mapError (fun _ -> PublishFailure.DurableUnavailable)

                return ()
        }

    let private publishForDurable durable occurrence id message (ctx: HostToolContext) =
        task {
            let sender = SessionId.create ctx.SessionId
            let! result = persistPublication durable sender occurrence id message ctx.ProviderRunId

            match result with
            | Ok() -> return render ctx Path.PublishAccepted (Map [ "id", id ])
            | Error PublishFailure.UnknownMailbox -> return render ctx Path.PublishUnknown (Map [ "id", id ])
            | Error PublishFailure.OccurrenceConflict -> return render ctx Path.PublishConflict Map.empty
            | Error PublishFailure.DurableUnavailable -> return render ctx Path.DurableUnavailable Map.empty
        }

    let private notificationResult ctx =
        function
        | Ok() -> render ctx Path.PublishAccepted (Map [ "id", ReservedAddress.User ])
        | Error _ -> render ctx Path.UserNotificationUnavailable Map.empty

    let private notifyUser toast message ctx =
        match toast with
        | None -> Task.FromResult(render ctx Path.UserNotificationUnavailable Map.empty)
        | Some show ->
            show (render ctx Path.UserNotificationTitle Map.empty) message
            |> TaskValue.map (notificationResult ctx)

    /// concern-routing-003: the reserved user address is not a session mailbox.
    /// Publishing to it raises a user-visible notification and copies the same
    /// message to the reserved root address when that mailbox is live.
    /// The durable copy settles first: the toast renders only after the copy
    /// attempt settles, and never when the store itself is unavailable or the
    /// occurrence conflicts. A missing live `root` mailbox only skips the copy.
    let private publishToUser durable occurrence message toast (ctx: HostToolContext) =
        task {
            let sender = SessionId.create ctx.SessionId

            let! copy =
                persistPublication durable sender (occurrence + ":root") ReservedAddress.Root message ctx.ProviderRunId

            match copy with
            | Ok()
            | Error PublishFailure.UnknownMailbox -> return! notifyUser toast message ctx
            | Error PublishFailure.OccurrenceConflict -> return render ctx Path.PublishConflict Map.empty
            | Error PublishFailure.DurableUnavailable -> return render ctx Path.DurableUnavailable Map.empty
        }

    let private dispatchPublication durable occurrence id message toast ctx =
        if id = ReservedAddress.User then
            publishToUser durable occurrence message toast ctx
        else
            publishForDurable durable occurrence id message ctx

    let private publishExecute
        (journal: ConcernJournalPort option)
        (toast: (string -> string -> Task<Result<unit, string>>) option)
        (args: HostToolArguments)
        (ctx: HostToolContext)
        =
        task {
            let id = args.Text "id" |> trim
            let message = args.Text "message" |> trim

            match journal, occurrenceId ctx with
            | _, _ when id.Length = 0 || message.Length = 0 -> return render ctx Path.Invalid Map.empty
            | Some durable, Some occurrence when not (String.IsNullOrWhiteSpace ctx.SessionId) ->
                return! dispatchPublication durable occurrence id message toast ctx
            | _ -> return render ctx Path.DurableUnavailable Map.empty
        }

    let admission: ToolAdmission =
        ToolAdmission.OfficeRole(fun _ (r: Role) -> r <> Role.Blogger && r <> Role.Distiller)

    let specs
        factory
        (journal: ConcernJournalPort option)
        (toast: (string -> string -> Task<Result<unit, string>>) option)
        =
        let language = ProviderLanguageBinding.readGlobalPreference ()

        [ { Name = "publish"
            Description = ProviderProse.render language Path.PublishDescription Map.empty
            Arguments =
              [ "id",
                ToolHostCodec.stringSchemaDescribed (ProviderProse.render language Path.PublishId Map.empty) factory
                "message",
                ToolHostCodec.stringSchemaDescribed
                    (ProviderProse.render language Path.PublishMessage Map.empty)
                    factory ]
            Admission = admission
            Execute = publishExecute journal toast } ]
