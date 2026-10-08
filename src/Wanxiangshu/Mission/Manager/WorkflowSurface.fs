namespace Wanxiangshu.Mission.Manager

open System.Threading.Tasks
open Wanxiangshu.Composition.Durable
open Wanxiangshu.Composition.Turn
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Interaction.Dispatch
open Wanxiangshu.OpenCode
open Wanxiangshu.Persistence.Journal

[<RequireQualifiedAccess>]
module ManagerWorkflowSurface =
    let continueAfterRetiredAttempt
        (port: obj)
        (journal: JournalHandle)
        (session: string)
        (directory: string)
        (stopRetiredAttempt: string -> Task<unit>)
        : Task =
        let sessionId = SessionId.create session

        let retirement =
            AgentProjection.tryFind sessionId (AgentJournal.snapshot journal.Journal).AgentProjections
            |> Option.bind (fun projection -> projection.Relay)
            |> Option.bind (fun relay ->
                Wanxiangshu.Mission.Relay.Fold.view relay (Wanxiangshu.Mission.Relay.RoadId.create session))
            |> Option.bind (fun road -> road.LatestRetirement)
            |> Option.defaultWith (fun () -> invalidOp "Manager retirement unavailable")

        ManagerWorkflow.continueAfterRetiredAttempt
            (DispatchSurface.sessionPort port)
            (DispatchSurface.rootWorkspaceReader (box directory))
            (Some journal.Journal)
            (Some directory)
            (fun sessionId _ continueLoop ->
                task {
                    do! stopRetiredAttempt (SessionId.value sessionId)
                    do! continueLoop ()
                })
            sessionId
            retirement

    let maybeDeliverLoop (port: obj) (journal: JournalHandle) (session: string) (directory: string) : Task =
        ManagerWorkflow.maybeDeliverLoop
            (DispatchSurface.sessionPort port)
            (DispatchSurface.rootWorkspaceReader (box directory))
            (Some journal.Journal)
            (Some directory)
            (fun _ _ continueLoop -> continueLoop ())
            (Some session)

    let observeIdle
        (port: obj)
        (journal: JournalHandle)
        (quiescence: ISessionQuiescenceGate)
        (permit: QuiescencePermit)
        (session: string)
        (physical: string)
        (authorityRoot: string)
        (providerRun: string)
        (directory: string)
        : Task =
        let context =
            { Turn =
                { SessionId = SessionId.create session
                  PhysicalUserMessageId = PhysicalUserMessageId.create physical
                  AuthorityRootUserMessageId = AuthorityRootUserMessageId.create authorityRoot
                  ProviderRun = ProviderRunIdentity.create providerRun
                  Role = Some Role.Manager
                  Directory = Some directory
                  Parts = [||]
                  Finish = Some "stop"
                  ErrorName = None
                  Model = None
                  Outcome = ReconcileProgram.TurnCompleted
                  Observation = None }
              Failure = None
              Quiescence = Some permit
              Delivery = ReconciledTurnDelivery.IdleRevisit }

        ManagerWorkflow.observeIdle
            quiescence
            (DispatchSurface.sessionPort port)
            (DispatchSurface.rootWorkspaceReader (box directory))
            (Some journal.Journal)
            context
