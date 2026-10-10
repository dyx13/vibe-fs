namespace Wanxiangshu.Verification

open System.Threading.Tasks

/// Port observation-timing proofs: each scenario drives a real AgentJournal
/// over a real filesystem EventStore and observes through the production
/// AgentJournalPortAdapter members — never a copy of the adapter or fold.
[<RequireQualifiedAccess>]
module JournalPortObservationSurface =

    val withAppendRefusal:
        handle: Wanxiangshu.Persistence.Journal.JournalHandle ->
        target: string ->
        action: (unit -> Task<obj>) ->
            Task<obj>

    /// Call-time reads: a port built before an append observes the new state on
    /// the very next member call; a port built after it observes the same.
    val liveReadScenario: commonDir: string -> writerTag: string -> Task<obj>

    /// One CommitHandle must move every related view together: while the
    /// physical append is parked mid-commit every member still reads the
    /// pre-commit state, and after release all of them read post-commit.
    val sameCommitViewScenario: commonDir: string -> writerTag: string -> Task<obj>

    /// check-then-subscribe: a waiter registered at an old revision wakes on the
    /// next committed fact with no polling or sleep in the observed direction.
    val revisionWaitScenario: commonDir: string -> writerTag: string -> Task<obj>

    /// A cancelled waiter unregisters and resolves to None without consuming a
    /// later committed change.
    val cancelWaiterScenario: commonDir: string -> writerTag: string -> Task<obj>

    /// A missing payload is a known storage rejection. The writer preserves that
    /// exact first failure, publishes no revision, and refuses subsequent appends.
    val rejectedPayloadPoisonsWriterScenario: commonDir: string -> writerTag: string -> Task<obj>

    val openActualJournal: commonDir: string -> writerId: string -> startedAt: string -> Task<obj>
    val openActualJournalWithStore: store: obj -> writerId: string -> startedAt: string -> Task<obj>
    val observeActualJournalProjection: value: obj -> obj
    val observeActualJournal: value: obj -> obj
    val containsActualJournalEvent: value: obj -> eventId: string -> bool
    val appendActualJournal: value: obj -> Task<obj>
    val disposeActualJournal: value: obj -> Task<unit>
