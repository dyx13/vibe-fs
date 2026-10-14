namespace Wanxiangshu.Composition.Turn

open Wanxiangshu.Execution.Failure
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.OpenCode
open Wanxiangshu.Participant.Provider

type ReconciledTurn =
    { SessionId: SessionId
      PhysicalUserMessageId: PhysicalUserMessageId
      AuthorityRootUserMessageId: AuthorityRootUserMessageId
      ProviderRun: ProviderRunIdentity
      Role: Role option
      Directory: string option
      Parts: MessagePart array
      Finish: string option
      ErrorName: string option
      Model: OpencodeModel option
      Outcome: ReconcileProgram.TurnOutcome
      Observation: ReconcileProgram.SnapshotObservation option }

[<RequireQualifiedAccess>]
type ReconciledTurnDelivery =
    | Observation
    | IdleRevisit

type ReconciledTurnContext =
    { Turn: ReconciledTurn
      Failure: ExecutionFailure option
      Quiescence: QuiescencePermit option
      Delivery: ReconciledTurnDelivery }

type ActiveRunBinding =
    { SessionId: SessionId
      RunId: string option
      AuthorityRootUserMessageId: AuthorityRootUserMessageId option
      PhysicalUserMessageId: PhysicalUserMessageId option
      ContinuationMessageIds: Set<string>
      Role: Role option
      Directory: string option }
