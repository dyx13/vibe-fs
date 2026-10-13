namespace Wanxiangshu.Change

open System
open System.Threading.Tasks
open FsToolkit.ErrorHandling
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Host
open Wanxiangshu.Mission.Relay

/// One manager session owns one stable worktree. Human quality decisions come only from
/// Relay incumbencies; Change owns deterministic Git admission, rebase and CAS.
module OrchestratorProgram =

    type private PublishAttempt =
        | TargetMoved
        | Landed of CommitHash

    type private PublicationEvidence =
        { ManagerJobId: ManagerJobId
          TargetRef: TargetRef
          ExpectedHead: CommitHash
          CandidateCommit: CommitHash
          QualityCertificateId: QualityCertificateId
          AuthorityRevision: AuthorityRevision
          WorkspaceSnapshotId: WorkspaceSnapshotId }

    let private buildPublicationEvidence
        (job: PublicationJob)
        (rebasedReady:
            {| RebasedCommit: CommitHash
               TargetHeadSnapshot: CommitHash
               WorkspaceSnapshotId: WorkspaceSnapshotId |})
        (certificate: QualityCertificate)
        : PublicationEvidence =
        { ManagerJobId = job.JobId
          TargetRef = job.TargetRef
          ExpectedHead = rebasedReady.TargetHeadSnapshot
          CandidateCommit = rebasedReady.RebasedCommit
          QualityCertificateId = certificate.Id
          AuthorityRevision = certificate.AuthorityRevision
          WorkspaceSnapshotId = rebasedReady.WorkspaceSnapshotId }

    let private buildClaimPublicationEvidence
        (job: PublicationJob)
        (claim:
            {| TargetRef: TargetRef
               RebasedCommit: CommitHash
               ExpectedHead: CommitHash
               WorkspaceSnapshotId: WorkspaceSnapshotId
               QualityCertificateId: QualityCertificateId
               AuthorityRevision: AuthorityRevision |})
        : PublicationEvidence =
        { ManagerJobId = job.JobId
          TargetRef = claim.TargetRef
          ExpectedHead = claim.ExpectedHead
          CandidateCommit = claim.RebasedCommit
          QualityCertificateId = claim.QualityCertificateId
          AuthorityRevision = claim.AuthorityRevision
          WorkspaceSnapshotId = claim.WorkspaceSnapshotId }

    let private failed (job: PublicationJob) details =
        OrchestratorVerdict.IntegrationFailed(job.JobId, details)

    let private mapTask (mapper: 'a -> 'b) (operation: Task<'a>) : Task<'b> =
        task {
            let! value = operation
            return mapper value
        }

    let private mapTaskError mapper operation =
        mapTask (Result.mapError mapper) operation

    let private continueResult binder operation =
        task {
            let! outcome = operation

            match outcome with
            | Ok value -> return! binder value
            | Error verdict -> return verdict
        }

    let private continueUnit binder operation =
        continueResult (fun () -> binder ()) operation

    let private append (deps: OrchestratorProgramDeps) (job: PublicationJob) fact =
        taskResult { do! deps.AppendFact fact |> mapTaskError (failed job) }

    let private readHead (deps: OrchestratorProgramDeps) (job: PublicationJob) =
        deps.Git.ReadHead job.WorktreePath
        |> mapTaskError (fun error -> failed job (sprintf "Git head lookup failed: %s" error))

    let private targetHead (deps: OrchestratorProgramDeps) (job: PublicationJob) =
        deps.Git.GetTargetHead job.TargetRef
        |> mapTaskError (fun error -> failed job (sprintf "Git target head lookup failed: %s" error))

    let private invalidate (deps: OrchestratorProgramDeps) (job: PublicationJob) reason =
        deps.Relay.InvalidateCertificate job.JobId reason
        |> mapTaskError (fun error -> failed job (sprintf "Certificate invalidation failed: %s" error))

    let private continueLoop (deps: OrchestratorProgramDeps) (job: PublicationJob) =
        deps.Relay.ContinueLoop job.JobId
        |> mapTaskError (fun error -> failed job (sprintf "Manager loop continuation failed: %s" error))

    let private captureSnapshotResult (deps: OrchestratorProgramDeps) (job: PublicationJob) details =
        deps.Relay.CaptureSnapshot job.JobId
        |> mapTaskError (fun error -> failed job (sprintf "%s: %s" details error))

    let private conflictedFilesResult (deps: OrchestratorProgramDeps) (job: PublicationJob) =
        deps.Git.ConflictedFiles job.WorktreePath
        |> mapTaskError (fun error -> failed job (sprintf "Conflict-file lookup failed: %s" error))

    let private prepareCandidateResult (deps: OrchestratorProgramDeps) (job: PublicationJob) =
        deps.Relay.PrepareCandidate job.JobId
        |> mapTaskError (fun error -> failed job (sprintf "Candidate admission failed: %s" error))

    let private recordCandidate
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (candidate: CommitHash)
        (certificate: QualityCertificate)
        =
        append
            deps
            job
            (OrchestratorFactCases.CandidateReady
                {| ManagerJobId = job.JobId
                   CandidateCommit = candidate
                   WorkspaceSnapshotId = certificate.SnapshotId
                   QualityCertificateId = certificate.Id |})

    let private recordRebased
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (target: CommitHash)
        (snapshot: WorkspaceSnapshotId)
        =
        taskResult {
            let! rebased = readHead deps job

            do!
                append
                    deps
                    job
                    (OrchestratorFactCases.RebasedCandidateReady
                        {| ManagerJobId = job.JobId
                           RebasedCommit = rebased
                           TargetHeadSnapshot = target
                           WorkspaceSnapshotId = snapshot |})

            return rebased
        }

    let private recordConflict
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (candidate: CommitHash)
        (target: CommitHash)
        (snapshot: WorkspaceSnapshotId)
        (files: string list)
        =
        append
            deps
            job
            (OrchestratorFactCases.ConflictDetected
                {| ManagerJobId = job.JobId
                   CandidateCommit = candidate
                   TargetHeadSnapshot = target
                   WorkspaceSnapshotId = snapshot
                   ConflictFiles = files
                   DiagnosticsDigest = HostDigest.sha256Hex (String.Join("\n", files)) |})

    let private publicationIdentityVerdict
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (current: CommitHash)
        : Result<unit, OrchestratorVerdict> =
        if evidence.ManagerJobId <> job.JobId then
            Error(failed job "Publication evidence job mismatch; refusing publish")
        elif evidence.TargetRef <> job.TargetRef then
            Error(failed job "Publication evidence target mismatch; refusing publish")
        elif current <> evidence.ExpectedHead then
            Error(failed job "Publish CAS head does not match publication evidence; refusing publish")
        else
            Ok()

    let private gateSnapshotVerdict
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (snapshot: WorkspaceSnapshotId)
        : Result<unit, OrchestratorVerdict> =
        if snapshot <> evidence.WorkspaceSnapshotId then
            Error(failed job "Workspace snapshot changed inside publish gate; refusing publish")
        else
            Ok()

    let private worktreePinVerdict
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (worktreeHead: CommitHash)
        : Result<unit, OrchestratorVerdict> =
        if worktreeHead <> evidence.CandidateCommit then
            Error(
                failed
                    job
                    (sprintf
                        "Worktree HEAD %s does not match candidate commit %s"
                        (CommitHash.value worktreeHead)
                        (CommitHash.value evidence.CandidateCommit))
            )
        else
            Ok()

    let private prePublishConflictsVerdict
        (job: PublicationJob)
        (conflicts: string list)
        : Result<unit, OrchestratorVerdict> =
        if List.isEmpty conflicts then
            Ok()
        else
            Error(failed job (sprintf "Worktree has unmerged conflicts before publish: %A" conflicts))

    let private ffMergeVerdict
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (merge: Result<CommitHash, string>)
        : Result<CommitHash option, OrchestratorVerdict> =
        match merge with
        | Error error when error = OrchestratorConstants.targetRefMovedError -> Ok None
        | Error error -> Error(failed job (sprintf "FF merge failed: %s" error))
        | Ok landed when landed <> evidence.CandidateCommit ->
            Error(
                failed
                    job
                    (sprintf
                        "FF merge landed %s which does not match pinned candidate %s"
                        (CommitHash.value landed)
                        (CommitHash.value evidence.CandidateCommit))
            )
        | Ok landed -> Ok(Some landed)

    let private appendPublishClaimed
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        =
        append
            deps
            job
            (OrchestratorFactCases.PublishClaimed
                {| ManagerJobId = evidence.ManagerJobId
                   TargetRef = evidence.TargetRef
                   RebasedCommit = evidence.CandidateCommit
                   ExpectedHead = evidence.ExpectedHead
                   WorkspaceSnapshotId = evidence.WorkspaceSnapshotId
                   QualityCertificateId = evidence.QualityCertificateId
                   AuthorityRevision = evidence.AuthorityRevision |})

    let private appendPublishedEvidence
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (landed: CommitHash)
        =
        append
            deps
            job
            (OrchestratorFactCases.Published
                {| ManagerJobId = evidence.ManagerJobId
                   CandidateCommit = evidence.CandidateCommit
                   ResultingTargetHead = landed |})

    let private finalizePublishedLanding
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (landed: CommitHash)
        =
        task {
            match! appendPublishedEvidence deps job evidence landed with
            | Error verdict -> return Error verdict
            | Ok() -> return Ok(Landed landed)
        }

    let private continueMergeAfterClassification
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (classified: Result<CommitHash option, OrchestratorVerdict>)
        =
        task {
            match classified with
            | Error verdict -> return Error verdict
            | Ok None -> return Ok TargetMoved
            | Ok(Some landed) -> return! finalizePublishedLanding deps job evidence landed
        }

    let private runPublishFfMerge
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (current: CommitHash)
        =
        task {
            let! merge = deps.Git.FfMerge job.WorktreePath job.TargetRef current evidence.CandidateCommit
            return! continueMergeAfterClassification deps job evidence (ffMergeVerdict job evidence merge)
        }

    let private claimRebasedForPublish
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (current: CommitHash)
        =
        task {
            match! appendPublishClaimed deps job evidence with
            | Error verdict -> return Error verdict
            | Ok() -> return! runPublishFfMerge deps job evidence current
        }

    let private continuePublishAfterConflicts
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (current: CommitHash)
        (conflicts: string list)
        =
        task {
            match prePublishConflictsVerdict job conflicts with
            | Error verdict -> return Error verdict
            | Ok() -> return! claimRebasedForPublish deps job evidence current
        }

    let private verifyPublishWorktreeClean
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (current: CommitHash)
        =
        task {
            match! conflictedFilesResult deps job with
            | Error verdict -> return Error verdict
            | Ok conflicts -> return! continuePublishAfterConflicts deps job evidence current conflicts
        }

    let private continuePublishAfterWorktreeHead
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (current: CommitHash)
        (worktreeHead: CommitHash)
        =
        task {
            match worktreePinVerdict job evidence worktreeHead with
            | Error verdict -> return Error verdict
            | Ok() -> return! verifyPublishWorktreeClean deps job evidence current
        }

    let private verifyPublishWorktreePin
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (current: CommitHash)
        =
        task {
            match! readHead deps job with
            | Error verdict -> return Error verdict
            | Ok worktreeHead -> return! continuePublishAfterWorktreeHead deps job evidence current worktreeHead
        }

    let private continuePublishAfterGateSnapshot
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (current: CommitHash)
        (snapshot: WorkspaceSnapshotId)
        =
        task {
            match gateSnapshotVerdict job evidence snapshot with
            | Error verdict -> return Error verdict
            | Ok() -> return! verifyPublishWorktreePin deps job evidence current
        }

    let private capturePublishGateSnapshot
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (current: CommitHash)
        =
        task {
            match! deps.Relay.CaptureSnapshot job.JobId with
            | Error error -> return Error(failed job (sprintf "Publish gate snapshot failed: %s" error))
            | Ok snapshot -> return! continuePublishAfterGateSnapshot deps job evidence current snapshot
        }

    let private completeClaimAndFf
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (current: CommitHash)
        =
        task {
            match publicationIdentityVerdict job evidence current with
            | Error verdict -> return Error verdict
            | Ok() -> return! capturePublishGateSnapshot deps job evidence current
        }

    let private claimExpectationVerdict
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (expectedHead: CommitHash)
        : Result<unit, OrchestratorVerdict> =
        if expectedHead <> evidence.ExpectedHead then
            Error(failed job "Publish CAS expectation does not match publication evidence")
        else
            Ok()

    let private continueClaimWithCurrent
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (current: CommitHash)
        =
        if current <> evidence.ExpectedHead then
            Task.FromResult(Ok TargetMoved)
        else
            completeClaimAndFf deps job evidence current

    let private fetchClaimCurrentAndContinue
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        =
        task {
            match! targetHead deps job with
            | Error verdict -> return Error verdict
            | Ok current -> return! continueClaimWithCurrent deps job evidence current
        }

    let private claimAndFf
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (expectedHead: CommitHash)
        =
        task {
            match claimExpectationVerdict job evidence expectedHead with
            | Error verdict -> return Error verdict
            | Ok() -> return! fetchClaimCurrentAndContinue deps job evidence
        }

    let private publishUnderGate
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (expectedHead: CommitHash)
        =
        task {
            let! gate = deps.AcquirePublishGate()

            let! outcome =
                task {
                    try
                        let! res = claimAndFf deps job evidence expectedHead
                        return Choice1Of2 res
                    with ex ->
                        return Choice2Of2 ex
                }

            do! gate.Release()

            match outcome with
            | Choice1Of2 res -> return res
            | Choice2Of2(:? OperationCanceledException as oce) -> return raise oce
            | Choice2Of2 error -> return Error(failed job (sprintf "Publish window failed: %s" error.Message))
        }

    let private releaseTerminalWorktree (deps: OrchestratorProgramDeps) (job: PublicationJob) =
        task {
            do! deps.Relay.TerminateRoadResources job.JobId
            return! job.ReleaseWorktree()
        }

    let private settleLanded (deps: OrchestratorProgramDeps) (job: PublicationJob) (commit: CommitHash) =
        task {
            match! releaseTerminalWorktree deps job with
            | Ok() -> return OrchestratorVerdict.Published(job.JobId, commit)
            | Error error -> return OrchestratorVerdict.PublishedPendingCleanup(job.JobId, commit, error)
        }

    let private backfillPublished
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (candidate: CommitHash)
        (resultingHead: CommitHash)
        =
        task {
            match!
                append
                    deps
                    job
                    (OrchestratorFactCases.Published
                        {| ManagerJobId = job.JobId
                           CandidateCommit = candidate
                           ResultingTargetHead = resultingHead |})
            with
            | Error verdict -> return verdict
            | Ok() -> return! settleLanded deps job resultingHead
        }

    let private currentRecord (deps: OrchestratorProgramDeps) (job: PublicationJob) = deps.TryJob job.JobId

    let private artifactSnapshotMatches
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (certificate: QualityCertificate)
        =
        taskResult {
            let! snapshot =
                deps.Relay.CaptureSnapshot job.JobId
                |> mapTaskError (fun error -> failed job (sprintf "Workspace snapshot failed: %s" error))

            return snapshot = certificate.SnapshotId, snapshot
        }

    let private requestAfterBindingChange (deps: OrchestratorProgramDeps) (job: PublicationJob) reason =
        taskResult {
            do! invalidate deps job reason
            let! _ = continueLoop deps job
            return ()
        }

    let rec private runManagerLoop (deps: OrchestratorProgramDeps) (job: PublicationJob) : Task<OrchestratorVerdict> =
        task {
            match! deps.Relay.AwaitLoopSignal job.JobId with
            | Error error -> return failed job (sprintf "Manager loop signal failed: %s" error)
            | Ok ManagerLoopSignal.Continue -> return! continueManagerLoop deps job
            | Ok(ManagerLoopSignal.Candidate certificate) -> return! handleQualityCandidate deps job certificate
            | Ok(ManagerLoopSignal.ExceptionalTerminal reason) -> return failed job reason
        }

    and private continueManagerLoop (deps: OrchestratorProgramDeps) (job: PublicationJob) : Task<OrchestratorVerdict> =
        task {
            match! continueLoop deps job with
            | Ok _ -> return! runManagerLoop deps job
            | Error verdict -> return verdict
        }

    and private handleRebase
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (certificate: QualityCertificate)
        (candidate: CommitHash)
        (target: CommitHash)
        reason
        : Task<OrchestratorVerdict> =
        let afterRebasedRecord _ = continueManagerLoop deps job

        let afterRebaseSnapshot snapshot =
            recordRebased deps job target snapshot |> continueResult afterRebasedRecord

        let onRebaseSuccess () =
            captureSnapshotResult deps job "Post-rebase snapshot failed"
            |> continueResult afterRebaseSnapshot

        let afterConflictRecord _ = continueManagerLoop deps job

        let afterConflictSnapshot files snapshot =
            recordConflict deps job candidate target snapshot files
            |> continueResult afterConflictRecord

        let handleConflictFiles rebaseError files =
            if List.isEmpty files then
                Task.FromResult(failed job (sprintf "Rebase failed without conflicts: %s" rebaseError))
            else
                captureSnapshotResult deps job "Conflict snapshot failed"
                |> continueResult (afterConflictSnapshot files)

        let onRebaseFailure rebaseError =
            conflictedFilesResult deps job
            |> continueResult (handleConflictFiles rebaseError)

        let afterInvalidation () =
            task {
                let! rebase = deps.Git.Rebase job.WorktreePath job.TargetRef

                match rebase with
                | Ok() -> return! onRebaseSuccess ()
                | Error rebaseError -> return! onRebaseFailure rebaseError
            }

        invalidate deps job reason |> continueUnit afterInvalidation

    and private publishCertified
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (certificate: QualityCertificate)
        (candidate: CommitHash)
        (expectedHead: CommitHash)
        : Task<OrchestratorVerdict> =
        let afterTargetRefresh refreshed =
            handleRebase deps job certificate candidate refreshed "PublishCasMissed"

        let handlePublishAttempt =
            function
            | Landed commit -> settleLanded deps job commit
            | TargetMoved -> targetHead deps job |> continueResult afterTargetRefresh

        let continueValidatedPublish (evidence: PublicationEvidence) =
            task {
                match! publishUnderGate deps job evidence evidence.ExpectedHead with
                | Error verdict -> return verdict
                | Ok attempt -> return! handlePublishAttempt attempt
            }

        let handleStaleSnapshotBeforePublish () =
            task {
                match! requestAfterBindingChange deps job "WorkspaceChangedAfterAssessment" with
                | Error verdict -> return verdict
                | Ok() -> return! runManagerLoop deps job
            }

        let continueValidatedWithSnapshot (evidence: PublicationEvidence) (snapshot: WorkspaceSnapshotId) =
            if snapshot <> evidence.WorkspaceSnapshotId then
                handleStaleSnapshotBeforePublish ()
            else
                continueValidatedPublish evidence

        let publishValidated (evidence: PublicationEvidence) =
            task {
                match! deps.Relay.CaptureSnapshot job.JobId with
                | Error error ->
                    return failed job (sprintf "Workspace snapshot capture failed before publish: %s" error)
                | Ok snapshot -> return! continueValidatedWithSnapshot evidence snapshot
            }

        let certifiedEvidence
            (rebasedReady:
                {| RebasedCommit: CommitHash
                   TargetHeadSnapshot: CommitHash
                   WorkspaceSnapshotId: WorkspaceSnapshotId |})
            : Result<PublicationEvidence, OrchestratorVerdict> =
            if candidate <> rebasedReady.RebasedCommit then
                Error(
                    failed
                        job
                        (sprintf
                            "Candidate %s does not match rebased evidence pin %s"
                            (CommitHash.value candidate)
                            (CommitHash.value rebasedReady.RebasedCommit))
                )
            elif expectedHead <> rebasedReady.TargetHeadSnapshot then
                Error(
                    failed
                        job
                        (sprintf
                            "Target head %s does not match rebased evidence snapshot %s"
                            (CommitHash.value expectedHead)
                            (CommitHash.value rebasedReady.TargetHeadSnapshot))
                )
            elif certificate.SnapshotId <> rebasedReady.WorkspaceSnapshotId then
                Error(failed job "Live certificate snapshot does not match rebased evidence snapshot")
            else
                Ok(buildPublicationEvidence job rebasedReady certificate)

        let continueCertifiedWithRebased
            (rebasedReady:
                {| RebasedCommit: CommitHash
                   TargetHeadSnapshot: CommitHash
                   WorkspaceSnapshotId: WorkspaceSnapshotId |})
            =
            task {
                match certifiedEvidence rebasedReady with
                | Error verdict -> return verdict
                | Ok evidence -> return! publishValidated evidence
            }

        let continueCertifiedWithRecord (record: ManagerJobProjection) =
            task {
                match record.RebasedCandidateReady with
                | None -> return failed job "Missing RebasedCandidateReady evidence for certified publish"
                | Some rebasedReady -> return! continueCertifiedWithRebased rebasedReady
            }

        task {
            match currentRecord deps job with
            | None -> return failed job "No record found for certified publish"
            | Some record -> return! continueCertifiedWithRecord record
        }

    and private handleQualityCandidate
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (certificate: QualityCertificate)
        : Task<OrchestratorVerdict> =
        let resumeLoop () = runManagerLoop deps job

        let bindingChanged () =
            requestAfterBindingChange deps job "WorkspaceChangedAfterAssessment"
            |> continueUnit resumeLoop

        let afterConflictBindingChange () = runManagerLoop deps job

        let afterConflictRecord () =
            requestAfterBindingChange deps job "ArtifactAdmissionUnmerged"
            |> continueUnit afterConflictBindingChange

        let recordObservedConflict currentSnapshot files candidate target =
            recordConflict deps job candidate target currentSnapshot files
            |> continueUnit afterConflictRecord

        let afterConflictHead currentSnapshot files candidate =
            targetHead deps job
            |> continueResult (recordObservedConflict currentSnapshot files candidate)

        let handleObservedConflict currentSnapshot files =
            readHead deps job |> continueResult (afterConflictHead currentSnapshot files)

        let rebaseReason =
            function
            | Some _ -> "TargetAdvanced"
            | None -> "InitialRebaseRequired"

        let recordInitialCandidate candidate target rebased =
            let afterCandidateRecord () =
                handleRebase deps job certificate candidate target (rebaseReason rebased)

            recordCandidate deps job candidate certificate
            |> continueUnit afterCandidateRecord

        let admitPreparedCandidate candidate target =
            let rebased =
                currentRecord deps job
                |> Option.bind (fun record -> record.RebasedCandidateReady)

            match rebased with
            | Some admitted when admitted.RebasedCommit = candidate && admitted.TargetHeadSnapshot = target ->
                publishCertified deps job certificate candidate target
            | _ -> recordInitialCandidate candidate target rebased

        let onPreparedCandidate candidate =
            targetHead deps job |> continueResult (admitPreparedCandidate candidate)

        let handleConflictFiles currentSnapshot files =
            match files with
            | [] -> prepareCandidateResult deps job |> continueResult onPreparedCandidate
            | _ -> handleObservedConflict currentSnapshot files

        let onPrepareFailure currentSnapshot _ =
            conflictedFilesResult deps job
            |> continueResult (handleConflictFiles currentSnapshot)

        let inspectCurrentArtifact currentSnapshot =
            task {
                let! outcome = prepareCandidateResult deps job

                match outcome with
                | Ok candidate -> return! onPreparedCandidate candidate
                | Error error -> return! onPrepareFailure currentSnapshot error
            }

        let handleSnapshotAdmission (matches, currentSnapshot) =
            if matches then
                inspectCurrentArtifact currentSnapshot
            else
                bindingChanged ()

        artifactSnapshotMatches deps job certificate
        |> continueResult handleSnapshotAdmission

    let private resumePublishReady
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (expectedHead: CommitHash)
        =
        task {
            match! publishUnderGate deps job evidence expectedHead with
            | Error verdict -> return verdict
            | Ok(Landed commit) -> return! settleLanded deps job commit
            | Ok TargetMoved -> return! runManagerLoop deps job
        }

    let private resumePublishReality
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (current: CommitHash)
        (reality: PublishClaimReality)
        =
        match reality with
        | PublishClaimReality.HeadUnreadable ->
            Task.FromResult(failed job "GetTargetHead failed during publish recovery")
        | PublishClaimReality.AlreadyFastForwarded -> backfillPublished deps job evidence.CandidateCommit current
        | PublishClaimReality.PublishReady -> resumePublishReady deps job evidence evidence.ExpectedHead
        | PublishClaimReality.ClaimExpired -> runManagerLoop deps job

    let private reentryClaimTargetVerdict
        (job: PublicationJob)
        (targetRef: TargetRef)
        : Result<unit, OrchestratorVerdict> =
        if targetRef <> job.TargetRef then
            Error(failed job "Publish claim target mismatch; refusing publish recovery")
        else
            Ok()

    let private reentryRebasedMatches
        (rebasedCommit: CommitHash)
        (expectedHead: CommitHash)
        (workspaceSnapshotId: WorkspaceSnapshotId)
        (rebasedReady:
            {| RebasedCommit: CommitHash
               TargetHeadSnapshot: CommitHash
               WorkspaceSnapshotId: WorkspaceSnapshotId |})
        =
        rebasedCommit = rebasedReady.RebasedCommit
        && expectedHead = rebasedReady.TargetHeadSnapshot
        && workspaceSnapshotId = rebasedReady.WorkspaceSnapshotId

    let private continueReentryWithTarget
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (current: CommitHash)
        =
        let reality =
            OrchestratorProjection.classifyPublishClaim (Some current) evidence.CandidateCommit evidence.ExpectedHead

        resumePublishReality deps job evidence current reality

    let private resolveReentryTarget
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        =
        task {
            let! targetResult = deps.Git.GetTargetHead job.TargetRef

            match targetResult with
            | Error _ -> return failed job "GetTargetHead failed; refusing publish recovery"
            | Ok current -> return! continueReentryWithTarget deps job evidence current
        }

    let private continueReentryAfterHead
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (worktreeHead: CommitHash)
        =
        if worktreeHead <> evidence.CandidateCommit then
            Task.FromResult(
                failed
                    job
                    (sprintf
                        "Worktree HEAD %s does not match claimed rebased commit %s"
                        (CommitHash.value worktreeHead)
                        (CommitHash.value evidence.CandidateCommit))
            )
        else
            resolveReentryTarget deps job evidence

    let private verifyReentryHead
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        =
        task {
            match! readHead deps job with
            | Error err -> return err
            | Ok worktreeHead -> return! continueReentryAfterHead deps job evidence worktreeHead
        }

    let private handleStaleReentrySnapshot (deps: OrchestratorProgramDeps) (job: PublicationJob) =
        task {
            match! requestAfterBindingChange deps job "WorkspaceChangedAfterAssessment" with
            | Error verdict -> return verdict
            | Ok() -> return! runManagerLoop deps job
        }

    let private continueReentryAfterSnapshot
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        (currentSnapshot: WorkspaceSnapshotId)
        =
        if currentSnapshot <> evidence.WorkspaceSnapshotId then
            handleStaleReentrySnapshot deps job
        else
            verifyReentryHead deps job evidence

    let private verifyReentrySnapshot
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        =
        task {
            match! deps.Relay.CaptureSnapshot job.JobId with
            | Error err -> return failed job (sprintf "Workspace snapshot capture failed during reentry: %s" err)
            | Ok currentSnapshot -> return! continueReentryAfterSnapshot deps job evidence currentSnapshot
        }

    let private continueReentryWithEvidence
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (evidence: PublicationEvidence)
        =
        verifyReentrySnapshot deps job evidence

    let private continueReentryWithRebased
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (claim:
            {| TargetRef: TargetRef
               RebasedCommit: CommitHash
               ExpectedHead: CommitHash
               WorkspaceSnapshotId: WorkspaceSnapshotId
               QualityCertificateId: QualityCertificateId
               AuthorityRevision: AuthorityRevision |})
        (rebasedReady:
            {| RebasedCommit: CommitHash
               TargetHeadSnapshot: CommitHash
               WorkspaceSnapshotId: WorkspaceSnapshotId |})
        =
        if reentryRebasedMatches claim.RebasedCommit claim.ExpectedHead claim.WorkspaceSnapshotId rebasedReady then
            continueReentryWithEvidence deps job (buildClaimPublicationEvidence job claim)
        else
            runManagerLoop deps job

    let private continueReentryWithRecord
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (claim:
            {| TargetRef: TargetRef
               RebasedCommit: CommitHash
               ExpectedHead: CommitHash
               WorkspaceSnapshotId: WorkspaceSnapshotId
               QualityCertificateId: QualityCertificateId
               AuthorityRevision: AuthorityRevision |})
        (record: ManagerJobProjection)
        =
        task {
            match record.RebasedCandidateReady with
            | None -> return failed job "Missing RebasedCandidateReady evidence for publish claim reentry"
            | Some rebasedReady -> return! continueReentryWithRebased deps job claim rebasedReady
        }

    let private fetchReentryRecordAndContinue
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (claim:
            {| TargetRef: TargetRef
               RebasedCommit: CommitHash
               ExpectedHead: CommitHash
               WorkspaceSnapshotId: WorkspaceSnapshotId
               QualityCertificateId: QualityCertificateId
               AuthorityRevision: AuthorityRevision |})
        =
        task {
            match currentRecord deps job with
            | None -> return failed job "No record found for publish claim reentry"
            | Some record -> return! continueReentryWithRecord deps job claim record
        }

    let private reenterPublishClaim
        (deps: OrchestratorProgramDeps)
        (job: PublicationJob)
        (claim:
            {| TargetRef: TargetRef
               RebasedCommit: CommitHash
               ExpectedHead: CommitHash
               WorkspaceSnapshotId: WorkspaceSnapshotId
               QualityCertificateId: QualityCertificateId
               AuthorityRevision: AuthorityRevision |})
        =
        task {
            match reentryClaimTargetVerdict job claim.TargetRef with
            | Error verdict -> return verdict
            | Ok() -> return! fetchReentryRecordAndContinue deps job claim
        }

    let private cleanUp (deps: OrchestratorProgramDeps) (job: PublicationJob) =
        task {
            match! releaseTerminalWorktree deps job with
            | Ok() -> return OrchestratorVerdict.Empty
            | Error error -> return failed job (sprintf "Terminal job cleanup failed: %s" error)
        }

    let private program (deps: OrchestratorProgramDeps) (job: PublicationJob) =
        match currentRecord deps job with
        | Some { Terminal = Some _ } -> cleanUp deps job
        | Some { PublishClaimed = Some claim } -> reenterPublishClaim deps job claim
        | _ -> runManagerLoop deps job

    let run (deps: OrchestratorProgramDeps) (job: PublicationJob) =
        task {
            try
                return! program deps job
            with
            | :? OperationCanceledException -> return OrchestratorVerdict.Cancelled job.JobId
            | error -> return failed job (sprintf "%A" error)
        }
