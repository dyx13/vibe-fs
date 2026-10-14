namespace Wanxiangshu.Context.Prefix

open System.Threading.Tasks
open Wanxiangshu.Context.Companion.Blogger
open Wanxiangshu.Context.Trace
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Participant.Provider.Projection

type WireSessionState =
    { XTrace: XTraceProjectionState option
      Blog: BlogProjectionState option
      PrefixEpoch: ActivePrefixEpoch option
      TodoCheckpoints: PhaseWindow.PhaseCommitWindow }

type WireBlobRecord =
    { BlobRef: BlobRef
      BlobDigest: BlobDigest }

type PrefixCandidatePort =
    { Hash: string -> string
      Materialize: XTraceOpeningEvidence -> string list -> string
      ReadBlob: BlobRef -> Task<Result<string, string>>
      WriteBlob: string -> Task<Result<WireBlobRecord, string>> }

[<RequireQualifiedAccess>]
module PrefixMaterialization =
    val candidate:
        port: PrefixCandidatePort ->
        window: ProbeBound ->
        sessionId: SessionId ->
        snapshot: ProjectionSnapshot ->
        committed: PrefixSnapshot option ->
        state: WireSessionState ->
        requestCutoff: int ->
            Task<Result<PrefixProbe, NoCandidateReason>>
