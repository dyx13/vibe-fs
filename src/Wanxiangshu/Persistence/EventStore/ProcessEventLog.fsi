namespace Wanxiangshu.Persistence.EventStore

open System.Threading.Tasks

[<Sealed>]
type ProcessEventLog

[<Class>]
type StoreFileGate =
    member Release: unit -> Task<unit>

[<RequireQualifiedAccess>]
module ProcessEventLog =
    [<RequireQualifiedAccess>]
    type PhysicalAppendCompletion =
        | NoAppend
        | AppendDurable

    [<RequireQualifiedAccess>]
    type PhysicalAppendFailure =
        | BeforeAppend of AppendFault
        | AfterAppend of primary: AppendFault * cleanupFailures: AppendFault list

    [<Literal>]
    val WanxiangshuRootName: string = "wanxiangshu"

    type WriterPhysicalMetadata =
        { Name: string
          StatIdentity: string
          LastActivityMs: float }

    val processAwareFs: obj
    val acquireStoreLock: commonDir: string -> Task<StoreFileGate>
    val withStoreLock<'T> : commonDir: string -> work: (unit -> Task<'T>) -> Task<'T>
    val create: commonDir: string -> writerId: string -> ProcessEventLog
    val writerId: log: ProcessEventLog -> string
    val filePath: log: ProcessEventLog -> string

    val append:
        log: ProcessEventLog -> events: EventEnvelope list -> Result<PhysicalAppendCompletion, PhysicalAppendFailure>

    val decodeWriterText: label: string -> text: string -> Result<EventEnvelope list, StorageInvalid>
    val decodeWriterBytes: label: string -> bytes: byte[] -> Result<EventEnvelope list, StorageInvalid>
    val readLastCompleteLine: path: string -> Result<string option, string>
    val writerRetentionMilliseconds: unit -> float
    val utcDayOf: timeMs: float -> float
    val isWriterActiveAt: nowMs: float -> lastActivityMs: float -> bool
    val physicalFingerprint: commonDir: string -> string
    val writerPhysicalStats: commonDir: string -> (string * string) list
    val writerPhysicalMetadata: commonDir: string -> WriterPhysicalMetadata list
    val readWriterFileBytes: commonDir: string -> name: string -> byte[]

    val mergeWriterTextWithActivity:
        commonDir: string ->
        writerId: string ->
        incoming: string ->
        incomingActivityMs: float option ->
            Result<unit, string>

    val mergeWriterText: commonDir: string -> writerId: string -> incoming: string -> Result<unit, string>
    val removeWriterFile: commonDir: string -> name: string -> unit
    val readStreamsAt: commonDir: string -> nowMs: float -> Result<(string * EventEnvelope list) list, StorageInvalid>
    val readStreams: commonDir: string -> Result<(string * EventEnvelope list) list, StorageInvalid>
    val payloadDigest: content: byte[] -> string
