namespace Wanxiangshu.Context.Prefix

open System
open System.Threading.Tasks
open FsToolkit.ErrorHandling
open Wanxiangshu.Context.Companion.Blogger
open Wanxiangshu.Context.Trace
open Wanxiangshu.Foundation
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
    let private requireOk result =
        match result with
        | Ok value -> value
        | Error reason -> raise (InvalidOperationException reason)

    let private readFrameBody (port: PrefixCandidatePort) (frame: BlogFrame) =
        taskResult {
            let! text = port.ReadBlob frame.TextRef

            if port.Hash text = BlobDigest.value frame.Digest then
                return text
            else
                return! Error(sprintf "Companion blob digest mismatch: %s" (BlobDigest.value frame.Digest))
        }

    let private materializeFrozenRecordPrefix (port: PrefixCandidatePort) (state: WireSessionState) frames =
        taskResult {
            let! frameBodies = frames |> TaskResultList.traverseM (readFrameBody port)

            let opening: XTraceOpeningEvidence =
                state.XTrace
                |> Option.bind XTraceProjection.openingEvidence
                |> Option.defaultValue
                    { AssignmentText = ""
                      AuthoritativeRequirements = []
                      ConstitutiveBody = "" }

            return port.Materialize opening frameBodies
        }

    let candidate
        (port: PrefixCandidatePort)
        (window: ProbeBound)
        (sessionId: SessionId)
        (snapshot: ProjectionSnapshot)
        (committed: PrefixSnapshot option)
        (state: WireSessionState)
        (requestCutoff: int)
        : Task<Result<PrefixProbe, NoCandidateReason>> =
        task {
            let prefix = state.PrefixEpoch |> Option.defaultValue PrefixEpochProjection.empty
            let blog = state.Blog |> Option.defaultValue BlogProjection.empty
            let coverableCutoff = blog.Coverage.CoverableTurnCutoffExclusive

            let frames =
                BlogProjection.framesThroughCutoff
                    (PrefixProbeSelection.limit window coverableCutoff requestCutoff)
                    blog

            let materialCutoff =
                frames
                |> List.map (fun frame -> frame.CutoffExclusive)
                |> List.tryLast
                |> Option.defaultValue 0

            if materialCutoff <= 0 then
                return Error NoCandidateReason.NoCoverage
            else
                let! frozenResult = materializeFrozenRecordPrefix port state frames
                let frozenRecordPrefix = requireOk frozenResult
                let! blobResult = port.WriteBlob frozenRecordPrefix
                let blob = requireOk blobResult

                return
                    PrefixProbeSelection.select
                        port.Hash
                        sessionId
                        prefix.EpochId
                        committed
                        window
                        coverableCutoff
                        blog.Coverage.CoveredPrefixDigest
                        materialCutoff
                        requestCutoff
                        blob.BlobRef
                        blob.BlobDigest
                        (ProjectionRenderer.cutoffDigest port.Hash snapshot)
        }
