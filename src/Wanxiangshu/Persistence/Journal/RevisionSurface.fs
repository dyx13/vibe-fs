namespace Wanxiangshu.Persistence.Journal

open System
open System.Threading
open System.Threading.Tasks
open Fable.Core.JsInterop
open Wanxiangshu.Foundation.Identity

/// Plain-data revision subscription surface for the opaque journal capability.
/// The journal and envelope stay behind this boundary; callers receive only the
/// revision and canonical line needed to observe one successful fold.
[<RequireQualifiedAccess>]
module JournalRevisionSurface =

    let observeWaits (handle: JournalHandle) : obj =
        let journal = handle.Journal

        let startWait (fromRevision: int64) (preCancelled: bool) : obj =
            let cancellation = new CancellationTokenSource()

            if preCancelled then
                cancellation.Cancel()

            let pending =
                AgentJournal.awaitChangeFromOrCancel (JournalRevision.create fromRevision) cancellation.Token journal

            let result =
                task {
                    let! change = pending

                    return
                        match change with
                        | None -> box {| kind = "stopped" |}
                        | Some change ->
                            box
                                {| kind = "committed"
                                   revision = JournalRevision.value change.Revision |> int
                                   envelope = Envelope.serialize change.Envelope |}
                }

            box
                {| result = result
                   cancel = fun () -> cancellation.Cancel()
                   listenerCount = fun () -> (emitJsExpr cancellation.Token "$0._listeners.size": int)
                   dispose = fun () -> cancellation.Dispose() |}

        box
            {| startWait = Func<int64, bool, obj>(startWait)
               activeWaiterCount = fun () -> (emitJsExpr journal "$0.waiters.length": int)
               revision = fun () -> JournalRevision.value journal.Revision |> int
               close = fun () -> (journal :> IDisposable).Dispose()
               closeAsync = fun () -> task { do! (journal :> IAsyncDisposable).DisposeAsync() } |}

    let revision (handle: JournalHandle) : int =
        AgentJournal.revision handle.Journal |> JournalRevision.value |> int

    let awaitChangeFrom (fromRevision: int64) (handle: JournalHandle) : Task<obj> =
        task {
            let! change = AgentJournal.awaitChangeFrom (JournalRevision.create fromRevision) handle.Journal

            return
                box
                    {| revision = JournalRevision.value change.Revision |> int
                       envelope = Envelope.serialize change.Envelope |}
        }

    let awaitCancelled (fromRevision: int64) (handle: JournalHandle) : Task<bool> =
        task {
            use cancellation = new CancellationTokenSource()

            let pending =
                AgentJournal.awaitChangeFromOrCancel
                    (JournalRevision.create fromRevision)
                    cancellation.Token
                    handle.Journal

            cancellation.Cancel()
            let! change = pending
            return change.IsNone
        }
