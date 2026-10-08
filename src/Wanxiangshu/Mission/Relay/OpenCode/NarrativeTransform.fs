namespace Wanxiangshu.Mission.Relay.OpenCode

open System
open System.Threading.Tasks
open Fable.Core
open Fable.Core.JsInterop
open Wanxiangshu.Composition.Durable
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Interaction.Authority
open Wanxiangshu.Interaction.Dispatch
open Wanxiangshu.Mission.Relay
open Wanxiangshu.OpenCode
open Wanxiangshu.Participant.Provider.Projection.ProviderProjection
open Wanxiangshu.Persistence.Journal

[<RequireQualifiedAccess>]
type RelayProjectionDisposition =
    | Unchanged
    | CurrentIteration
    | RetiredAttemptStopped

module RelayNarrativeTransform =
    let private relayContext (journal: AgentJournal) (sessionId: SessionId) =
        AgentProjection.tryFind sessionId (AgentJournal.snapshot journal).AgentProjections
        |> Option.bind (fun session ->
            session.Relay
            |> Option.bind (fun relay -> Fold.view relay (RoadId.create (SessionId.value sessionId)))
            |> Option.map (fun road -> road, session.PromptAuthority))

    let private freshRoot (road: RoadView) (projection: PromptAuthority.PromptAuthorityProjection option) =
        projection
        |> Option.bind (fun authority -> authority.ActiveLogicalRun)
        |> Option.map (fun profile -> AuthorityRootUserMessageId.value profile.AuthorityRootUserMessageId)
        |> Option.filter (fun root ->
            road.AuthorityMessageIds
            |> List.exists (fun oldRoot -> PhysicalUserMessageId.value oldRoot = root)
            |> not)

    let retirementOwnsAuthority
        (journal: AgentJournal option)
        (sessionId: SessionId)
        (retirement: RetirementSummary)
        : bool =
        journal
        |> Option.bind (fun durable -> relayContext durable sessionId)
        |> Option.exists (fun (road, projection) ->
            road.LatestRetirement
            |> Option.exists (fun current ->
                current.Id = retirement.Id
                && current.ProjectionCut = retirement.ProjectionCut
                && (freshRoot road projection |> Option.isNone)))

    let private resolve journal sessionId =
        journal
        |> Option.bind (fun durable ->
            sessionId
            |> Option.filter (fun value -> not (String.IsNullOrWhiteSpace value))
            |> Option.bind (fun value ->
                let sid = SessionId.create value

                relayContext durable sid
                |> Option.map (fun (road, projection) -> durable, sid, road, projection)))

    let private messageId message =
        ProviderWireDecode.hostMessageId message

    let private readField (value: obj) (name: string) : obj =
        if isNull value then
            null
        else
            emitJsExpr (value, name) "$0[$1]"

    let private messageRole message =
        readField (readField message "info") "role"
        |> Option.ofObj
        |> Option.orElseWith (fun () -> readField message "role" |> Option.ofObj)
        |> Option.map (fun value -> unbox<string> value)

    let private messageRoleIsUser message =
        messageRole message
        |> Option.exists (fun role -> role.ToLowerInvariant() = "user")

    let private managerLoopGatePhysical (journal: AgentJournal) (sessionId: SessionId) (retirement: RetirementSummary) =
        let gateKind = ManagerLoopGate.gateKind retirement.Id
        let terminalRun = ProviderRunIdentity.create retirement.ProjectionCut.ProviderRunId

        PromptAuthorityProjectionQueries.activeProfile sessionId (AgentJournal.snapshot journal).AgentProjections
        |> Option.bind (fun profile ->
            (PromptDispatcher.forPrompts (PromptJournalAdapter.create journal))
                .GateNudgeAcceptedPhysical
                profile
                PromptAuthority.ContinuationKind.ManagerGuard
                gateKind
                terminalRun)

    let private cutToolIndex (cut: ProjectionCut) messages =
        messages
        |> List.tryFindIndex (fun message ->
            ProviderWireDecode.rawPartsOf message
            |> List.choose ProviderWireDecode.decodePart
            |> List.exists (function
                | WireToolCall(toolCallId, _, _)
                | WireToolResult(toolCallId, _) -> ToolCallId.value toolCallId = cut.ToolCallId
                | _ -> false))

    let private activeRetirement (road: RoadView) =
        road.LatestRetirement |> Option.filter (fun _ -> road.ActiveIncumbency.IsSome)

    let private dispositionAfterProjection (road: RoadView) =
        activeRetirement road
        |> Option.map (fun _ -> RelayProjectionDisposition.CurrentIteration)
        |> Option.defaultValue RelayProjectionDisposition.Unchanged

    let private requestBelongsToSuccessor (physical: string option) afterCut freshRoot acceptedRequest gatePhysical =
        match physical with
        | Some current ->
            freshRoot = Some current
            || gatePhysical = Some current
            || (afterCut && acceptedRequest)
        | _ -> false

    let private isSuccessorRequest
        journal
        sessionId
        (road: RoadView)
        projection
        (retirement: RetirementSummary)
        acceptedRequest
        messages
        =
        let currentUser =
            messages
            |> List.indexed
            |> List.choose (fun (index, message) ->
                if messageRoleIsUser message then
                    messageId message |> Option.map (fun physical -> index, physical)
                else
                    None)
            |> List.tryLast

        let afterCut =
            match cutToolIndex retirement.ProjectionCut messages, currentUser with
            | Some toolIndex, Some(userIndex, _) -> userIndex > toolIndex
            | _ -> false

        let physical = currentUser |> Option.map snd

        let gatePhysical =
            managerLoopGatePhysical journal sessionId retirement
            |> Option.map Wanxiangshu.Foundation.Identity.PhysicalUserMessageId.value

        requestBelongsToSuccessor physical afterCut (freshRoot road projection) acceptedRequest gatePhysical

    let private staleRetirement journal sessionId (road: RoadView) projection acceptedRequest messages =
        road.LatestRetirement
        |> Option.filter (fun retirement ->
            not (isSuccessorRequest journal sessionId road projection retirement acceptedRequest messages))

    let isRetiredRequest
        (journal: AgentJournal option)
        (acceptedRequest: bool)
        (sessionId: string option)
        (outObj: obj)
        : bool =
        resolve journal sessionId
        |> Option.bind (fun (durable, sid, road, projection) ->
            ProviderWireDecode.messagesFromTransformOutput outObj
            |> staleRetirement durable sid road projection acceptedRequest)
        |> Option.isSome

    // The provider view keeps the full physical history after a retirement:
    // the next iteration sees every prior message, the retirement tool call
    // and its own fresh-head prompt. The cut now only decides request
    // identity for stale attempts; it never filters the provider message set.
    let private projectActive (road: RoadView) outObj =
        let messages = ProviderWireDecode.messagesFromTransformOutput outObj

        HostMessageProjection.replaceMessagesInPlace outObj messages
        dispositionAfterProjection road

    let private project
        journal
        (interruptAttempt: SessionId -> RetirementSummary -> Task<unit>)
        sessionId
        road
        projection
        acceptedRequest
        outObj
        =
        task {
            let messages = ProviderWireDecode.messagesFromTransformOutput outObj

            // An active LogicalRun or a claimed loop gate does not identify this
            // physical request: both can coexist with the retired attempt.
            match staleRetirement journal sessionId road projection acceptedRequest messages with
            | Some retirement ->
                do! interruptAttempt sessionId retirement
                HostMessageProjection.replaceMessagesInPlace outObj []
                return RelayProjectionDisposition.RetiredAttemptStopped
            | None -> return projectActive road outObj
        }

    let apply
        (journal: AgentJournal option)
        (acceptedRequest: bool)
        (interruptAttempt: SessionId -> RetirementSummary -> Task<unit>)
        (sessionId: string option)
        (outObj: obj)
        : Task<RelayProjectionDisposition> =
        task {
            match resolve journal sessionId with
            | Some(durable, currentSessionId, road, projection) ->
                return! project durable interruptAttempt currentSessionId road projection acceptedRequest outObj
            | None -> return RelayProjectionDisposition.Unchanged
        }
