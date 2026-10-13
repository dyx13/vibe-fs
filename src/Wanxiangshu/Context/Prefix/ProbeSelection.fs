namespace Wanxiangshu.Context.Prefix

open Wanxiangshu.Context.Companion
open Wanxiangshu.Foundation.Identity

/// context-compression-028/029: why this attempt is allowed to fold at all, and how
/// far it may fold.
///
/// A DU rather than an `int option`, because "no phase has committed" and "failure
/// recovery is not bounded by the window" must not be the same value: the first must
/// not probe, the second may go to the proven coverage (WHAT-029's explicit
/// exception, which the caller records as a Probe cold boundary).
[<RequireQualifiedAccess>]
type ProbeBound =
    /// The phase window spoke: fold no further than its boundary.
    | PhaseBoundary of desiredCutoffExclusive: int
    /// Failure recovery: proven coverage is the only bound.
    | CoverageOnly

/// CTX-011 candidate selection: build the probe for one armed slot, or say why not.
///
/// Pure. `sha256` is a parameter (verification-system-001 Pure laws), and the FrozenRecordPrefix body is already
/// materialised by the caller — reading a blob is a Host concern (PERSIST-007), and
/// this module must stay callable from a layer-1 test.
[<RequireQualifiedAccess>]
module PrefixProbeSelection =

    /// The furthest cutoff this attempt may fold at: the window's desire when the
    /// window spoke, the proven coverage when it did not, and never past the request
    /// being answered — the newest message the request carries, which in an agent
    /// loop is its own assistant/tool history, not the user message that opened the
    /// loop.
    let limit (window: ProbeBound) (coverableCutoff: int) (requestStartCutoff: int) =
        let coverageBounded =
            match window with
            | ProbeBound.PhaseBoundary desired -> min desired coverableCutoff
            | ProbeBound.CoverageOnly -> coverableCutoff

        min coverageBounded requestStartCutoff

    /// Validate the material the caller actually froze against that bound, the
    /// committed epoch, and the absence of retreat.
    let private validateMaterial
        (window: ProbeBound)
        (coverableCutoff: int)
        (requestStartCutoff: int)
        (materialCutoff: int)
        (committedSnapshot: PrefixSnapshot option)
        : Result<int * int, NoCandidateReason> =
        let committedCutoff =
            committedSnapshot
            |> Option.map (fun snapshot -> snapshot.CutoffExclusive)
            |> Option.defaultValue 0

        let limit = limit window coverableCutoff requestStartCutoff

        // Flattened on purpose: the F# control-pyramid gate forbids a match inside an
        // arm, and the evidence side reads better as one named decision.
        let withinBound () =
            if coverableCutoff <= 0 || materialCutoff <= 0 then
                Error NoCandidateReason.NoCoverage
            elif materialCutoff > limit then
                // The frozen subset ends past what this attempt may replace: mid-turn
                // material, or a message the request is still answering.
                Error(NoCandidateReason.MaterialBeyondBoundary(materialCutoff, limit))
            elif materialCutoff < committedCutoff then
                Error(NoCandidateReason.WouldRetreat(committedCutoff, materialCutoff))
            else
                Ok(materialCutoff, committedCutoff)

        match window with
        | ProbeBound.PhaseBoundary desired when materialCutoff > desired ->
            Error(NoCandidateReason.BeyondPhaseBoundary(desired, materialCutoff))
        | ProbeBound.PhaseBoundary _
        | ProbeBound.CoverageOnly -> withinBound ()

    let private finishCandidate
        (sha256: string -> string)
        (mainSessionId: SessionId)
        (committedEpoch: PrefixEpochId)
        (coveredDigest: string)
        (frozenRecordPrefixRef: BlobRef)
        (frozenRecordPrefixDigest: BlobDigest)
        (committedSnapshot: PrefixSnapshot option)
        (candidateCutoff: int)
        : Result<PrefixProbe, NoCandidateReason> =
        let sealRoot =
            CompanionIdentity.sealRoot
                sha256
                mainSessionId
                committedEpoch
                candidateCutoff
                coveredDigest
                frozenRecordPrefixDigest

        let candidate =
            { FrozenRecordPrefixRef = frozenRecordPrefixRef
              FrozenRecordPrefixDigest = frozenRecordPrefixDigest
              CutoffExclusive = candidateCutoff
              CoveredPrefixDigest = coveredDigest
              SealRoot = sealRoot
              SyntheticMessageId = CompanionIdentity.companionMemoryMessageId sha256 sealRoot }

        match committedSnapshot with
        | Some existing when PrefixSnapshot.sameIdentity candidate existing ->
            Error NoCandidateReason.NotNewerThanCommitted
        | _ ->
            Ok
                { ProbeId = sha256 (sealRoot + "|probe")
                  BasedOnEpochId = committedEpoch
                  Candidate = candidate }

    let private proveCandidate
        (sha256: string -> string)
        (mainSessionId: SessionId)
        (committedEpoch: PrefixEpochId)
        (coveredDigest: string)
        (frozenRecordPrefixRef: BlobRef)
        (frozenRecordPrefixDigest: BlobDigest)
        (committedSnapshot: PrefixSnapshot option)
        (recomputeDigest: int -> string)
        (coverableCutoff: int)
        (candidateCutoff: int)
        : Result<PrefixProbe, NoCandidateReason> =
        // The Companion's claim is proven at ITS cutoff: that is the boundary it
        // recorded a digest for, and it is what makes a Host compaction or any other
        // renumbering fail closed. A candidate below it is then inside a proven,
        // continuous prefix — which is exactly what context-compression-029 allows to
        // fold, provided the frozen material ends at that boundary.
        let recomputedFrontier = recomputeDigest coverableCutoff

        if recomputedFrontier <> coveredDigest then
            Error(NoCandidateReason.CutoffProofFailed(coveredDigest, recomputedFrontier))
        else
            finishCandidate
                sha256
                mainSessionId
                committedEpoch
                // The snapshot records the digest of the prefix it actually replaces.
                (recomputeDigest candidateCutoff)
                frozenRecordPrefixRef
                frozenRecordPrefixDigest
                committedSnapshot
                candidateCutoff

    /// CTX-011, steps 1 through 9.
    ///
    /// `committedEpoch` / `committedSnapshot` are the two fields of the Journal's
    /// `ActivePrefixEpoch`, passed separately rather than as a Domain copy of that
    /// record. Domain cannot reference Journal, and a shadow type for one concept is
    /// exactly the duplication `PrefixSnapshot` was moved here to avoid: two records
    /// meaning "the committed prefix" could drift, and the fold would validate against
    /// one while the selector built from the other.
    ///
    /// `coverableCutoff` / `coveredDigest` come from the Companion's coverage.
    /// `windowDesire` is the phase window's boundary when one spoke; `None` means the
    /// attempt is failure recovery, where coverage is the only bound (WHAT-029).
    /// `materialCutoff` is the boundary the frozen subset the caller passes actually
    /// covers — the last frame's own claim, or 0 for no material.
    /// `requestStartCutoff` is how many turns precede the newest message this request
    /// answers — the candidate may not swallow that message. One user message can
    /// drive many provider steps, so the trailing user message is NOT the bound: it
    /// stays at the turn that opened the loop for the whole of it.
    /// `recomputeDigest` hashes X's CURRENT provider-visible prefix at a given cutoff;
    /// it is a function rather than a value because the proof hashes the Companion's
    /// frontier while the snapshot records the digest of the materialized boundary.
    ///
    /// The proof in step 5 is the load-bearing check. Everything else compares numbers
    /// the plugin itself recorded; this one compares the Companion's claim against X's
    /// actual current prefix, and it is what makes a Host compaction or any other
    /// renumbering fail closed instead of producing a FrozenRecordPrefix that describes turns the
    /// prefix no longer has.
    let select
        (sha256: string -> string)
        (mainSessionId: SessionId)
        (committedEpoch: PrefixEpochId)
        (committedSnapshot: PrefixSnapshot option)
        (window: ProbeBound)
        (coverableCutoff: int)
        (coveredDigest: string)
        (materialCutoff: int)
        (requestStartCutoff: int)
        (frozenRecordPrefixRef: BlobRef)
        (frozenRecordPrefixDigest: BlobDigest)
        (recomputeDigest: int -> string)
        : Result<PrefixProbe, NoCandidateReason> =
        // Step 1. The frozen material may claim no more than the window, the coverage
        // and this request allow.
        validateMaterial window coverableCutoff requestStartCutoff materialCutoff committedSnapshot
        |> Result.bind (fun (candidateCutoff, _) ->
            // Step 5, before the identity comparison. The digest must be proven
            // against X's current prefix even when the candidate turns out to be
            // identical to what is committed: a matching identity computed from a
            // stale numbering is not evidence of anything.
            proveCandidate
                sha256
                mainSessionId
                committedEpoch
                coveredDigest
                frozenRecordPrefixRef
                frozenRecordPrefixDigest
                committedSnapshot
                recomputeDigest
                coverableCutoff
                candidateCutoff)

    let describeNoCandidate (reason: NoCandidateReason) =
        match reason with
        | NoCandidateReason.NoCoverage -> "no completed turn has been blogged yet"
        | NoCandidateReason.WouldRetreat(committed, proposed) ->
            sprintf "candidate cutoff %d is behind the committed %d (CTX-011)" proposed committed
        | NoCandidateReason.NotNewerThanCommitted -> "candidate is identical to the committed prefix (CTX-011)"
        | NoCandidateReason.CutoffProofFailed(expected, recomputed) ->
            sprintf
                "cutoff proof failed: Companion recorded %s but X's current prefix hashes to %s (COMPANION-011)"
                expected
                recomputed
        | NoCandidateReason.BeyondPhaseBoundary(desired, material) ->
            sprintf "material cutoff %d folds turns the window keeps raw below %d (CTX-028)" material desired
        | NoCandidateReason.MaterialBeyondBoundary(material, limit) ->
            sprintf "material cutoff %d reaches past the covered boundary %d (CTX-029)" material limit
