namespace Wanxiangshu.Persistence.Journal

open System
open System.Threading.Tasks

/// Plain-data revision subscription surface for the opaque journal capability.
/// The journal and envelope stay behind this boundary; callers receive only the
/// revision and canonical line needed to observe one successful fold.
[<RequireQualifiedAccess>]
module JournalRevisionSurface =
    /// Operate real subscriptions and observe their Fable waiter/listener counts.
    /// The retained journal permits a close-then-subscribe rejection check.
    val observeWaits: handle: JournalHandle -> obj

    /// Current projection revision as an integer.
    val revision: handle: JournalHandle -> int

    /// Await one journal change from a given revision, returning a boxed revision
    /// and canonical envelope.
    val awaitChangeFrom: fromRevision: int64 -> handle: JournalHandle -> Task<obj>

    /// Confirm that cancellation stops the wait before a change arrives.
    val awaitCancelled: fromRevision: int64 -> handle: JournalHandle -> Task<bool>
