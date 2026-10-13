namespace Wanxiangshu.Execution.Delegation

open System.Threading.Tasks
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Context.Trace
open Wanxiangshu.Persistence.Journal.JournalOutcome

type DelegationHandoffWindow = { Range: XTraceRange; IsInitial: bool }

type DelegationWorkRecordCapability =
    { ParentWorkRecord: SessionId -> Task<string option>
      ParentWorkRecordBounded: SessionId -> XTraceRange -> Task<string option> }

type PreparedDelegationHandoff =
    { Route: DelegationHandoffRoute
      ParentStartInclusive: XTraceCursor
      ParentRecord: string option
      ParentEndExclusive: XTraceCursor }

/// delegation-031: the checkpoint that closes one reusable completion settles to a
/// closed outcome, never a bare Result<unit, string>. "Child finished" (the
/// caller's invocation already resolved its WorkRecord or proven completion)
/// and "completion evidence durably written" (this frontier fact committed)
/// are distinct durable facts: a NotCommitted or Unknown outcome must NEVER
/// be read back as "the child never finished" and must NEVER re-execute an
/// already-completed child. Unknown stays pending-evidence — never retried,
/// never re-emitted — until the next invocation re-reads durable truth.
type HandoffCheckpointIdentity =
    { Parent: SessionId
      Route: DelegationHandoffRoute }

[<RequireQualifiedAccess>]
type HandoffCheckpointCommitment =
    | Committed
    | NotCommitted of reason: string
    | Unknown of reason: string
    | PhaseConflict of reason: string
    | PersistenceFailed of JournalAppendFailure

type HandoffCheckpointSettlement =
    { Identity: HandoffCheckpointIdentity
      Commitment: HandoffCheckpointCommitment }

[<RequireQualifiedAccess>]
module HandoffCheckpointSettlement =

    let committed (parent: SessionId) (handoff: PreparedDelegationHandoff) : HandoffCheckpointSettlement =
        { Identity =
            { Parent = parent
              Route = handoff.Route }
          Commitment = HandoffCheckpointCommitment.Committed }

    let notCommitted
        (parent: SessionId)
        (handoff: PreparedDelegationHandoff)
        (reason: string)
        : HandoffCheckpointSettlement =
        { Identity =
            { Parent = parent
              Route = handoff.Route }
          Commitment = HandoffCheckpointCommitment.NotCommitted reason }

    let unknown
        (parent: SessionId)
        (handoff: PreparedDelegationHandoff)
        (reason: string)
        : HandoffCheckpointSettlement =
        { Identity =
            { Parent = parent
              Route = handoff.Route }
          Commitment = HandoffCheckpointCommitment.Unknown reason }

    let phaseConflict
        (parent: SessionId)
        (handoff: PreparedDelegationHandoff)
        (reason: string)
        : HandoffCheckpointSettlement =
        { Identity =
            { Parent = parent
              Route = handoff.Route }
          Commitment = HandoffCheckpointCommitment.PhaseConflict reason }

    let persistenceFailed parent (handoff: PreparedDelegationHandoff) failure : HandoffCheckpointSettlement =
        { Identity =
            { Parent = parent
              Route = handoff.Route }
          Commitment = HandoffCheckpointCommitment.PersistenceFailed failure }

type ReusableHandoffPort =
    { Prepare: SessionId -> DelegationHandoffRoute -> Task<PreparedDelegationHandoff>
      CheckpointCompleted: SessionId -> PreparedDelegationHandoff -> Task<HandoffCheckpointSettlement> }

[<RequireQualifiedAccess>]
module DelegationHandoff =

    let key (parent: SessionId) (route: DelegationHandoffRoute) =
        SessionId.value parent + "\x1f" + DelegationHandoffRoute.value route

    let window (previousEnd: XTraceCursor option) (currentEnd: XTraceCursor) : DelegationHandoffWindow =
        let start = previousEnd |> Option.defaultValue (XTraceCursor.create 0L)

        if XTraceCursor.isAfter start currentEnd then
            invalidArg "currentEnd" "delegation handoff cursor cannot retreat"

        { Range = XTraceRange.create start currentEnd
          IsInitial = previousEnd.IsNone }

    let childRange (startInclusive: XTraceCursor) (endExclusive: XTraceCursor) : XTraceRange =
        if XTraceCursor.isAfter startInclusive endExclusive then
            invalidArg "endExclusive" "delegation child range cannot retreat"

        XTraceRange.create startInclusive endExclusive

    /// Append the parent delta to an already-built provider prompt, riding the
    /// fork-child convention (delegation-019): the localized CommissionerRecord
    /// prose header names the field on the instruction plane, the parent LWR
    /// itself is a TOML data field (`commissioner_record`). Never dumped as
    /// bare prose. Child → parent join is the opposite plane — do not conflate.
    /// Warm-start and other typed provider documents keep their own
    /// instruction/data structure.
    let appendParentDelta
        (commissionerRecordProse: string)
        (providerPrompt: LlmFacing.Document)
        (parentRecord: string option)
        =
        match
            parentRecord
            |> Option.map (fun record -> record.Trim())
            |> Option.filter (System.String.IsNullOrWhiteSpace >> not)
        with
        | None -> providerPrompt
        | Some record ->
            providerPrompt
            |> LlmFacing.withInstruction commissionerRecordProse
            |> LlmFacing.withData [ LlmFacing.Data.stringField "commissioner_record" record ]
