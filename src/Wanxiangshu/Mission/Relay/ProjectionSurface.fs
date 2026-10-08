namespace Wanxiangshu.Mission.Relay

open System.Threading.Tasks
open Fable.Core.JsInterop
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Mission.Relay.OpenCode
open Wanxiangshu.Persistence.Journal

module ProjectionSurface =
    /// The provider view keeps the full physical history: after a
    /// retirement the next iteration sees every prior message, the
    /// retirement tool call itself and its own fresh-head prompt. Audit
    /// and provider therefore share one message set, and the retirement
    /// cut is only a request-identity test for stale attempts, never a
    /// filter over the provider message set.
    let projectMessages (messages: obj array) =
        box
            {| audit = messages
               provider = messages |}

    let apply (journal: JournalHandle) (sessionId: string) (acceptedRequest: bool) (messages: obj array) : Task<obj> =
        task {
            let interrupted = ResizeArray<string>()
            let output = createObj [ "messages" ==> messages ]

            let interrupt current _ =
                interrupted.Add(SessionId.value current)
                Task.FromResult()

            let! disposition =
                RelayNarrativeTransform.apply (Some journal.Journal) acceptedRequest interrupt (Some sessionId) output

            return
                box
                    {| disposition =
                        match disposition with
                        | RelayProjectionDisposition.Unchanged -> "unchanged"
                        | RelayProjectionDisposition.CurrentIteration -> "current-iteration"
                        | RelayProjectionDisposition.RetiredAttemptStopped -> "retired-attempt-stopped"
                       messages = output?messages
                       interrupted = interrupted.ToArray() |}
        }
