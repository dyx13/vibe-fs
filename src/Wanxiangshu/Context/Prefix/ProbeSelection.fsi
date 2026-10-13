namespace Wanxiangshu.Context.Prefix

open Wanxiangshu.Foundation.Identity

/// context-compression-028/029: why this attempt may fold, and how far.
[<RequireQualifiedAccess>]
type ProbeBound =
    | PhaseBoundary of desiredCutoffExclusive: int
    | CoverageOnly

[<RequireQualifiedAccess>]
module PrefixProbeSelection =
    /// The furthest cutoff an attempt with this window may fold at.
    val limit: window: ProbeBound -> coverableCutoff: int -> requestStartCutoff: int -> int

    val select:
        sha256: (string -> string) ->
        mainSessionId: SessionId ->
        committedEpoch: PrefixEpochId ->
        committedSnapshot: PrefixSnapshot option ->
        window: ProbeBound ->
        coverableCutoff: int ->
        coveredDigest: string ->
        materialCutoff: int ->
        requestStartCutoff: int ->
        frozenRecordPrefixRef: BlobRef ->
        frozenRecordPrefixDigest: BlobDigest ->
        recomputeDigest: (int -> string) ->
            Result<PrefixProbe, NoCandidateReason>

    val describeNoCandidate: reason: NoCandidateReason -> string
