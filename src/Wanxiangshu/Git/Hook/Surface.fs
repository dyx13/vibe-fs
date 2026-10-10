namespace Wanxiangshu.Git.Hook

open System
open System.Threading.Tasks
open Fable.Core.JsInterop
open Wanxiangshu.Foundation
open Wanxiangshu.Git
open Wanxiangshu.Persistence.EventStore
open Wanxiangshu.Process

/// Plain-data hook installation surface. HookDispatcher owns the physical
/// membrane; this module prevents its DU and path types crossing into tests.
[<RequireQualifiedAccess>]
module HookSurface =

    let private text (value: obj) =
        if isNull value then "" else string value

    let private kindOf (value: string) =
        match value with
        | "ReferenceTransaction" -> HookDispatcher.HookKind.ReferenceTransaction
        | "PrePush" -> HookDispatcher.HookKind.PrePush
        | other -> failwith $"HookSurface: unknown hook kind '{other}'"

    let private verdictName verdict =
        match verdict with
        | HookDispatcher.HookInstallVerdict.Installed -> "Installed"
        | HookDispatcher.HookInstallVerdict.AlreadyOwned -> "AlreadyOwned"
        | HookDispatcher.HookInstallVerdict.ForeignHook _ -> "ForeignHook"
        | HookDispatcher.HookInstallVerdict.DiagnoseIncomplete _ -> "DiagnoseIncomplete"

    let classifyExistingHook (existingBody: obj) : string =
        let body =
            if isNull existingBody then
                None
            else
                Some(text existingBody)

        HookDispatcher.classifyExistingHook body |> verdictName

    let installOrDiagnose (hooksDirectory: string) (kind: string) (shimBody: string) : string =
        HookDispatcher.installOrDiagnose hooksDirectory (kindOf kind) shimBody
        |> verdictName

    let ensure (workspace: string) : bool =
        HookDispatcher.ensure workspace |> Result.isOk

    let convergeExpiredAt (originMs: float) (budgetMs: float) (observedMs: float) : Task<obj> =
        task {
            let commands = ResizeArray<string list>()
            let localStages = ResizeArray<unit>()

            let clock =
                { new IClockPort with
                    member _.UtcNow() =
                        DateTimeOffset.FromUnixTimeMilliseconds(int64 observedMs) }

            let run args =
                commands.Add args
                Task.FromResult(1, "", "unexpected transport")

            let raw =
                ProcessGitRawStore.createWithRunner "." (fun (args, _) ->
                    commands.Add args
                    Task.FromResult(1, [||], "unexpected raw transport"))

            let deadline =
                Deadline.ofBudget
                    (DateTimeOffset.FromUnixTimeMilliseconds(int64 originMs))
                    (TimeSpan.FromMilliseconds budgetMs)

            let snapshot =
                { RootOid = RootOid.create (GitObjectId.create (String.replicate 40 "1")) }

            let! result =
                GitGateway.converge
                    raw
                    "."
                    run
                    3
                    "origin"
                    (Some snapshot)
                    (fun _ ->
                        localStages.Add()
                        Task.FromResult(Error ConvergeError.ConvergeCasRejected))
                    clock
                    deadline

            return
                box
                    {| budgetExhausted = (result = Error ConvergeError.ConvergeBudgetExhausted)
                       commands = commands.Count
                       localStages = localStages.Count |}
        }
