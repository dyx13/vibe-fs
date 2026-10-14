namespace Wanxiangshu.Prefix.CompilerProbe

open System.Threading.Tasks
open Wanxiangshu.Composition.Turn
open Wanxiangshu.Context.Prefix
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Interaction.Authority
open Wanxiangshu.Interaction.Dispatch
open Wanxiangshu.Participant.Persona
open Wanxiangshu.Participant.Provider.Attempt

module PrefixWorkflowProbe =
    let private require condition message =
        if not condition then
            failwith message

    let verify () =
        task {
            let session = SessionId.create "prefix-commit-session"
            let physical = PhysicalUserMessageId.create "prefix-physical"
            let providerRun = ProviderRunIdentity.create "prefix-provider-run"

            let authority =
                ParticipantIdentity.resolveAtRoot "engineer"
                |> Result.mapError (sprintf "%A")
                |> Result.bind (
                    PromptAuthority.createAuthorityExecutionProfile
                        session
                        (LogicalRunId.create "prefix-logical-run")
                        (AuthorityRootUserMessageId.create "prefix-root")
                        PromptAuthority.RootAuthorityKind.HumanRoot
                )
                |> Result.defaultWith (fun error -> failwithf "%A" error)

            let probe =
                { ProbeId = "frozen-probe"
                  BasedOnEpochId = PrefixEpochId.initial
                  Candidate =
                    { FrozenRecordPrefixRef = BlobRef.create "frozen-blob"
                      FrozenRecordPrefixDigest = BlobDigest.create "frozen-digest"
                      CutoffExclusive = 4
                      CoveredPrefixDigest = "covered-digest"
                      SealRoot = "frozen-seal"
                      SyntheticMessageId = "frozen-synthetic" } }

            let plan =
                AttemptPlanner.freezePreInference
                    authority
                    physical
                    (PromptAuthority.PromptOrigin.AuthorityRoot PromptAuthority.RootAuthorityKind.HumanRoot)
                    ProviderRequestKind.WorkMain
                    None
                    true
                    (fun () -> Ok probe)
                |> AttemptPlanner.bindProviderRun providerRun

            let turn: ReconciledTurn =
                { SessionId = session
                  PhysicalUserMessageId = physical
                  AuthorityRootUserMessageId = authority.AuthorityRootUserMessageId
                  ProviderRun = providerRun
                  Role = None
                  Directory = None
                  Parts = [||]
                  Finish = None
                  ErrorName = None
                  Model = None
                  Outcome = ReconcileProgram.TurnCompleted
                  Observation = None }

            let entered = TaskCompletionSource<unit>()
            let release = TaskCompletionSource<Result<unit, string>>()
            let effects = ResizeArray<string>()

            let attempts: AttemptPlanCapability =
                { TryAttemptPlan = fun _ _ -> Some plan
                  TryBindAttemptPlan = fun _ _ _ -> failwith "already bound"
                  ConsumeAttemptPlan =
                    fun actualSession actualRun ->
                        require (actualSession = session && actualRun = providerRun) "Consume must use the exact run"
                        effects.Add "consume"
                        Some plan
                  FreezePendingAttemptPlan = fun _ _ _ -> failwith "not a transform"
                  TryPendingAttemptPlan = fun _ _ -> failwith "not a transform" }

            let port: WireJournalPort =
                { ReadView =
                    fun _ ->
                        { State =
                            Some
                                { XTrace = None
                                  Blog = None
                                  PrefixEpoch = Some PrefixEpochProjection.empty
                                  TodoCheckpoints = PhaseWindow.emptyWindow }
                          IsCompanion = false
                          ActiveAuthorityProfile = None
                          ProviderFailureState = None
                          AcceptedOrigin = fun _ -> None }
                  Candidate =
                    { Hash = id
                      Materialize = fun _ _ -> failwith "not materializing"
                      ReadBlob = fun _ -> failwith "not materializing"
                      WriteBlob = fun _ -> failwith "not materializing" }
                  CurrentProjection = fun _ -> failwith "not materializing"
                  RecordConfirmedSuccess =
                    fun _ _ ->
                        effects.Add "success"
                        Task.FromResult(Ok())
                  CommitPrefixRebase =
                    fun actualSession actualRun payload ->
                        require (actualSession = session && actualRun = providerRun) "Commit must use the exact run"
                        require (payload.ProbeId = probe.ProbeId) "Commit must use the frozen probe"

                        require
                            (payload.FrozenRecordPrefixDigest = probe.Candidate.FrozenRecordPrefixDigest)
                            "Commit must use the frozen digest"

                        effects.Add "rebase"
                        entered.SetResult()
                        release.Task }

            let pending = PrefixWorkflow.reconcileAttempt (Some port) attempts turn
            do! entered.Task
            require (List.ofSeq effects = [ "rebase" ]) "A parked rebase must not consume its plan"
            release.SetResult(Ok())
            do! pending
            require (List.ofSeq effects = [ "rebase"; "success"; "consume" ]) "Commit must precede consumption"

            effects.Clear()

            let reject port =
                task {
                    try
                        do! PrefixWorkflow.reconcileAttempt (Some port) attempts turn
                        return false
                    with _ ->
                        return true
                }

            let! prefixRejected =
                reject
                    { port with
                        CommitPrefixRebase =
                            fun _ _ _ ->
                                effects.Add "rebase-refused"
                                Task.FromResult(Error "prefix refused") }

            require prefixRejected "A refused prefix must reject settlement"
            require (List.ofSeq effects = [ "rebase-refused" ]) "A refused prefix must keep its plan"
            effects.Clear()

            let! successRejected =
                reject
                    { port with
                        CommitPrefixRebase =
                            fun _ _ _ ->
                                effects.Add "rebase"
                                Task.FromResult(Ok())
                        RecordConfirmedSuccess =
                            fun _ _ ->
                                effects.Add "success-refused"
                                Task.FromResult(Error "success refused") }

            require successRejected "A refused success record must reject settlement"

            require (List.ofSeq effects = [ "rebase"; "success-refused" ]) "A refused success record must keep its plan"
        }
