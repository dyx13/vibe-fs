namespace Wanxiangshu.Change.Probe

open System.Collections.Generic
open System.Threading.Tasks
open Wanxiangshu.Change
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Mission.Relay

module ProgramProbe =
    let private certificate tag snapshot : QualityCertificate =
        { Id = QualityCertificateId.create ("certificate-" + tag)
          AssessmentId = AssessmentId.create ("assessment-" + tag)
          IncumbencyId = IncumbencyId.create ("incumbency-" + tag)
          SnapshotId = WorkspaceSnapshotId.create snapshot
          AuthorityRevision = AuthorityRevision.create ("authority-" + tag)
          Binding =
            { PhysicalUserMessageId = "physical-" + tag
              ProviderRunId = "provider-" + tag
              ToolCallId = "tool-" + tag
              NarrativeDigest = "narrative-" + tag
              PayloadDigest = "payload-" + tag
              RootRequestDigest = "root-" + tag
              RequirementSetDigest = "requirements-" + tag
              EvidenceFrontierDigest = "evidence-" + tag }
          Valid = true
          InvalidationReason = None }

    let private factName =
        function
        | OrchestratorFactCases.CandidateReady _ -> "CandidateReady"
        | OrchestratorFactCases.RebasedCandidateReady _ -> "RebasedCandidateReady"
        | OrchestratorFactCases.PublishClaimed _ -> "PublishClaimed"
        | OrchestratorFactCases.Published _ -> "Published"
        | unexpected -> failwithf "Unexpected program fact: %A" unexpected

    let private fold state fact =
        match OrchestratorFactFold.fold state fact with
        | Ok next -> next
        | Error rejection -> failwithf "Probe fact rejected: %A" rejection

    let private require condition message =
        if not condition then
            failwith message

    let private observe scenario =
        task {
            let fresh = scenario = "fresh" || scenario = "cleanup-failed"
            let claim = scenario.StartsWith("claim-", System.StringComparison.Ordinal)

            require
                (List.contains
                    scenario
                    [ "fresh"
                      "cas-miss"
                      "cleanup-failed"
                      "claim-ready"
                      "claim-already-published"
                      "claim-expired" ])
                "Unknown Program probe scenario"

            let jobId = ManagerJobId.create "probe-job"
            let sessionId = SessionId.create "probe-manager"
            let path = WorktreePath.create "/probe/worktree"
            let targetRef = TargetRef.create "refs/heads/main"
            let head = ref (CommitHash.create (if fresh then "candidate-1" else "rebased-1"))

            let target =
                ref (
                    CommitHash.create (
                        match scenario with
                        | "claim-already-published" -> "rebased-1"
                        | "claim-expired" -> "target-2"
                        | _ -> "target-1"
                    )
                )

            let snapshot () =
                WorkspaceSnapshotId.create ("snapshot-" + CommitHash.value head.Value)

            let firstCertificate = certificate "1" "snapshot-candidate-1"
            let rebasedCertificate = certificate "2" "snapshot-rebased-1"

            let signals =
                Queue<ManagerLoopSignal>(
                    match scenario with
                    | "fresh"
                    | "cleanup-failed" ->
                        [ ManagerLoopSignal.Candidate firstCertificate
                          ManagerLoopSignal.Candidate rebasedCertificate ]
                    | "cas-miss" ->
                        [ ManagerLoopSignal.Candidate rebasedCertificate
                          ManagerLoopSignal.ExceptionalTerminal "probe-complete" ]
                    | "claim-expired" ->
                        [ ManagerLoopSignal.Continue
                          ManagerLoopSignal.ExceptionalTerminal "probe-complete" ]
                    | _ -> []
                )

            let created =
                OrchestratorFactCases.ManagerJobCreated
                    {| ManagerJobId = jobId
                       ManagerSessionId = sessionId
                       ManagerAgent = "manager"
                       Byname = "probe-road"
                       WorktreeIdentity = WorktreeIdentity.create "manager/probe-job"
                       WorktreePath = path
                       TargetRef = targetRef
                       TargetBranchFrozen = TargetRef.value targetRef |}

            let rebased =
                OrchestratorFactCases.RebasedCandidateReady
                    {| ManagerJobId = jobId
                       RebasedCommit = CommitHash.create "rebased-1"
                       TargetHeadSnapshot = CommitHash.create "target-1"
                       WorkspaceSnapshotId = rebasedCertificate.SnapshotId |}

            let claimed =
                OrchestratorFactCases.PublishClaimed
                    {| ManagerJobId = jobId
                       TargetRef = targetRef
                       RebasedCommit = CommitHash.create "rebased-1"
                       ExpectedHead = CommitHash.create "target-1"
                       WorkspaceSnapshotId = rebasedCertificate.SnapshotId
                       QualityCertificateId = rebasedCertificate.Id
                       AuthorityRevision = rebasedCertificate.AuthorityRevision |}

            let seeds =
                if fresh then [ created ]
                elif claim then [ created; rebased; claimed ]
                else [ created; rebased ]

            let state = ref (List.fold fold OrchestratorProjection.empty seeds)
            let facts = ResizeArray<string>()
            let timeline = ResizeArray<string>()
            let ffCalls = ref 0
            let gateAcquireCount = ref 0
            let gateReleaseCount = ref 0
            let gateHeld = ref false
            let releases = ref 0
            let continued = ref 0
            let signalCount = ref 0
            let invalidations = ResizeArray<string>()

            let git: GitPort =
                { IsDirty = fun _ -> Task.FromResult(Ok false)
                  CreateWorktree = fun _ _ -> failwith "Program must not create a worktree"
                  FreezeTargetBranch = fun () -> failwith "Program must use the frozen target"
                  Rebase =
                    fun actualPath actualTarget ->
                        require (actualPath = path && actualTarget = targetRef) "Rebase changed job identity"
                        require (not gateHeld.Value) "Rebase ran inside the publish gate"
                        timeline.Add "rebase"
                        head.Value <- CommitHash.create (if scenario = "cas-miss" then "rebased-2" else "rebased-1")
                        Task.FromResult(Ok())
                  FfMerge =
                    fun actualPath actualTarget expected pinned ->
                        require (actualPath = path && actualTarget = targetRef) "FF changed job identity"

                        require
                            (gateHeld.Value && expected = CommitHash.create "target-1" && pinned = head.Value)
                            "FF lost its gate or pin"

                        ffCalls.Value <- ffCalls.Value + 1
                        timeline.Add "ff"

                        if scenario = "cas-miss" then
                            target.Value <- CommitHash.create "target-2"
                            Task.FromResult(Error OrchestratorConstants.targetRefMovedError)
                        else
                            target.Value <- pinned
                            Task.FromResult(Ok pinned)
                  ConflictedFiles = fun _ -> Task.FromResult(Ok [])
                  RemoveWorktree = fun _ -> failwith "Program must use its release capability"
                  HasRebaseHead = fun _ -> Task.FromResult false
                  ListWorktrees = fun () -> failwith "Program must not scan worktrees"
                  ListManagerBranches = fun () -> failwith "Program must not scan branches"
                  DeleteBranch = fun _ -> failwith "Program must use its release capability"
                  ReadHead =
                    fun actualPath ->
                        require (actualPath = path) "Head lookup changed worktree"
                        Task.FromResult(Ok head.Value)
                  GetTargetHead =
                    fun actualTarget ->
                        require (actualTarget = targetRef) "Head lookup changed target"
                        Task.FromResult(Ok target.Value) }

            let relay: RelayPort =
                { CreateManagerSession = fun _ -> failwith "Program must not create a manager"
                  ActivateManager = fun _ -> failwith "Program must not activate a manager"
                  AwaitLoopSignal =
                    fun _ ->
                        require (signals.Count > 0) "Signal queue exhausted"
                        signalCount.Value <- signalCount.Value + 1
                        Task.FromResult(Ok(signals.Dequeue()))
                  InvalidateCertificate =
                    fun _ reason ->
                        invalidations.Add reason
                        timeline.Add "invalidate"
                        Task.FromResult(Ok())
                  ContinueLoop =
                    fun _ ->
                        continued.Value <- continued.Value + 1
                        timeline.Add "continue"
                        Task.FromResult(Ok(IncumbencyId.create "next-incumbency"))
                  CaptureSnapshot = fun _ -> Task.FromResult(Ok(snapshot ()))
                  PrepareCandidate = fun _ -> Task.FromResult(Ok head.Value)
                  TerminateRoadResources =
                    fun _ ->
                        require (not gateHeld.Value) "Cleanup ran inside the publish gate"
                        timeline.Add "terminate"
                        Task.FromResult() }

            let job: PublicationJob =
                { JobId = jobId
                  TargetRef = targetRef
                  WorktreePath = path
                  ReleaseWorktree =
                    fun () ->
                        require (not gateHeld.Value) "Worktree released inside the publish gate"
                        releases.Value <- releases.Value + 1
                        timeline.Add "release-worktree"

                        Task.FromResult(
                            if scenario = "cleanup-failed" then
                                Error "disk detached"
                            else
                                Ok()
                        ) }

            let deps: OrchestratorProgramDeps =
                { Git = git
                  Relay = relay
                  AppendFact =
                    fun fact ->
                        state.Value <- fold state.Value fact
                        facts.Add(factName fact)
                        Task.FromResult(Ok())
                  TryJob = fun id -> OrchestratorProjection.tryFind id state.Value
                  AcquirePublishGate =
                    fun () ->
                        gateAcquireCount.Value <- gateAcquireCount.Value + 1
                        gateHeld.Value <- true

                        Task.FromResult
                            { Release =
                                fun () ->
                                    gateReleaseCount.Value <- gateReleaseCount.Value + 1
                                    gateHeld.Value <- false
                                    timeline.Add "release-gate"
                                    Task.FromResult() } }

            let! outcome = OrchestratorProgram.run deps job

            let verdict =
                match outcome with
                | OrchestratorVerdict.Published(_, landed) ->
                    require (landed = CommitHash.create "rebased-1") "Published the wrong commit"
                    "Published"
                | OrchestratorVerdict.PublishedPendingCleanup(_, landed, error) ->
                    require (landed = CommitHash.create "rebased-1" && error = "disk detached") "Lost cleanup evidence"
                    "PublishedPendingCleanup"
                | OrchestratorVerdict.IntegrationFailed(_, error) ->
                    require (error = "probe-complete") ("Unexpected program failure: " + error)
                    "IntegrationFailed"
                | unexpected -> failwithf "Unexpected program verdict: %A" unexpected

            return
                {| verdict = verdict
                   facts = facts.ToArray()
                   ffCalls = ffCalls.Value
                   gateAcquireCount = gateAcquireCount.Value
                   gateReleaseCount = gateReleaseCount.Value
                   gateHeld = gateHeld.Value
                   releases = releases.Value
                   continued = continued.Value
                   signalCount = signalCount.Value
                   invalidations = invalidations.ToArray()
                   timeline = timeline.ToArray() |}
        }

    let run (scenario: string) : Task<obj> =
        task {
            let! observation = observe scenario
            return box observation
        }

    let verify () : Task<unit> =
        task {
            let cases =
                [ "fresh",
                  "Published",
                  [| "CandidateReady"; "RebasedCandidateReady"; "PublishClaimed"; "Published" |],
                  1,
                  1,
                  1,
                  1,
                  2
                  "cas-miss", "IntegrationFailed", [| "PublishClaimed"; "RebasedCandidateReady" |], 1, 1, 0, 1, 2
                  "cleanup-failed",
                  "PublishedPendingCleanup",
                  [| "CandidateReady"; "RebasedCandidateReady"; "PublishClaimed"; "Published" |],
                  1,
                  1,
                  1,
                  1,
                  2
                  "claim-ready", "Published", [| "PublishClaimed"; "Published" |], 1, 1, 1, 0, 0
                  "claim-already-published", "Published", [| "Published" |], 0, 0, 1, 0, 0
                  "claim-expired", "IntegrationFailed", [||], 0, 0, 0, 1, 2 ]

            for scenario, verdict, facts, ff, gates, releases, continued, signals in cases do
                let! observed = observe scenario
                require (observed.verdict = verdict && observed.facts = facts) (scenario + ": wrong verdict or facts")

                require
                    (observed.ffCalls = ff
                     && observed.gateAcquireCount = gates
                     && observed.gateReleaseCount = gates
                     && not observed.gateHeld)
                    (scenario + ": wrong publication effects")

                require
                    (observed.releases = releases
                     && observed.continued = continued
                     && observed.signalCount = signals)
                    (scenario + ": wrong cleanup or loop effects")

                if scenario = "cas-miss" then
                    require
                        (observed.invalidations = [| "PublishCasMissed" |])
                        "CAS miss did not invalidate its certificate"

                    require
                        (observed.timeline = [| "ff"; "release-gate"; "invalidate"; "rebase"; "continue" |])
                        "CAS miss changed effect order"
        }
