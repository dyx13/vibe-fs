namespace Wanxiangshu.Mission.Manager

open System.Threading.Tasks
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
        ManagerWorkflow.continueAfterRetiredAttempt
            (DispatchSurface.sessionPort port)
            (DispatchSurface.rootWorkspaceReader (box directory))
            (Some journal.Journal)
            (Some directory)
            (SessionId.value >> stopRetiredAttempt)
            (SessionId.create session)

    let maybeDeliverLoop (port: obj) (journal: JournalHandle) (session: string) (directory: string) : Task =
        ManagerWorkflow.maybeDeliverLoop
            (DispatchSurface.sessionPort port)
            (DispatchSurface.rootWorkspaceReader (box directory))
            (Some journal.Journal)
            (Some directory)
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
