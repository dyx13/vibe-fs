namespace Wanxiangshu.Change.Probe

open System
open System.Collections.Generic
open System.Threading.Tasks
open Wanxiangshu.Change
open Wanxiangshu.Execution.Delegation
open Wanxiangshu.Foundation.Identity

module RecoveryProbe =
    let private require condition message =
        if not condition then
            failwith message

    let private job tag =
        let jobId = ManagerJobId.create tag

        OrchestratorProjection.createJob
            {| ManagerJobId = jobId
               ManagerSessionId = SessionId.create ("session-" + tag)
               ManagerAgent = "manager-" + tag
               Byname = "road-" + tag
               WorktreeIdentity = WorktreeIdentity.create ("manager/" + tag)
               WorktreePath = WorktreePath.create ("/worktrees/" + tag)
               TargetRef = TargetRef.create "refs/heads/main"
               TargetBranchFrozen = "refs/heads/main" |}
            OrchestratorProjection.empty
        |> OrchestratorProjection.tryFind jobId
        |> Option.defaultWith (fun () -> failwith "Recovery probe job was not created")

    let private verifyEmpty () =
        task {
            let trace = ResizeArray<string>()

            do!
                OrchestratorManagerJob.recoverJobs
                    (fun () ->
                        trace.Add "read"

                        { ActiveJobs = []; Handles = None })
                    (fun _ -> failwith "An empty view must not register a worktree")
                    (fun handles ->
                        require handles.IsNone "An empty view gained handles"
                        trace.Add "handles")
                    (fun _ -> failwith "An empty view must not resume a job")

            require (Seq.toList trace = [ "read"; "handles" ]) "Empty recovery changed its read or registration count"
        }

    let private verifyJobs () =
        task {
            let first = job "first"
            let second = job "second"
            let handles = HandleProjection.empty
            let trace = ResizeArray<string>()

            let record phase (actual: ManagerJobProjection) =
                require
                    (obj.ReferenceEquals(actual, first) || obj.ReferenceEquals(actual, second))
                    "Recovery replaced the original job record"

                trace.Add(phase + ":" + ManagerJobId.value actual.ManagerJobId)

            do!
                OrchestratorManagerJob.recoverJobs
                    (fun () ->
                        trace.Add "read"

                        { ActiveJobs = [ first; second ]
                          Handles = Some handles })
                    (record "register")
                    (fun actual ->
                        match actual with
                        | Some value ->
                            require (obj.ReferenceEquals(value, handles)) "Recovery replaced its handles view"
                        | None -> failwith "Recovery dropped its handles view"

                        trace.Add "handles")
                    (record "recover")

            require
                (Seq.toList trace = [ "read"
                                      "register:first"
                                      "register:second"
                                      "handles"
                                      "recover:first"
                                      "recover:second" ])
                "Recovery must register every worktree and the same handles view before resuming the original jobs"
        }

    let private verifyRegistrationFailure failurePoint =
        task {
            let first = job "first"
            let second = job "second"

            let failure =
                InvalidOperationException("Rejected " + failurePoint + " registration")

            let trace = ResizeArray<string>()
            let observed = ref None

            try
                do!
                    OrchestratorManagerJob.recoverJobs
                        (fun () ->
                            trace.Add "read"

                            { ActiveJobs = [ first; second ]
                              Handles = Some HandleProjection.empty })
                        (fun actual ->
                            trace.Add("register:" + ManagerJobId.value actual.ManagerJobId)

                            if failurePoint = "worktree" && obj.ReferenceEquals(actual, second) then
                                raise failure)
                        (fun _ ->
                            trace.Add "handles"

                            if failurePoint = "handles" then
                                raise failure)
                        (fun _ -> failwith "Registration failure must not resume a job")
            with error ->
                observed.Value <- Some error

            require
                (observed.Value
                 |> Option.exists (fun error -> obj.ReferenceEquals(error, failure)))
                "Recovery must preserve the original registration failure"

            let expected =
                if failurePoint = "worktree" then
                    [ "read"; "register:first"; "register:second" ]
                else
                    [ "read"; "register:first"; "register:second"; "handles" ]

            require (Seq.toList trace = expected) "Recovery continued after a registration failure"
        }

    let verify () : Task<unit> =
        task {
            do! verifyEmpty ()
            do! verifyJobs ()
            do! verifyRegistrationFailure "worktree"
            do! verifyRegistrationFailure "handles"
        }
