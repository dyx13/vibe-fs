module UnifiedStore.DualWriteFixture

open Wanxiangshu.Infrastructure.Persist
open Wanxiangshu.Journal

/// P4U2 dual-write RED fixture: same production module must not write EventStore AND Journal NDJSON.
/// Live Journal-only modules remain OK until Phase 5; EventStore-only OK.
module DualWriteBridge =
    let writeBoth (store: IEventStore) (journal: AgentJournal) events fact =
        store.Append events |> ignore
        journal.AppendAgent fact |> ignore
        let legacyPath = "wanxiangshu/runtimes/x.ndjson"
        ignore legacyPath
