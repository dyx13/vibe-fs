namespace Wanxiangshu.Git.Hook

open System
open System.Threading.Tasks
open Fable.Core
open Fable.Core.JsInterop
open Wanxiangshu.Foundation
open Wanxiangshu.Git
open Wanxiangshu.Persistence.EventStore
open Wanxiangshu.Process

/// Standalone hook-process entry functions. They depend only on `.git/wanxiang`,
/// Git transport and WriterStreamSync — never PluginHost/WorkspaceEventStore/
/// CanonicalIntegrator. The compiled module is invoked by resources/git/wanxiang-hook.mjs.
[<RequireQualifiedAccess>]
module HookSync =

    [<Literal>]
    let private MaxRetries = 3

    /// Whole-pass hook budget. Single git commands carry their own limits in
    /// GitGateway; this bounds the retry/refresh loop across all of them.
    [<Literal>]
    let private ConvergeBudgetSeconds = 600.0

    [<Emit("process.env.WANXIANG_GIT_SYNC_ACTIVE = '1'")>]
    let private markSyncActive () : unit = jsNative

    let private trim (value: string) =
        if isNull value then "" else value.Trim()

    let private repositoryRoot () =
        GitSubject.execIn "." [| "rev-parse"; "--show-toplevel" |] |> trim

    let private commonDir repo =
        GitSubject.execIn repo [| "rev-parse"; "--path-format=absolute"; "--git-common-dir" |]
        |> trim

    let private snapshot oid =
        if String.IsNullOrWhiteSpace oid || Seq.forall (fun ch -> ch = '0') oid then
            None
        else
            Some { RootOid = RootOid.create (GitObjectId.create oid) }

    let private formatError remote error =
        sprintf "Wanxiang EventStore sync failed for remote '%s': %A" remote error

    let private failureMessage remote result =
        match result with
        | Ok _ -> None
        | Error error -> Some(formatError remote error)

    let private converge (clock: IClockPort) remote observed =
        task {
            try
                markSyncActive ()
                let repo = repositoryRoot ()
                let gitCommonDir = commonDir repo
                let raw = ProcessGitRawStore.create repo
                let run = GitGateway.createDefaultRunner repo

                let deadline =
                    Deadline.ofBudget (clock.UtcNow()) (TimeSpan.FromSeconds ConvergeBudgetSeconds)

                let! result =
                    GitGateway.converge
                        raw
                        gitCommonDir
                        run
                        MaxRetries
                        remote
                        observed
                        (fun stage -> ProcessEventLog.withStoreLock gitCommonDir stage)
                        clock
                        deadline

                return failureMessage remote result
            with ex ->
                return Some(sprintf "Wanxiang EventStore sync failed: %s" ex.Message)
        }

    /// pre-push receives remote-name and remote-url from Git. The remote URL is
    /// intentionally irrelevant: Git itself owns remote resolution/auth.
    let runPrePush (remote: string) : Task<string option> =
        if String.IsNullOrWhiteSpace remote then
            Task.FromResult(Some "Wanxiang pre-push sync requires the Git remote name")
        else
            converge (NodeTiming.nodeClockPort ()) remote None

    let private tryTrackingUpdate (line: string) =
        let fields = line.Split([| ' '; '\t' |], StringSplitOptions.RemoveEmptyEntries)

        if fields.Length < 3 then
            None
        else
            let newOid = fields.[1]
            let refName = fields.[2]

            StoreRef.tryRemoteFromTracking refName
            |> Option.map (fun remote -> remote, snapshot newOid)

    let rec private convergeRemaining clock remaining =
        task {
            match remaining with
            | [] -> return None
            | (remote, observed) :: tail -> return! stepRemoteConverge clock remote observed tail
        }

    and private stepRemoteConverge clock remote observed tail =
        task {
            match! converge clock remote observed with
            | Some error -> return Some error
            | None -> return! convergeRemaining clock tail
        }

    /// reference-transaction `committed` is also FULL bidirectional convergence.
    /// The observed root only skips discovery of the first remote snapshot.
    let runReferenceTransaction (state: string) (stdinText: string) : Task<string option> =
        task {
            if state <> "committed" then
                return None
            else
                let updates =
                    (if isNull stdinText then "" else stdinText).Split('\n')
                    |> Array.choose tryTrackingUpdate
                    |> Array.fold (fun acc (remote, observed) -> Map.add remote observed acc) Map.empty
                    |> Map.toList

                return! convergeRemaining (NodeTiming.nodeClockPort ()) updates
        }
