namespace Wanxiangshu.Composition.Durable

open Wanxiangshu.Context.Prefix
open Wanxiangshu.Context.Trace
open Wanxiangshu.Execution.Session
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.Host
open Wanxiangshu.Interaction.Authority
open Wanxiangshu.Interaction.Dispatch
open Wanxiangshu.Participant.Provider.Attempt.Fallback
open Wanxiangshu.Persistence.Journal
open Wanxiangshu.Persistence.Journal.JournalOutcome

[<RequireQualifiedAccess>]
module PrefixJournalAdapter =
    let create (failurePort: ProviderFailureJournalPort) (journal: AgentJournal) : WireJournalPort =
        { ReadView =
            fun sessionId ->
                let snapshot = AgentJournal.snapshot journal
                let projections = snapshot.AgentProjections
                let sessionProj = AgentProjection.tryFind sessionId projections

                let isComp =
                    SessionAssociationProjection.isCompanion sessionId projections.Associations

                let activeProf =
                    PromptAuthorityProjectionQueries.activeProfile sessionId projections

                let failState = sessionProj |> Option.bind (fun session -> session.ProviderFailures)

                let wireState =
                    sessionProj
                    |> Option.map (fun session ->
                        { XTrace = session.XTrace
                          Blog = session.Blog
                          PrefixEpoch = session.PrefixEpoch
                          TodoCheckpoints =
                            projections.TodoCheckpoints
                            |> Map.tryFind sessionId
                            |> Option.defaultValue PhaseWindow.emptyWindow })

                { State = wireState
                  IsCompanion = isComp
                  ActiveAuthorityProfile = activeProf
                  ProviderFailureState = failState
                  AcceptedOrigin =
                    fun physical ->
                        let key: Wanxiangshu.Execution.Session.ChatExecution.ChatExecutionKey =
                            { SessionId = sessionId
                              PhysicalUserMessageId = physical }

                        projections.ChatExecutions
                        |> Wanxiangshu.Execution.Session.ChatExecution.ChatExecutionProjection.byKey key
                        |> Option.map _.origin }
          Candidate =
            { Hash = HostDigest.sha256Hex
              Materialize =
                fun opening frames ->
                    Wanxiangshu.Mission.WorkRecord.LifecycleWorkRecord.materialize opening frames "" false
              ReadBlob = fun blobRef -> journal.Writer.BlobWriter.Read blobRef
              WriteBlob =
                fun content ->
                    task {
                        let! result = journal.WriteBlob content

                        return
                            result
                            |> Result.map (fun receipt ->
                                ({ BlobRef = receipt.BlobRef
                                   BlobDigest = receipt.BlobDigest }
                                : WireBlobRecord))
                    } }
          CurrentProjection = fun xTrace -> XTraceMaterialization.currentProjection journal xTrace
          RecordConfirmedSuccess = ProviderFailureLedger.recordConfirmedSuccess failurePort
          CommitPrefixRebase =
            fun sessionId providerRun rebase ->
                task {
                    let fact =
                        ContextFact.PrefixRebaseCommitted
                            {| SessionId = sessionId
                               PreviousEpochId = rebase.PreviousEpochId
                               NextEpochId = rebase.NextEpochId
                               FrozenRecordPrefixRef = rebase.FrozenRecordPrefixRef
                               FrozenRecordPrefixDigest = rebase.FrozenRecordPrefixDigest
                               CutoffExclusive = rebase.CutoffExclusive
                               CoveredPrefixDigest = rebase.CoveredPrefixDigest
                               SealRoot = rebase.SealRoot
                               SyntheticMessageId = rebase.SyntheticMessageId
                               ProbeId = rebase.ProbeId
                               SolvingProviderRun = providerRun |}

                    let! appended =
                        AgentJournal.appendAgent (StreamId.Session sessionId) (Some providerRun) fact journal

                    return appended |> Result.map ignore |> Result.mapError JournalAppendFailure.describe
                } }
