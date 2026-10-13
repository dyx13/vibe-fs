namespace Wanxiangshu.Execution.Session.Attachment

open System
open System.Threading.Tasks
open Wanxiangshu.Execution.Delegation.SyncDelegate
open Wanxiangshu.Execution.Session
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity

/// The SyncDelegate kind's observation of its owner's children. The kind decides
/// exactness and ambiguity; the core only ever sees a decided list.
type ObserveAttachedChild =
    SessionId -> ReuseScopeId -> SyncDelegateRole -> string -> Task<Result<AttachedChildObservation, string>>

/// The SyncDelegate kind's child factory, in this kind's own vocabulary.
type CreateAttachedChild =
    SessionId -> ReuseScopeId -> SyncDelegateRole -> string -> string option -> Task<Result<SessionId, string>>

/// EXEC-026 / HOST-008: the SyncDelegate kind's adapter onto the ONE attachment
/// mechanism (`AttachmentLeaseCore` + `AttachmentLeaseRegistry`). It supplies only
/// this kind's parameters — the exact agent+title child observation, the child
/// factory, the publish hooks and its key axis — and owns no lifecycle of its own:
/// creation, recovery, replacement, single-flight and binding all happen in the core.
///
/// Key axis. `(OwnerReuseScopeId, SyncDelegateRole)` remains the lookup the port
/// exposes. `ReuseScope.ofSession` is the identity wrap of a SessionId value, so a
/// scope id and its owner share one value and the registry's owner axis carries the
/// scope. The role axis is carried by the kind: `SyncDelegateRole.toAttachmentKind`
/// is the codebase's declared SyncDelegate attachment identity (the durable
/// association surface uses the same mapping), and each role has its own kind —
/// `SyncCoder`, `SyncInspector`, `SyncEngineer` — so one scope's roles never share a
/// binding.
type AttachedSessionRuntime
    (?registry: AttachmentLeaseRegistry, ?registerParent: SessionId -> SessionId -> unit, ?isUsable: SessionId -> bool)
    =
    let leases = defaultArg registry (AttachmentLeaseRegistry())
    let register = defaultArg registerParent (fun _ _ -> ())
    let usable = defaultArg isUsable (fun _ -> true)
    let kindOf (role: SyncDelegateRole) = SyncDelegateRole.toAttachmentKind role

    /// Sync's exactness (agent AND title) is applied by this kind's own observation
    /// before the core sees anything, so the projection into the core's `Child`
    /// vocabulary carries this deterministic marker as its title and the `Spec` uses
    /// the same value. The core's second check therefore agrees by construction
    /// instead of re-reading a Host title the observation already compared.
    let observedTitleMarker = ""

    /// The kinds this port owns, so a clear never touches another kind's bindings in
    /// a shared registry.
    let ownKinds =
        [ AttachmentKind.SyncInspector
          AttachmentKind.SyncCoder
          AttachmentKind.SyncEngineer
          AttachmentKind.SyncDevOps ]

    let leaseValue (lease: AttachmentLeaseCore.Lease) =
        let child = SessionId.create lease.SessionId

        if usable child then Some(child, lease.Agent) else None

    let bound (owner: SessionId, role: SyncDelegateRole) =
        leases.TryFind(owner, kindOf role) |> Option.bind leaseValue

    /// This kind's decision, expressed as the core's restore hint. An exact unique
    /// match is the linked child; no match is no link; an ambiguous observation is
    /// this kind's refusal, naming every candidate.
    let decideHint (observed: Result<AttachedChildObservation, string>) : Result<string option, string> =
        match observed with
        | Error error -> Error error
        | Ok(AttachedChildObservation.Matching childId) -> Ok(Some(SessionId.value childId))
        | Ok AttachedChildObservation.Missing -> Ok None
        | Ok(AttachedChildObservation.Conflicting children) ->
            Error(
                sprintf
                    "sync delegate child observation conflicted: %s"
                    (children |> List.map SessionId.value |> String.concat ", ")
            )

    /// The single-flight cell is cleared whatever the establish does, so a failed
    /// ensure never becomes a poisoned flight.
    let ensureAndClearFlight
        (owner: SessionId)
        (kind: AttachmentKind)
        (work: unit -> Task<Result<AttachmentLeaseCore.Lease, string>>)
        =
        task {
            try
                return! work ()
            finally
                leases.FinishEnsure(owner, kind)
        }

    /// The kind's ports for one establish attempt. `owner` is the real owner, so the
    /// Host-facing operations act on it while the registry keys by scope value.
    let operations
        (owner: SessionId)
        (scope: ReuseScopeId)
        (role: SyncDelegateRole)
        (agentName: string)
        (matched: SessionId option)
        (createChild: CreateAttachedChild)
        (bindChild: SessionId -> SessionId -> string -> unit)
        (onReady: SessionId -> string -> unit)
        : AttachmentLeaseCore.Operations =
        { ListChildren =
            fun _ ->
                // The kind's decision, projected into the core's child vocabulary.
                // A conflicting observation never reaches here: `ensure` refused it
                // before building the operations.
                Task.FromResult(
                    Ok(
                        matched
                        |> Option.map (fun childId ->
                            [ { AttachmentLeaseCore.Child.SessionId = SessionId.value childId
                                AttachmentLeaseCore.Child.Agent = Some agentName
                                AttachmentLeaseCore.Child.Title = Some observedTitleMarker } ])
                        |> Option.defaultValue []
                    )
                )
          CreateChild =
            fun _ _ directory ->
                task {
                    match! createChild owner scope role agentName directory with
                    | Ok child -> return Ok(SessionId.value child)
                    | Error error -> return Error error
                }
          /// Sync's link is infallible (unit publish hooks only), so the core never
          /// reaches a fresh-lease abort here; a dedicated child is only ended at
          /// its scope close (managed-session-lifecycle [004]/[014]).
          AbortChild = fun _ -> Task.FromResult(Ok())
          Link =
            fun _ child agent ->
                let childId = SessionId.create child
                register owner childId
                bindChild owner childId agent
                onReady childId agent
                Task.FromResult(Ok())
          /// Sync keeps no durable link to close: the association is the in-memory
          /// binding, and the registry drop is what releases it.
          Close = fun _ -> Task.FromResult(Ok()) }

    let ensure
        (owner: SessionId)
        (scope: ReuseScopeId)
        (role: SyncDelegateRole)
        (agentName: string)
        (directory: string option)
        (observeChild: ObserveAttachedChild)
        (createChild: CreateAttachedChild)
        (bindChild: SessionId -> SessionId -> string -> unit)
        (onReady: SessionId -> string -> unit)
        : Task<Result<SessionId * string, string>> =
        let kind = kindOf role

        let start () =
            task {
                // The kind's observation IS its durable association: an exact unique
                // match is the linked child (Reused), no match creates a fresh one.
                // Handing the match to the core as its restore hint is what preserves
                // Sync's adopt rule now that the core, like every other kind, refuses
                // to adopt an unassociated child (managed-session-lifecycle [003]).
                let! observed = observeChild owner scope role agentName

                match decideHint observed with
                | Error error -> return Error error
                | Ok hint ->
                    let spec: AttachmentLeaseCore.Spec =
                        { Kind = kind
                          Agent = agentName
                          Title = observedTitleMarker
                          Directory = directory
                          RestoreHint = hint }

                    return!
                        ensureAndClearFlight owner kind (fun () ->
                            AttachmentLeaseCore.ensure
                                (operations
                                    owner
                                    scope
                                    role
                                    agentName
                                    (hint |> Option.map SessionId.create)
                                    createChild
                                    bindChild
                                    onReady)
                                owner
                                spec)
            }

        task {
            match! leases.Ensure(owner, kind, start) with
            | Error error -> return Error error
            | Ok lease ->
                leases.Bind(owner, kind, lease)
                return Ok(SessionId.create lease.SessionId, lease.Agent)
        }

    /// Reuse an existing compatible binding, or create a Work child and bind it.
    /// `createChild ownerSessionId agentName directory` must CreateChildSession as a
    /// Work child with `Agent = Some agentName` (not a SatelliteKind leaf).
    ///
    /// On reuse the returned agent is the one stored at create time. A later
    /// lookup must not overwrite the existing child agent.
    member _.GetOrCreate
        (
            ownerSessionId: SessionId,
            role: SyncDelegateRole,
            agentName: string,
            directory: string option,
            observeChild: ObserveAttachedChild,
            createChild: CreateAttachedChild,
            bindChild: SessionId -> SessionId -> string -> unit,
            onReady: SessionId -> string -> unit
        ) : Task<Result<SessionId * string, string>> =
        match bound (ownerSessionId, role) with
        | Some pair -> Task.FromResult(Ok pair)
        | None ->
            ensure
                ownerSessionId
                (ReuseScope.ofSession ownerSessionId)
                role
                agentName
                directory
                observeChild
                createChild
                bindChild
                onReady

    member _.TryFind(ownerSessionId: SessionId, role: SyncDelegateRole) : SessionId option =
        bound (ownerSessionId, role) |> Option.map fst

    /// The scope axis of this port. `ReuseScope.ofSession` is an identity wrap of the
    /// owner value, so the scope lookup is the owner lookup; two different scopes are
    /// two different owners and stay isolated.
    member _.TryFindByScope(scope: ReuseScopeId, role: SyncDelegateRole) : SessionId option =
        bound (SessionId.create (ReuseScopeId.value scope), role) |> Option.map fst

    member _.TryFindOwner(delegateSessionId: SessionId, role: SyncDelegateRole) : SessionId option =
        let kind = kindOf role

        leases.TryFindByChild(delegateSessionId)
        |> List.tryPick (fun (owner, boundKind) -> if boundKind = kind then Some owner else None)

    member _.Remove(ownerSessionId: SessionId, role: SyncDelegateRole) : bool =
        leases.Remove(ownerSessionId, kindOf role)

    member _.RemoveByDelegateSession(delegateSessionId: SessionId) : bool =
        match leases.RemoveByChild(delegateSessionId) with
        | [] -> false
        | _ -> true

    member _.Clear() =
        // Only this port's kinds: a shared registry still holds every other kind's
        // bindings after the Sync runtime is disposed.
        leases.Snapshot()
        |> List.filter (fun (_, kind) -> ownKinds |> List.contains kind)
        |> List.iter (fun (owner, kind) -> leases.Remove(owner, kind) |> ignore)

    interface IAttachedSessionPort with
        member this.TryFind(ownerSessionId, role) = this.TryFind(ownerSessionId, role)
        member this.TryFindByScope(scope, role) = this.TryFindByScope(scope, role)

        member this.TryFindOwner(delegateSessionId, role) =
            this.TryFindOwner(delegateSessionId, role)

        member this.Remove(ownerSessionId, role) = this.Remove(ownerSessionId, role)

        member this.RemoveByDelegateSession(delegateSessionId) =
            this.RemoveByDelegateSession(delegateSessionId)

        member this.GetOrCreate
            (ownerSessionId, role, agentName, directory, observeChild, createChild, bindChild, onReady)
            =
            this.GetOrCreate(ownerSessionId, role, agentName, directory, observeChild, createChild, bindChild, onReady)

        member this.Clear() = this.Clear()
