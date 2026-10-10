namespace Wanxiangshu.Persistence.EventStore

open System
open System.Threading.Tasks
open Fable.Core
open Fable.Core.JsInterop
open FsToolkit.ErrorHandling
open Wanxiangshu.Foundation.Identity

/// durable-events-004/005/010/017.
/// Runtime truth is deliberately boring: one process owns one append-only NDJSON
/// file under the repository's git common-dir. Git object plumbing is not a
/// dependency of this module and therefore cannot leak into the local append path.
type ProcessEventLog =
    private
        { CommonDir: string
          WriterId: string
          FilePath: string }

type StoreFileGate internal (releaseFn: obj) =
    // DSL-MUTABLE: resource — physical one-shot release latch; not domain state.
    let mutable released = false

    member _.Release() =
        task {
            if not released then
                released <- true
                let release: unit -> Task<unit> = unbox releaseFn
                do! release ()
        }

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

    [<Import("default", "node:fs")>]
    let private nodeFs: obj = jsNative

    [<Import("default", "node:path")>]
    let private nodePath: obj = jsNative

    [<Emit("""
    (function(nodeFs, nodePath) {
        function isProcessAlive(pid) {
            if (typeof pid !== 'number' || pid <= 0 || isNaN(pid)) return false;
            try {
                process.kill(pid, 0);
                return true;
            } catch (e) {
                return e.code === 'EPERM';
            }
        }

        return Object.assign({}, nodeFs, {
            mkdir: function(dirPath, cb) {
                try {
                    nodeFs.mkdirSync(dirPath);
                    try {
                        nodeFs.writeFileSync(nodePath.join(dirPath, 'owner.json'), JSON.stringify({ pid: process.pid, time: Date.now() }));
                    } catch (_) {}
                    if (typeof cb === 'function') cb(null);
                } catch (err) {
                    if (typeof cb === 'function') cb(err);
                }
            },
            rmdir: function(dirPath, cb) {
                try {
                    nodeFs.rmSync(dirPath, { recursive: true, force: true });
                    if (typeof cb === 'function') cb(null);
                } catch (err) {
                    if (typeof cb === 'function') cb(err);
                }
            },
            rmdirSync: function(dirPath) {
                nodeFs.rmSync(dirPath, { recursive: true, force: true });
            },
            stat: function(dirPath, cb) {
                try {
                    var stat = nodeFs.statSync(dirPath);
                    try {
                        var ownerFile = nodePath.join(dirPath, 'owner.json');
                        if (nodeFs.existsSync(ownerFile)) {
                            var content = nodeFs.readFileSync(ownerFile, 'utf8');
                            var data = JSON.parse(content);
                            if (data && data.pid && !isProcessAlive(data.pid)) {
                                stat.mtime = new Date(0);
                                stat.mtimeMs = 0;
                            }
                        }
                    } catch (_) {}
                    if (typeof cb === 'function') cb(null, stat);
                } catch (err) {
                    if (typeof cb === 'function') cb(err);
                }
            }
        });
    })($0, $1)
    """)>]
    let private buildProcessAwareFs (nodeFs: obj) (nodePath: obj) : obj = jsNative

    let processAwareFs: obj = buildProcessAwareFs nodeFs nodePath

    [<Import("default", "proper-lockfile")>]
    let private lockfile: obj = jsNative

    [<Emit("$0($1, $2)")>]
    let private lockAsync (fn: obj) (path: string) (options: obj) : Task<obj> = jsNative

    [<Emit("($0 != null && $0.code === 'ELOCKED')")>]
    let private isLockContention (cause: exn) : bool = jsNative

    [<Import("setTimeout", "node:timers/promises")>]
    let private waitForLockRetry (milliseconds: int) : Task<unit> = jsNative

    [<Import("join", "node:path")>]
    let private join2 (a: string) (b: string) : string = jsNative

    [<Import("mkdirSync", "node:fs")>]
    let private mkdirSync (path: string) (options: obj) : unit = jsNative

    [<Import("existsSync", "node:fs")>]
    let private existsSync (path: string) : bool = jsNative

    [<Import("writeFileSync", "node:fs")>]
    let private writeTextFileSync (path: string) (content: string) (encoding: string) : unit = jsNative

    [<Import("writeFileSync", "node:fs")>]
    let private writeBytesFileSync (path: string) (content: byte[]) : unit = jsNative

    [<Import("appendFileSync", "node:fs")>]
    let private AppendAllText (path: string) (content: string) (encoding: string) : unit = jsNative

    [<Import("readFileSync", "node:fs")>]
    let private readBytesFileSync (path: string) : byte[] = jsNative

    [<Import("readFileSync", "node:fs")>]
    let private readTextFileSync (path: string) (encoding: string) : string = jsNative

    [<Import("readdirSync", "node:fs")>]
    let private readdirSync (path: string) : string[] = jsNative

    [<Import("statSync", "node:fs")>]
    let private statSync (path: string) : obj = jsNative

    [<Import("readSync", "node:fs")>]
    let private readSync (fd: int) (buffer: byte[]) (offset: int) (length: int) (position: int) : int = jsNative

    [<Import("unlinkSync", "node:fs")>]
    let private unlinkSync (path: string) : unit = jsNative

    [<Import("utimesSync", "node:fs")>]
    let private utimesSync (path: string) (atime: float) (mtime: float) : unit = jsNative

    [<Emit("Date.now()")>]
    let private currentTimeMs () : float = jsNative

    [<Emit("Date.parse($0)")>]
    let private parseDateMs (value: string) : float = jsNative

    [<Emit("Number.isFinite($0)")>]
    let private isFiniteNumber (value: float) : bool = jsNative

    [<Import("openSync", "node:fs")>]
    let private openSync (path: string) (flags: string) : int = jsNative

    [<Import("fsyncSync", "node:fs")>]
    let private fsyncSync (fd: int) : unit = jsNative

    [<Import("closeSync", "node:fs")>]
    let private closeSync (fd: int) : unit = jsNative

    [<Import("createHash", "node:crypto")>]
    let private createHash (algorithm: string) : obj = jsNative

    [<Emit("$0.update($1)")>]
    let private hashUpdate (hash: obj) (content: byte[]) : obj = jsNative

    [<Emit("$0.update($1, 'utf8')")>]
    let private hashUpdateText (hash: obj) (content: string) : obj = jsNative

    [<Emit("[$0.dev, $0.ino, $0.mode, $0.size, $0.mtimeMs, $0.ctimeMs].join(':')")>]
    let private statIdentity (stat: obj) : string = jsNative

    [<Emit("$0.mtimeMs")>]
    let private statMtimeMs (stat: obj) : float = jsNative

    /// Producer-side file activity is a millisecond observation carried by a
    /// nanosecond file clock: `utimes` cannot store an exact millisecond, so the
    /// raw readback is always slightly earlier than the value written. Quantize
    /// to whole milliseconds so the activity a replica publishes in
    /// `writer-manifest` round-trips through an import unchanged.
    let private fileActivityMs (stat: obj) : float = statMtimeMs stat |> round

    [<Emit("$0.size")>]
    let private statSize (stat: obj) : int = jsNative

    [<Emit("$0.dev")>]
    let private statDev (stat: obj) : float = jsNative

    [<Emit("$0.ino")>]
    let private statIno (stat: obj) : float = jsNative

    [<Emit("$0.digest('hex')")>]
    let private hashHex (hash: obj) : string = jsNative

    [<Literal>]
    let WanxiangshuRootName = "wanxiangshu"

    let private wanxiangDirectory commonDir = join2 commonDir WanxiangshuRootName

    let private eventsDirectory commonDir =
        join2 (wanxiangDirectory commonDir) "events"

    let private ensureDirectory path =
        mkdirSync path (createObj [ "recursive" ==> true ])

    type WriterPhysicalMetadata =
        { Name: string
          StatIdentity: string
          LastActivityMs: float }

    /// durable-convergence-011: writer retention is a UTC calendar-day group,
    /// not a rolling 24h window. A writer stays while its last-activity UTC date
    /// is today or yesterday; the day before and earlier are collected. The date
    /// is a GC grouping only — it carries no history meaning, and a writer's
    /// activity may move it to a later day.
    let private utcDayMilliseconds = 24.0 * 60.0 * 60.0 * 1000.0

    let utcDayOf (timeMs: float) = floor (timeMs / utcDayMilliseconds)

    let writerRetentionMilliseconds () = utcDayMilliseconds

    let isWriterActiveAt nowMs lastActivityMs =
        utcDayOf lastActivityMs >= utcDayOf nowMs - 1.0

    let private tryAcquireLock (target: string) (options: obj) waitStep : Task<obj option> =
        task {
            try
                let! release = lockAsync lockfile target options
                return Some release
            with cause when isLockContention cause ->
                let delay = min 150.0 (Math.Round(30.0 * Math.Pow(1.1, float waitStep))) |> int
                do! waitForLockRetry delay
                return None
        }

    /// Typed physical diagnosis: the store lock stayed contended past the
    /// acquisition budget. It carries no history meaning.
    exception StoreLockAcquireTimeout of attempts: int * waitedMs: float

    /// Total wall-clock budget for one physical lock acquisition. Each retry
    /// delay is already bounded; this bounds the whole wait so a stuck peer
    /// surfaces as a typed timeout instead of an unbounded block.
    let private storeLockAcquireBudgetMs = 30000.0

    let private acquireAvailableLock (target: string) : Task<obj> =
        task {
            let options =
                createObj
                    [ "fs" ==> processAwareFs
                      "realpath" ==> false
                      "stale" ==> 5000
                      "update" ==> 1500
                      "retries" ==> 0 ]

            // DSL-MUTABLE: resource — this acquisition's physical release capability.
            let mutable acquired: obj option = None
            // DSL-MUTABLE: algorithm-scratch — index in the original ten-delay retry cycle.
            let mutable waitStep = 0
            // DSL-MUTABLE: algorithm-scratch — bounded acquisition attempt count.
            let mutable attempts = 0
            let started = currentTimeMs ()

            while acquired.IsNone && currentTimeMs () - started < storeLockAcquireBudgetMs do
                let! release = tryAcquireLock target options waitStep
                acquired <- release
                waitStep <- (waitStep + 1) % 10
                attempts <- attempts + 1

            match acquired with
            | Some release -> return release
            | None -> return raise (StoreLockAcquireTimeout(attempts, currentTimeMs () - started))
        }

    /// Cross-process physical serialization shared by runtime append and the
    /// standalone Git-hook synchronizer. It protects bytes/snapshot boundaries
    /// only; it is not durable/domain state and contains no history meaning.
    let acquireStoreLock (commonDir: string) : Task<StoreFileGate> =
        task {
            let target = wanxiangDirectory commonDir
            ensureDirectory target
            let! release = acquireAvailableLock target
            return new StoreFileGate(release)
        }

    /// Resource CE for the physical cross-process gate. Completion of the
    /// returned Task includes completion of proper-lockfile release; no
    /// heartbeat/retry handle may escape the operation boundary.
    let withStoreLock (commonDir: string) (work: unit -> Task<'T>) : Task<'T> =
        task {
            let! gate = acquireStoreLock commonDir

            try
                let! result = work ()
                do! gate.Release()
                return result
            with ex ->
                do! gate.Release()
                return raise ex
        }

    let private safeWriterId (writerId: string) =
        if String.IsNullOrWhiteSpace writerId then
            invalidArg "writerId" "WriterId is required"
        elif writerId.IndexOfAny([| '/'; '\\' |]) >= 0 || writerId = "." || writerId = ".." then
            invalidArg "writerId" "WriterId must be one path segment"
        else
            writerId

    let create (commonDir: string) (writerId: string) : ProcessEventLog =
        if String.IsNullOrWhiteSpace commonDir then
            invalidArg "commonDir" "git common-dir is required"

        let writer = safeWriterId writerId
        let path = join2 (eventsDirectory commonDir) (writer + ".ndjson")

        { CommonDir = commonDir
          WriterId = writer
          FilePath = path }

    let writerId (log: ProcessEventLog) = log.WriterId

    let filePath (log: ProcessEventLog) = log.FilePath

    let private tryAppendFault phase action =
        try
            Ok(action ())
        with cause ->
            Error { Phase = phase; Cause = cause }

    let private closeAfterBarrier fd barrier =
        let closed = tryAppendFault AppendPhase.DurabilityClose (fun () -> closeSync fd)

        match barrier, closed with
        | Ok(), Ok() -> Ok PhysicalAppendCompletion.AppendDurable
        | Error primary, Ok() -> Error(PhysicalAppendFailure.AfterAppend(primary, []))
        | Ok(), Error primary -> Error(PhysicalAppendFailure.AfterAppend(primary, []))
        | Error primary, Error cleanup -> Error(PhysicalAppendFailure.AfterAppend(primary, [ cleanup ]))

    let private appendDurabilityBarrier path =
        match tryAppendFault AppendPhase.DurabilityOpen (fun () -> openSync path "r+") with
        | Error primary -> Error(PhysicalAppendFailure.AfterAppend(primary, []))
        | Ok fd ->
            tryAppendFault AppendPhase.DurabilityBarrier (fun () -> fsyncSync fd)
            |> closeAfterBarrier fd

    let private durabilityBarrier path =
        let fd = openSync path "r+"

        try
            fsyncSync fd
        finally
            closeSync fd

    let private appendBytes (log: ProcessEventLog) text =
        match tryAppendFault AppendPhase.PhysicalAppend (fun () -> AppendAllText log.FilePath text "utf8") with
        | Error primary -> Error(PhysicalAppendFailure.AfterAppend(primary, []))
        | Ok() -> appendDurabilityBarrier log.FilePath

    let private appendEncoded (log: ProcessEventLog) text =
        match
            tryAppendFault AppendPhase.BeforePhysicalAppend (fun () -> ensureDirectory (eventsDirectory log.CommonDir))
        with
        | Error primary -> Error(PhysicalAppendFailure.BeforeAppend primary)
        | Ok() -> appendBytes log text

    /// One semantic append = one sequence of complete canonical JSON+LF lines.
    /// Existing bytes are never read or rewritten.
    let append
        (log: ProcessEventLog)
        (events: EventEnvelope list)
        : Result<PhysicalAppendCompletion, PhysicalAppendFailure> =
        let encoded =
            tryAppendFault AppendPhase.BeforePhysicalAppend (fun () ->
                events
                |> List.map (EventEnvelope.normalize >> CanonicalEventCodec.encode)
                |> String.concat "")

        match encoded with
        | Error primary -> Error(PhysicalAppendFailure.BeforeAppend primary)
        | Ok "" -> Ok PhysicalAppendCompletion.NoAppend
        | Ok text -> appendEncoded log text

    let private decodeWriterLine (label: string) (line: string) : Result<EventEnvelope, StorageInvalid> =
        if String.IsNullOrEmpty line then
            Error(StorageInvalid.NonCanonical(sprintf "writer file contains empty interior line: %s" label))
        else
            CanonicalEventCodec.tryDecode (line + "\n")

    let private decodeWriterLines (label: string) (lines: string[]) : Result<EventEnvelope list, StorageInvalid> =
        // DSL-MUTABLE: algorithm-scratch — stack depth must not scale with writer history length.
        let mutable acc: EventEnvelope list = []
        let mutable failure: StorageInvalid option = None
        // DSL-MUTABLE: algorithm-scratch — writer-line cursor
        let mutable index = 0

        let advance () =
            match decodeWriterLine label lines.[index] with
            | Ok envelope ->
                acc <- envelope :: acc
                index <- index + 1
            | Error invalid -> failure <- Some invalid

        while index < lines.Length - 1 && failure.IsNone do
            advance ()

        match failure with
        | Some invalid -> Error invalid
        | None -> Ok(List.rev acc)

    let decodeWriterText (label: string) (text: string) : Result<EventEnvelope list, StorageInvalid> =
        if String.IsNullOrEmpty text then
            Ok []
        elif not (text.EndsWith("\n", StringComparison.Ordinal)) then
            Error(StorageInvalid.NonCanonical(sprintf "writer file has incomplete trailing line: %s" label))
        else
            decodeWriterLines label (text.Split('\n'))

    let decodeWriterBytes (label: string) (bytes: byte[]) : Result<EventEnvelope list, StorageInvalid> =
        CanonicalEventCodec.tryDecodeUtf8Text bytes
        |> Result.bind (decodeWriterText label)

    let private decodeFile (path: string) : Result<EventEnvelope list, StorageInvalid> =
        decodeWriterBytes path (readBytesFileSync path)

    type private WriterDecodeCacheEntry =
        { Dev: float
          Ino: float
          StatIdentity: string
          ByteLength: int
          Events: EventEnvelope list }

    /// durable-events-014/017: a process-local decoded-prefix cache. A writer file
    /// is append-only and owned by one process (durable-events-005), so a decode
    /// for an exact (dev, ino, length) is reused verbatim, and a same-inode
    /// extension decodes only the appended complete lines. The cache is never a
    /// second authority: every entry comes from the canonical decoder, and the
    /// Integrator still derives Current from the returned envelopes.
    // DSL-MUTABLE: resource — process-local decoded writer prefix keyed by path.
    let private writerDecodeCache =
        System.Collections.Generic.Dictionary<string, WriterDecodeCacheEntry>()

    let private pruneDecodeCache () =
        writerDecodeCache.Keys
        |> Seq.filter (fun path -> not (existsSync path))
        |> Seq.toList
        |> List.iter (fun path -> writerDecodeCache.Remove path |> ignore)

    let private storeDecodeCache path dev ino identity size events =
        writerDecodeCache.[path] <-
            { Dev = dev
              Ino = ino
              StatIdentity = identity
              ByteLength = size
              Events = events }

    let private lastIndexOfLf (buffer: byte[]) count =
        buffer
        |> Array.take count
        |> Array.tryFindIndexBack ((=) 10uy)
        |> Option.defaultValue -1

    let private readRequiredChunk fd bytes offset count position =
        let read = readSync fd bytes offset count position

        if read <= 0 then
            failwith "unexpected EOF while reading writer tail"
        else
            read

    let private readExactAt fd position length =
        let bytes = Array.zeroCreate<byte> length
        // DSL-MUTABLE: algorithm-scratch — bytes already filled by positional reads.
        let mutable filled = 0

        while filled < length do
            filled <- filled + readRequiredChunk fd bytes filled (length - filled) (position + filled)

        bytes

    type private TailLine = { Start: int; Text: string }

    type private ReverseBlock =
        | LocatedLineStart of int
        | ContinueBefore of int

    let private scanReverseBlock fd blockSize cursor =
        let start = max 0 (cursor - blockSize)
        let length = cursor - start

        let delimiter =
            readExactAt fd start length |> fun buffer -> lastIndexOfLf buffer length

        if delimiter >= 0 then
            ReverseBlock.LocatedLineStart(start + delimiter + 1)
        elif start = 0 then
            ReverseBlock.LocatedLineStart 0
        else
            ReverseBlock.ContinueBefore start

    let private locateLineStart fd lineEnd =
        let blockSize = 4096
        // DSL-MUTABLE: algorithm-scratch — reverse pread search carries only the next byte boundary.
        let mutable search = ReverseBlock.ContinueBefore lineEnd

        let isSearching () =
            match search with
            | ReverseBlock.ContinueBefore _ -> true
            | ReverseBlock.LocatedLineStart _ -> false

        let advance () =
            let cursor =
                match search with
                | ReverseBlock.ContinueBefore value -> value
                | ReverseBlock.LocatedLineStart value -> value

            search <- scanReverseBlock fd blockSize cursor

        while isSearching () do
            advance ()

        match search with
        | ReverseBlock.LocatedLineStart lineStart -> lineStart
        | ReverseBlock.ContinueBefore _ -> lineEnd

    let private readTailLine fd path lineEnd lineStart =
        let length = lineEnd - lineStart

        if length <= 0 then
            Error(sprintf "writer file contains empty final line: %s" path)
        else
            readExactAt fd lineStart length
            |> CanonicalEventCodec.tryDecodeUtf8Text
            |> Result.mapError (fun _ -> sprintf "writer file contains invalid UTF-8: %s" path)
            |> Result.map (fun text -> { Start = lineStart; Text = text })

    let private readCompleteLineBefore fd path lineEnd : Result<TailLine, string> =
        if lineEnd <= 0 then
            Error(sprintf "writer file contains empty final line: %s" path)
        else
            locateLineStart fd lineEnd |> readTailLine fd path lineEnd

    let private tryPhysical action onError =
        try
            action ()
        with ex ->
            onError ex

    let private withReadFd path onError action =
        let fd = openSync path "r"

        try
            tryPhysical (fun () -> action fd) onError
        finally
            closeSync fd

    /// durable-events-014/017: decode a writer through the process-local prefix
    /// cache. An exact (dev, ino, mode, size, mtime, ctime) hit reuses the decoded
    /// envelopes verbatim; a same-inode extension decodes only the appended
    /// complete lines; any other change (truncation, replacement, rewrite) falls
    /// back to the canonical full decode. The cache never becomes a second
    /// authority: entries only ever hold canonical decoder output, and a miss or
    /// changed stat always re-reads the file.
    let private decodeFileCached (path: string) : Result<EventEnvelope list, StorageInvalid> =
        let stat = statSync path
        let dev = statDev stat
        let ino = statIno stat
        let identity = statIdentity stat
        let size = statSize stat

        let fullDecode () =
            decodeFile path
            |> Result.map (fun events ->
                storeDecodeCache path dev ino identity size events
                events)

        let incrementalDecode (cached: WriterDecodeCacheEntry) =
            result {
                let! bytes =
                    withReadFd
                        path
                        (fun ex -> Error(StorageInvalid.NonCanonical(sprintf "writer read failed: %s" ex.Message)))
                        (fun fd -> Ok(readExactAt fd cached.ByteLength (size - cached.ByteLength)))

                let! text = CanonicalEventCodec.tryDecodeUtf8Text bytes
                let! appendedEvents = decodeWriterText path text
                let events = cached.Events @ appendedEvents
                storeDecodeCache path dev ino identity size events
                return events
            }

        match writerDecodeCache.TryGetValue path with
        | true, cached when cached.StatIdentity = identity -> Ok cached.Events
        | true, cached when cached.Dev = dev && cached.Ino = ino && cached.ByteLength < size -> incrementalDecode cached
        | _ -> fullDecode ()

    let private nonEmptyFileSize path =
        let exists = existsSync path
        let size = if exists then statSync path |> statSize else 0

        match exists, size with
        | false, _
        | true, 0 -> None
        | true, value -> Some value

    let private readLastLineFromFd path size fd =
        let trailing = readExactAt fd (size - 1) 1

        if trailing.[0] <> 10uy then
            Error(sprintf "writer file has incomplete trailing line: %s" path)
        else
            readCompleteLineBefore fd path (size - 1)
            |> Result.map (fun line -> Some line.Text)

    /// Exact O(last-line-bytes) NDJSON tail lookup. The scan searches raw LF bytes
    /// backwards with positional reads; UTF-8 boundaries do not matter because an
    /// unescaped LF cannot occur inside a valid JSON string.
    let readLastCompleteLine (path: string) : Result<string option, string> =
        nonEmptyFileSize path
        |> Option.map (fun size -> withReadFd path (fun ex -> Error ex.Message) (readLastLineFromFd path size))
        |> Option.defaultValue (Ok None)

    type private TailActivity =
        | JournalActivity of float
        | ProjectionCutTail
        | NoDurableActivity

    let private tryParseJson line =
        try
            Some(JS.JSON.parse line)
        with _ ->
            None

    let private observedJournalActivity (value: obj) =
        let payload: obj = value?payload

        let observedAt =
            if isNull payload || isNull payload?ObservedAt then
                None
            else
                Some(parseDateMs (unbox<string> payload?ObservedAt))

        observedAt
        |> Option.filter isFiniteNumber
        |> Option.map TailActivity.JournalActivity
        |> Option.defaultValue TailActivity.NoDurableActivity

    let private classifyParsedTail (value: obj) =
        let eventType =
            if isNull value?event_type then
                ""
            else
                unbox<string> value?event_type

        match eventType with
        | "JournalEnvelope" -> observedJournalActivity value
        | "ProjectionCutTail" -> TailActivity.ProjectionCutTail
        | _ -> TailActivity.NoDurableActivity

    let private classifyTailActivity (line: string) =
        tryParseJson line
        |> Option.map classifyParsedTail
        |> Option.defaultValue TailActivity.NoDurableActivity

    type private TailSearch =
        | SearchBefore of int
        | ResolvedActivity of float option

    let private decideTailSearch (line: TailLine) =
        match classifyTailActivity line.Text with
        | TailActivity.JournalActivity observedAt -> TailSearch.ResolvedActivity(Some observedAt)
        | TailActivity.ProjectionCutTail when line.Start > 0 -> TailSearch.SearchBefore(line.Start - 1)
        | TailActivity.ProjectionCutTail
        | TailActivity.NoDurableActivity -> TailSearch.ResolvedActivity None

    let private advanceTailSearch fd path lineEnd =
        readCompleteLineBefore fd path lineEnd
        |> Result.map decideTailSearch
        |> Result.defaultValue (TailSearch.ResolvedActivity None)

    let private findDurableActivity fd path lineEnd =
        // DSL-MUTABLE: algorithm-scratch — finite reverse scan position/result.
        let mutable search = TailSearch.SearchBefore lineEnd

        let isSearching () =
            match search with
            | TailSearch.SearchBefore _ -> true
            | TailSearch.ResolvedActivity _ -> false

        let advance () =
            let lineEnd =
                match search with
                | TailSearch.SearchBefore value -> value
                | TailSearch.ResolvedActivity _ -> 0

            search <- advanceTailSearch fd path lineEnd

        while isSearching () do
            advance ()

        match search with
        | TailSearch.ResolvedActivity activity -> activity
        | TailSearch.SearchBefore _ -> None

    let private durableActivityFromFd path size fd =
        let trailing = readExactAt fd (size - 1) 1

        if trailing.[0] = 10uy then
            findDurableActivity fd path (size - 1)
        else
            None

    /// Journal envelopes carry their producer observation time in durable bytes.
    /// A trailing ProjectionCutTail is integrator metadata for the immediately
    /// preceding fact, so it does not advance process activity by itself.
    let private durableTailActivity path : float option =
        nonEmptyFileSize path
        |> Option.bind (fun size -> withReadFd path (fun _ -> None) (durableActivityFromFd path size))

    let private writerFileNames commonDir =
        let directory = eventsDirectory commonDir

        if not (existsSync directory) then
            []
        else
            readdirSync directory
            |> Array.filter (fun name -> name.EndsWith(".ndjson", StringComparison.Ordinal))
            |> Array.sort
            |> Array.toList

    let private fingerprintFiles hash label directory names =
        names
        |> List.iter (fun name ->
            let identity = statSync (join2 directory name) |> statIdentity

            hashUpdateText hash (label + "\u0000" + name + "\u0000" + identity + "\n")
            |> ignore)

    let private physicalStats directory names =
        names
        |> List.map (fun name -> name, statSync (join2 directory name) |> statIdentity)

    let private writerMetadata directory names =
        names
        |> List.map (fun name ->
            let path = join2 directory name
            let stat = statSync path

            { Name = name
              StatIdentity = statIdentity stat
              LastActivityMs = durableTailActivity path |> Option.defaultValue (fileActivityMs stat) })

    /// Git-index-style physical cache key. It never replaces canonical validation:
    /// a cache miss falls back to reading bytes, while a hit only reuses a snapshot
    /// that has already been validated/materialized for the exact same file stats.
    let physicalFingerprint (commonDir: string) : string =
        let hash = createHash "sha256"
        fingerprintFiles hash "writers" (eventsDirectory commonDir) (writerFileNames commonDir)
        hashHex hash

    let writerPhysicalStats (commonDir: string) : (string * string) list =
        writerFileNames commonDir |> physicalStats (eventsDirectory commonDir)

    let writerPhysicalMetadata (commonDir: string) : WriterPhysicalMetadata list =
        writerFileNames commonDir |> writerMetadata (eventsDirectory commonDir)

    let readWriterFileBytes (commonDir: string) (name: string) : byte[] =
        readBytesFileSync (join2 (eventsDirectory commonDir) name)

    let private writeExtendedWriter (path: string) (existing: string) (incoming: string) =
        if incoming.Length > existing.Length then
            writeTextFileSync path incoming "utf8"
            durabilityBarrier path

    let private setWriterActivity path activityMs =
        let seconds = activityMs / 1000.0
        utimesSync path seconds seconds

    let private currentWriterActivity path = statSync path |> fileActivityMs

    let private someWhen condition value = if condition then Some value else None

    /// Equal bytes describe the same process output, so activity converges
    /// monotonically toward the earlier observation. An ordinary snapshot already
    /// carries the identical value, and rewriting the identical activity would churn
    /// the file's stat identity and force a needless blob rewrite on the next
    /// materialization, so only a strictly earlier remote observation is a rewrite.
    let private earlierRemoteActivity current remote = someWhen (remote < current) remote

    let private reconcileEqualWriterActivity path incomingActivity =
        incomingActivity
        |> Option.bind (fun remote -> earlierRemoteActivity (currentWriterActivity path) remote)
        |> Option.iter (setWriterActivity path)

    /// Merge one whole writer while preserving the producer's activity time from
    /// the remote snapshot. A fetch/import must never make an old writer look new.
    let mergeWriterTextWithActivity
        (commonDir: string)
        (writerId: string)
        (incoming: string)
        (incomingActivityMs: float option)
        : Result<unit, string> =
        let writer = safeWriterId writerId
        let directory = eventsDirectory commonDir
        ensureDirectory directory
        let path = join2 directory (writer + ".ndjson")
        let exists = existsSync path

        result {
            let! existing =
                if exists then
                    readBytesFileSync path
                    |> CanonicalEventCodec.tryDecodeUtf8Text
                    |> Result.mapError (fun _ -> sprintf "writer history is not valid UTF-8: %s" writer)
                else
                    Ok ""

            if existing = incoming then
                someWhen exists path
                |> Option.iter (fun _ -> reconcileEqualWriterActivity path incomingActivityMs)
            elif incoming.StartsWith(existing, StringComparison.Ordinal) then
                writeExtendedWriter path existing incoming
                incomingActivityMs |> Option.iter (setWriterActivity path)
            elif not (existing.StartsWith(incoming, StringComparison.Ordinal)) then
                return! Error(sprintf "writer history diverged: %s" writer)
        }

    /// Replace/import one writer file only when the incoming bytes extend the
    /// local complete-line prefix. Divergence is fail-closed physical corruption.
    let mergeWriterText (commonDir: string) (writerId: string) (incoming: string) : Result<unit, string> =
        mergeWriterTextWithActivity commonDir writerId incoming None

    let removeWriterFile (commonDir: string) (name: string) : unit =
        if name.EndsWith(".ndjson", StringComparison.Ordinal) then
            let path = join2 (eventsDirectory commonDir) name
            someWhen (existsSync path) path |> Option.iter unlinkSync
        else
            invalidArg "name" "writer filename must end in .ndjson"

    /// Frozen retained writer streams, sorted only by WriterId for deterministic
    /// enumeration. Retention is whole-writer physical policy; the canonical
    /// Integrator still owns cross-stream ordering and interpretation.
    let readStreamsAt (commonDir: string) (nowMs: float) : Result<(string * EventEnvelope list) list, StorageInvalid> =
        pruneDecodeCache ()

        let rec read remaining acc =
            result {
                match remaining with
                | [] -> return List.rev acc
                | name :: tail ->
                    let path = join2 (eventsDirectory commonDir) name
                    let! events = decodeFileCached path
                    let writer = name.Substring(0, name.Length - ".ndjson".Length)
                    return! read tail ((writer, events) :: acc)
            }

        writerPhysicalMetadata commonDir
        |> List.filter (fun writer -> isWriterActiveAt nowMs writer.LastActivityMs)
        |> List.map (fun writer -> writer.Name)
        |> fun names -> read names []

    let readStreams (commonDir: string) : Result<(string * EventEnvelope list) list, StorageInvalid> =
        readStreamsAt commonDir (currentTimeMs ())

    /// Public content digest for inline payload staging (durable-events-012).
    /// The digest IS the PayloadRef content address.
    let payloadDigest (content: byte[]) : string =
        createHash "sha256" |> fun hash -> hashUpdate hash content |> hashHex
