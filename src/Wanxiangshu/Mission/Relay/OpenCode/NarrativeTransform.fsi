namespace Wanxiangshu.Mission.Relay.OpenCode

open System.Threading.Tasks
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Mission.Relay
open Wanxiangshu.Persistence.Journal

[<RequireQualifiedAccess>]
type RelayProjectionDisposition =
    | Unchanged
    | CurrentIteration
    | RetiredAttemptStopped

module RelayNarrativeTransform =
    /// A retained cut cannot interrupt or dispatch into a newly accepted authority root.
    val retirementOwnsAuthority:
        journal: AgentJournal option -> sessionId: SessionId -> retirement: RetirementSummary -> bool

    /// Read-only request classification using the same durable cut and successor evidence as apply.
    val isRetiredRequest:
        journal: AgentJournal option -> acceptedRequest: bool -> sessionId: string option -> outObj: obj -> bool

    val apply:
        journal: AgentJournal option ->
        acceptedRequest: bool ->
        interruptAttempt: (SessionId -> RetirementSummary -> Task<unit>) ->
        sessionId: string option ->
        outObj: obj ->
            Task<RelayProjectionDisposition>
