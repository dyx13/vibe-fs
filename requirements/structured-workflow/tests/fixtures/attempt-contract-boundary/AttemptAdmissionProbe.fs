namespace Wanxiangshu.Attempt.CompilerProbe

open Wanxiangshu.Context.Prefix
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Interaction.Authority
open Wanxiangshu.Participant.Persona
open Wanxiangshu.Participant.Provider.Attempt

module AttemptAdmissionProbe =
    let private require condition message =
        if not condition then
            failwith message

    let private requireOk result =
        match result with
        | Ok value -> value
        | Error error -> failwithf "Probe input rejected: %A" error

    let verify () =
        let session = SessionId.create "admission-session"
        let physical = PhysicalUserMessageId.create "admission-physical"
        let participant = ParticipantIdentity.resolveAtRoot "engineer" |> requireOk

        let authority =
            PromptAuthority.createAuthorityExecutionProfile
                session
                (LogicalRunId.create "admission-logical")
                (AuthorityRootUserMessageId.create "admission-root")
                PromptAuthority.RootAuthorityKind.HumanRoot
                participant
            |> requireOk

        let probe =
            { ProbeId = "admission-probe"
              BasedOnEpochId = PrefixEpochId.create 0
              Candidate =
                { FrozenRecordPrefixRef = BlobRef.create "admission-blob"
                  FrozenRecordPrefixDigest = BlobDigest.create "admission-digest"
                  CutoffExclusive = 2
                  CoveredPrefixDigest = "covered-prefix"
                  SealRoot = "seal-root"
                  SyntheticMessageId = "synthetic-message" } }

        let freeze physical requestKind allowProbe =
            AttemptPlanner.freezePreInference
                authority
                physical
                (PromptAuthority.PromptOrigin.AuthorityRoot PromptAuthority.RootAuthorityKind.HumanRoot)
                requestKind
                None
                allowProbe
                (fun () -> Ok probe)

        let original = freeze physical ProviderRequestKind.WorkMain false
        let replay = freeze physical ProviderRequestKind.WorkMain false
        let changedChoiceEvidence = freeze physical ProviderRequestKind.WorkMain true
        let changedKind = freeze physical ProviderRequestKind.InteractionRepair false

        let changedPhysical =
            freeze (PhysicalUserMessageId.create "other-physical") ProviderRequestKind.WorkMain false

        require (PendingAttemptPlanAdmission.areSemanticallyEqual original replay) "Equal plans must remain equal"

        require
            (not (PendingAttemptPlanAdmission.areSemanticallyEqual original changedChoiceEvidence))
            "Full equality must include the frozen probe decision evidence"

        require
            (PendingAttemptPlanAdmission.sameRequestIdentity original changedChoiceEvidence)
            "The request identity must not include its frozen projection decision"

        require
            (PendingAttemptPlanAdmission.samePhysicalAuthority original changedKind)
            "The physical authority must not include the request kind"

        require
            (not (PendingAttemptPlanAdmission.sameRequestIdentity original changedKind))
            "The request identity must include the request kind"

        require
            (not (PendingAttemptPlanAdmission.samePhysicalAuthority original changedPhysical))
            "Another physical message must not share physical authority"

        let summary = PendingAttemptPlanAdmission.requestIdentitySummary original
        require (summary.Contains("admission-session")) "The summary must identify the session"
        require (summary.Contains("admission-physical")) "The summary must identify the physical message"

        let observe admission =
            match admission with
            | PendingAttemptPlanAdmission.Admitted plan ->
                require (plan = original) "Admission must expose the admitted plan"
                "Admitted"
            | PendingAttemptPlanAdmission.ReplayedExisting plan ->
                require (plan = original) "Replay must expose the existing plan"
                "ReplayedExisting"
            | PendingAttemptPlanAdmission.IdentityMismatch(expectedSession, expectedPhysical, attempted) ->
                require
                    (expectedSession = session && expectedPhysical = physical)
                    "Mismatch must retain expected identity"

                require (attempted = changedPhysical) "Mismatch must retain the attempted plan"
                "IdentityMismatch"
            | PendingAttemptPlanAdmission.PlanConflict(existing, attempted) ->
                require (existing = original && attempted = changedKind) "Conflict must retain both plans"
                "PlanConflict"

        let outcomes =
            [ PendingAttemptPlanAdmission.Admitted original
              PendingAttemptPlanAdmission.ReplayedExisting original
              PendingAttemptPlanAdmission.IdentityMismatch(session, physical, changedPhysical)
              PendingAttemptPlanAdmission.PlanConflict(original, changedKind) ]
            |> List.map observe

        require
            (outcomes = [ "Admitted"; "ReplayedExisting"; "IdentityMismatch"; "PlanConflict" ])
            "The public admission contract must expose all four outcomes"
