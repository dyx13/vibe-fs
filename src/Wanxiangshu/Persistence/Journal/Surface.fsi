namespace Wanxiangshu.Persistence.Journal

open System.Threading.Tasks

/// Opaque capability for one journal projection and its local writer.
type JournalHandle =
    private new: journal: AgentJournal * release: (unit -> unit) -> JournalHandle
    member internal Journal: AgentJournal
    member internal Dispose: unit -> unit
    static member internal Create: journal: AgentJournal -> JournalHandle
    static member internal CreateShared: journal: AgentJournal -> JournalHandle

[<RequireQualifiedAccess>]
module JournalSurface =
    val mapAppendFailure: value: obj -> obj

    val bootWithWriterId:
        commonDir: string -> writerId: string -> runtimeId: string -> processId: int -> startedAt: string -> Task<obj>

    val boot: commonDir: string -> runtimeId: string -> processId: int -> startedAt: string -> Task<obj>
    val acquireSharedForWorkspace: workspace: string -> processId: int -> startedAt: string -> Task<obj>
    val dispose: handle: JournalHandle -> unit
    val runtimeId: handle: JournalHandle -> string
    val pendingDeferredWork: handle: JournalHandle -> session: string -> obj
    val deferredWorkWasConsumed: handle: JournalHandle -> session: string -> occurrence: string -> bool
    val appendAgent: handle: JournalHandle -> stream: obj -> run: obj -> fact: obj -> Task<obj>
    val appendManagerLifecycle: handle: JournalHandle -> stream: obj -> factObj: obj -> Task<obj>
    val writePayload: handle: JournalHandle -> content: string -> Task<obj>
    val readPayload: handle: JournalHandle -> reference: string -> Task<obj>
    val snapshot: handle: JournalHandle -> obj
    val hasSession: handle: JournalHandle -> sessionId: string -> bool
