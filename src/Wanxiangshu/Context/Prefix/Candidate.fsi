namespace Wanxiangshu.Context.Prefix

open Wanxiangshu.Foundation.Identity

[<RequireQualifiedAccess>]
type NoCandidateReason =
    | NoCoverage
    | WouldRetreat of committed: int * proposed: int
    | NotNewerThanCommitted
    | CutoffProofFailed of expected: string * recomputed: string
    | BeyondPhaseBoundary of desired: int * material: int
    | MaterialBeyondBoundary of material: int * bound: int

type PrefixSnapshot =
    { FrozenRecordPrefixRef: BlobRef
      FrozenRecordPrefixDigest: BlobDigest
      CutoffExclusive: int
      CoveredPrefixDigest: string
      SealRoot: string
      SyntheticMessageId: string }

[<RequireQualifiedAccess>]
module PrefixSnapshot =
    val sameIdentity: a: PrefixSnapshot -> b: PrefixSnapshot -> bool

type PrefixProbe =
    { ProbeId: string
      BasedOnEpochId: PrefixEpochId
      Candidate: PrefixSnapshot }

[<RequireQualifiedAccess>]
type XProjectionChoice =
    | UseCommittedEpoch
    | UsePrefixProbe of PrefixProbe
