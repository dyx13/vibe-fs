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
          SegmentCap: int
          // DSL-MUTABLE: resource — the events-directory file name this writer
          // currently appends to (a durable-events-005 segment name, or the
          // legacy suffixless name until materialization reorganizes it). A
          // vanished target re-enumerates the series on the next append.
          mutable CurrentFile: string }

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
        { WriterId: string
          FileNames: string list
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

    /// durable-events-005: the single-segment byte ceiling. 64 MiB leaves
    /// headroom under the GitHub 100 MiB hard limit for an oversized single
    /// line that occupies its own segment.
    [<Literal>]
    let DefaultSegmentCapBytes = 67108864

    type private SegmentCapState = { mutable Override: int option }

    // DSL-MUTABLE: resource — test-injected segment cap for the
    // materialization boundary; production always reads the default.
    let private segmentCapState = { Override = None }

    let internal segmentCapBytes () =
        match segmentCapState.Override with
        | Some cap -> cap
        | None -> DefaultSegmentCapBytes

    /// Run one synchronous materialization-boundary operation under an
    /// injected segment cap. The append path carries its cap inside the
    /// ProcessEventLog record instead, so a handle keeps its cap for its
    /// whole lifecycle.
    let internal withSegmentCap (cap: int) (work: unit -> 'T) : 'T =
        let previous = segmentCapState.Override
        segmentCapState.Override <- Some cap

        try
            work ()
        finally
            segmentCapState.Override <- previous

    /// Run one asynchronous convergence pass under an injected segment cap;
    /// the override spans every await of the pass.
    let internal withSegmentCapTask (cap: int) (work: unit -> Task<'T>) : Task<'T> =
        task {
            let previous = segmentCapState.Override
            segmentCapState.Override <- Some cap

            try
                return! work ()
            finally
                segmentCapState.Override <- previous
        }

    let private segmentFileOf (writerId: string) (ordinal: int) =
        writerId + "-" + (sprintf "%04d" ordinal) + ".ndjson"

    let private legacyFileOf (writerId: string) = writerId + ".ndjson"

    let private endsWithSegmentSuffix (writerId: string) =
        writerId.Length >= 5
        && writerId.[writerId.Length - 5] = '-'
        && writerId.Substring(writerId.Length - 4) |> Seq.forall Char.IsDigit

    /// durable-events-005: a writer file name is a segment name when it ends
    /// with a hyphen, exactly four digits, and the .ndjson suffix.
    let private isSegmentFileName (name: string) =
        name.Length >= 12
        && name.EndsWith(".ndjson", StringComparison.Ordinal)
        && name.[name.Length - 12] = '-'
        && name.Substring(name.Length - 11, 4) |> Seq.forall Char.IsDigit

    let private ordinalOfSegmentFileName (name: string) =
        Int32.Parse(name.Substring(name.Length - 11, 4))

    let private safeWriterId (writerId: string) =
        if String.IsNullOrWhiteSpace writerId then
            invalidArg "writerId" "WriterId is required"
        elif writerId.IndexOfAny([| '/'; '\\' |]) >= 0 || writerId = "." || writerId = ".." then
            invalidArg "writerId" "WriterId must be one path segment"
        elif endsWithSegmentSuffix writerId then
            invalidArg "writerId" "WriterId must not end with a hyphen and four digits"
        else
            writerId

    let createWithSegmentCap (commonDir: string) (writerId: string) (segmentCap: int) : ProcessEventLog =
        if String.IsNullOrWhiteSpace commonDir then
            invalidArg "commonDir" "git common-dir is required"

        if segmentCap <= 0 then
            invalidArg "segmentCap" "segment cap must be positive"

        let writer = safeWriterId writerId

        { CommonDir = commonDir
          WriterId = writer
          SegmentCap = segmentCap
          CurrentFile = segmentFileOf writer 0 }

    let create (commonDir: string) (writerId: string) : ProcessEventLog =
        createWithSegmentCap commonDir writerId DefaultSegmentCapBytes

    let writerId (log: ProcessEventLog) = log.WriterId

    let private fileOf (log: ProcessEventLog) (fileName: string) =
        join2 (eventsDirectory log.CommonDir) fileName

    /// The file this writer currently appends to: a durable-events-005
    /// segment, or the legacy suffixless file while it awaits reorganization.
    let filePath (log: ProcessEventLog) = fileOf log log.CurrentFile

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

    [<Emit("Buffer.byteLength($0, 'utf8')")>]
    let private byteLengthUtf8 (text: string) : int = jsNative

    let private seriesFilesOf (commonDir: string) (writerId: string) : string list =
        let directory = eventsDirectory commonDir

        if not (existsSync directory) then
            []
        else
            readdirSync directory
            |> Array.filter (fun name ->
                isSegmentFileName name
                && name.StartsWith(writerId + "-", StringComparison.Ordinal)
                && name.Length = writerId.Length + 12)
            |> Array.sort
            |> Array.toList

    let private fallbackTargetOf (commonDir: string) (writerId: string) : string =
        if existsSync (join2 (eventsDirectory commonDir) (legacyFileOf writerId)) then
            legacyFileOf writerId
        else
            segmentFileOf writerId 0

    let private highestSeriesFileOf (commonDir: string) (writerId: string) : string =
        match seriesFilesOf commonDir writerId |> List.rev with
        | latest :: _ -> latest
        | [] -> fallbackTargetOf commonDir writerId

    /// durable-events-005: resolve the file this append targets. The cached
    /// current file is probed with one stat; a vanished target
    /// (reorganization or import replaced the physical layout) re-enumerates
    /// the series. A legacy suffixless file is extended in place — append
    /// never reorganizes; materialization owns that transition.
    let private resolveAppendTarget (log: ProcessEventLog) : string =
        let cached = fileOf log log.CurrentFile

        if existsSync cached then
            cached
        else
            log.CurrentFile <- highestSeriesFileOf log.CommonDir log.WriterId
            fileOf log log.CurrentFile

    /// durable-events-005: roll to the next ordinal when the current segment
    /// is non-empty and would exceed the cap with this append. An empty
    /// segment always accepts the batch; a batch larger than the cap
    /// occupies its own segment; a legacy file is never rolled here.
    let private segmentSizeOf (path: string) : int =
        if existsSync path then statSync path |> statSize else 0

    let private nextOrdinalOf (currentFile: string) : int =
        let ordinal = ordinalOfSegmentFileName currentFile + 1

        if ordinal > 9999 then
            invalidArg "writerId" "segment ordinal exhausted the four-digit space"

        ordinal

    let private rollSegmentIfNeeded (log: ProcessEventLog) (textBytes: int) (path: string) : string =
        let size = segmentSizeOf path

        if size > 0 && size + textBytes > log.SegmentCap then
            log.CurrentFile <- segmentFileOf log.WriterId (nextOrdinalOf log.CurrentFile)
            fileOf log log.CurrentFile
        else
            path

    let private rollIfNeeded (log: ProcessEventLog) (textBytes: int) (path: string) : string =
        if log.CurrentFile = legacyFileOf log.WriterId then
            path
        else
            rollSegmentIfNeeded log textBytes path

    let private appendBytes text path =
        match tryAppendFault AppendPhase.PhysicalAppend (fun () -> AppendAllText path text "utf8") with
        | Error primary -> Error(PhysicalAppendFailure.AfterAppend(primary, []))
        | Ok() -> appendDurabilityBarrier path

    let private appendEncoded (log: ProcessEventLog) text =
        match
            tryAppendFault AppendPhase.BeforePhysicalAppend (fun () -> ensureDirectory (eventsDirectory log.CommonDir))
        with
        | Error primary -> Error(PhysicalAppendFailure.BeforeAppend primary)
        | Ok() ->
            let resolveTarget () =
                let target = resolveAppendTarget log
                rollIfNeeded log (byteLengthUtf8 text) target

            match tryAppendFault AppendPhase.BeforePhysicalAppend resolveTarget with
            | Error primary -> Error(PhysicalAppendFailure.BeforeAppend primary)
            | Ok path -> appendBytes text path

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
        | TailCutTailExhausted
        | TailResolved of float option

    let private decideTailSearch (line: TailLine) =
        match classifyTailActivity line.Text with
        | TailActivity.JournalActivity observedAt -> TailResolved(Some observedAt)
        | TailActivity.ProjectionCutTail when line.Start > 0 -> SearchBefore(line.Start - 1)
        | TailActivity.ProjectionCutTail -> TailCutTailExhausted
        | TailActivity.NoDurableActivity -> TailResolved None

    let private advanceTailSearch fd path lineEnd =
        readCompleteLineBefore fd path lineEnd
        |> Result.map decideTailSearch
        |> Result.defaultValue (TailResolved None)

    type private FileTailOutcome =
        | FileTailActivity of float
        | FileTailCutTailChain
        | FileTailNoDurable

    let private findDurableActivity fd path lineEnd =
        // DSL-MUTABLE: algorithm-scratch — finite reverse scan verdict.
        let mutable search = SearchBefore lineEnd

        let isSearching () =
            match search with
            | SearchBefore _ -> true
            | _ -> false

        let advance () =
            let cursor =
                match search with
                | SearchBefore value -> value
                | _ -> 0

            search <- advanceTailSearch fd path cursor

        while isSearching () do
            advance ()

        match search with
        | TailResolved(Some observedAt) -> FileTailActivity observedAt
        | TailResolved None -> FileTailNoDurable
        | TailCutTailExhausted -> FileTailCutTailChain
        | SearchBefore _ -> FileTailNoDurable

    let private durableActivityFromFd path size fd =
        let trailing = readExactAt fd (size - 1) 1

        if trailing.[0] = 10uy then
            findDurableActivity fd path (size - 1)
        else
            FileTailNoDurable

    /// Journal envelopes carry their producer observation time in durable
    /// bytes. A trailing ProjectionCutTail is integrator metadata for the
    /// immediately preceding fact, so it does not advance process activity by
    /// itself; the scan may walk backwards across the whole file and, for a
    /// segment series, into the previous segment (durable-events-005).
    let private scanFileTail (path: string) : FileTailOutcome =
        nonEmptyFileSize path
        |> Option.map (fun size -> withReadFd path (fun _ -> FileTailNoDurable) (durableActivityFromFd path size))
        |> Option.defaultValue FileTailNoDurable

    /// durable-convergence-011: the writer's activity is the durable Journal
    /// observation at the logical-stream tail (highest segment first); a
    /// trailing ProjectionCutTail chain may walk back across segment
    /// boundaries. Only when no durable activity exists does the
    /// producer-side file mtime speak, and the newest file wins.
    let private writerActivityOf (paths: string list) : float =
        let rec scanDescending remaining =
            match remaining with
            | [] -> None
            | path :: tail -> scanPastTail path tail

        and scanPastTail (path: string) (tail: string list) =
            match scanFileTail path with
            | FileTailActivity observedAt -> Some observedAt
            | FileTailCutTailChain -> scanDescending tail
            | FileTailNoDurable -> None

        match scanDescending (List.rev paths) with
        | Some observedAt -> observedAt
        | None -> paths |> List.map (fun path -> statSync path |> fileActivityMs) |> List.max

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

    /// durable-events-005/014: one writer's physical files grouped by
    /// WriterId. A tail `-dddd` name joins its prefix's segment series only
    /// when the ordinals are contiguous from 0000; otherwise the file is a
    /// legacy suffixless single file under its full stem. A legacy file and
    /// its segment series may coexist only as an interrupted reorganization
    /// or import intermediate.
    type private WriterFileGroup =
        { WriterId: string
          FileNames: string list }

    let private stemOfFileName (name: string) =
        name.Substring(0, name.Length - ".ndjson".Length)

    let private parseSegmentTail (stem: string) : (string * int) option =
        let splitAt = stem.Length - 5
        let tail = stem.Substring(splitAt)

        if tail.[0] = '-' && tail.Substring(1) |> Seq.forall Char.IsDigit then
            Some(stem.Substring(0, splitAt), Int32.Parse(tail.Substring(1)))
        else
            None

    let private parseSegmentStem (stem: string) : (string * int) option =
        if stem.Length >= 6 then parseSegmentTail stem else None

    let private contiguousSegmentGroups (names: string list) =
        names
        |> List.choose (fun name ->
            parseSegmentStem (stemOfFileName name)
            |> Option.map (fun (writerId, ordinal) -> writerId, ordinal, name))
        |> List.groupBy (fun (writerId, _, _) -> writerId)
        |> List.map (fun (writerId, entries) ->
            let ordinals = entries |> List.map (fun (_, ordinal, _) -> ordinal) |> Set.ofList
            let highest = Set.maxElement ordinals

            let contiguous =
                [ 0..highest ] |> List.forall (fun ordinal -> Set.contains ordinal ordinals)

            writerId, entries, contiguous)
        |> List.filter (fun (_, _, contiguous) -> contiguous)
        |> List.map (fun (writerId, entries, _) ->
            { WriterId = writerId
              FileNames = entries |> List.map (fun (_, _, name) -> name) })

    let private legacyGroupsOf (names: string list) (segmentWriters: Set<string>) =
        names
        |> List.filter (fun name ->
            match parseSegmentStem (stemOfFileName name) with
            | None -> true
            | Some(writerId, _) -> not (Set.contains writerId segmentWriters))
        |> List.map (fun name ->
            { WriterId = stemOfFileName name
              FileNames = [ name ] })

    let private writerFileGroups (commonDir: string) : WriterFileGroup list =
        let names = writerFileNames commonDir
        let segments = contiguousSegmentGroups names

        let segmentWriters =
            segments |> List.map (fun group -> group.WriterId) |> Set.ofList

        let legacy = legacyGroupsOf names segmentWriters

        (segments @ legacy)
        |> List.groupBy (fun group -> group.WriterId)
        |> List.map (fun (writerId, parts) ->
            { WriterId = writerId
              FileNames = parts |> List.collect (fun part -> part.FileNames) |> List.sort })
        |> List.sortBy (fun group -> group.WriterId)

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
        writerFileGroups commonDir
        |> List.map (fun group ->
            let paths =
                group.FileNames |> List.map (fun name -> join2 (eventsDirectory commonDir) name)

            { WriterId = group.WriterId
              FileNames = group.FileNames
              LastActivityMs = writerActivityOf paths })

    let readWriterFileBytes (commonDir: string) (name: string) : byte[] =
        readBytesFileSync (join2 (eventsDirectory commonDir) name)

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

    let private reconcileSeriesActivity (paths: string list) incomingActivity =
        incomingActivity
        |> Option.iter (fun remote ->
            paths
            |> List.iter (fun path ->
                earlierRemoteActivity (currentWriterActivity path) remote
                |> Option.iter (fun earlier -> setWriterActivity path earlier)))

    /// The physical files of one WriterId (legacy suffixless file plus the
    /// contiguous segment series).
    let private writerFilesOf (commonDir: string) (writerId: string) : string list =
        writerFileNames commonDir
        |> List.filter (fun name ->
            name = legacyFileOf writerId
            || (isSegmentFileName name
                && name.StartsWith(writerId + "-", StringComparison.Ordinal)
                && name.Length = writerId.Length + 12))

    /// The WriterId a writer file name belongs to (segment or legacy form).
    let writerKeyOfFileName (name: string) : string =
        if isSegmentFileName name then
            name.Substring(0, name.Length - 12)
        else
            name.Substring(0, name.Length - ".ndjson".Length)

    let private prefixMatches (prefix: byte[]) (full: byte[]) : bool =
        // DSL-MUTABLE: algorithm-scratch — early-exit prefix scan.
        let mutable same = true
        let mutable index = 0

        while same && index < prefix.Length do
            same <- prefix.[index] = full.[index]
            index <- index + 1

        same

    let private isPrefixOf (prefix: byte[]) (full: byte[]) =
        if prefix.Length > full.Length then
            false
        else
            prefixMatches prefix full

    let private eventIdsOfDecoded (text: string) : Set<string> option =
        match decodeWriterText "coexistence" text with
        | Error _ -> None
        | Ok events ->
            Some(
                events
                |> List.map (fun envelope -> EventId.value envelope.EventId)
                |> Set.ofList
            )

    /// durable-events-005: the event-id set of one physical form, or None
    /// when the bytes are not complete canonical NDJSON (invalid UTF-8, a
    /// half line, or a non-canonical line).
    let private eventIdsOf (bytes: byte[]) : Set<string> option =
        match CanonicalEventCodec.tryDecodeUtf8Text bytes with
        | Error _ -> None
        | Ok text -> eventIdsOfDecoded text

    /// durable-events-005: the line-continuation form of coexistence — an
    /// old process kept appending canonical lines to the legacy name after
    /// the segment series landed (a version-transition race). Those lines
    /// are genuine durable facts: every legacy line is complete canonical
    /// NDJSON and no legacy event id overlaps the series. Overlapping ids,
    /// half lines, or non-canonical bytes stay divergent.
    let private isLineContinuation (legacyBytes: byte[]) (segmentBytes: byte[]) : bool =
        match eventIdsOf legacyBytes, eventIdsOf segmentBytes with
        | Some legacyIds, Some segmentIds ->
            legacyIds |> Set.forall (fun eventId -> not (Set.contains eventId segmentIds))
        | _ -> false

    /// durable-events-005: the authoritative file list of one writer's
    /// logical stream. A coexisting legacy file and segment series is only a
    /// legal intermediate of an interrupted reorganization, import, or
    /// version transition: a byte-prefix relation keeps the longer form, and
    /// the line-continuation form reads as the series followed by the legacy
    /// lines. The read layer never touches disk here; materialization owns
    /// the physical convergence. Anything else is physical corruption.
    let private coexistingFormsOf
        (directory: string)
        (writerId: string)
        (legacyFile: string)
        (segments: string list)
        : Result<string list, string> =
        let legacyBytes = readBytesFileSync (join2 directory legacyFile)

        let segmentBytes =
            segments
            |> List.map (fun name -> readBytesFileSync (join2 directory name))
            |> Array.concat

        if isPrefixOf legacyBytes segmentBytes then
            Ok segments
        elif isPrefixOf segmentBytes legacyBytes then
            Ok [ legacyFile ]
        elif isLineContinuation legacyBytes segmentBytes then
            Ok(segments @ [ legacyFile ])
        else
            Error(sprintf "writer files diverged: %s" writerId)

    let private logicalStreamFiles (commonDir: string) (group: WriterFileGroup) : Result<string list, string> =
        let directory = eventsDirectory commonDir

        let legacy =
            group.FileNames |> List.filter (fun name -> not (isSegmentFileName name))

        let segments = group.FileNames |> List.filter isSegmentFileName |> List.sort

        match legacy, segments with
        | [], files -> Ok files
        | [ legacyFile ], [] -> Ok [ legacyFile ]
        | [ legacyFile ], _ -> coexistingFormsOf directory group.WriterId legacyFile segments
        | _ -> Error(sprintf "multiple legacy files for one writer: %s" group.WriterId)

    let private localLogicalText (commonDir: string) (group: WriterFileGroup) : Result<string, string> =
        result {
            let! files = logicalStreamFiles commonDir group

            let! texts =
                files
                |> List.traverseResultM (fun name ->
                    readBytesFileSync (join2 (eventsDirectory commonDir) name)
                    |> CanonicalEventCodec.tryDecodeUtf8Text
                    |> Result.mapError (fun reason -> sprintf "not valid UTF-8: %A" reason))

            return String.concat "" texts
        }

    /// durable-events-005: split canonical text into segment-sized chunks at
    /// line boundaries. A single line larger than the cap occupies its own
    /// segment; empty text produces no segments.
    /// Greedy segment assembly state for the fold below.
    type private SegmentAssembly =
        { CurrentLines: string list
          CurrentBytes: int
          Completed: string list }

    let private emptyHeadroomMarker (assembly: SegmentAssembly) : SegmentAssembly =
        // Virtual headroom exhausted before the first line fit: emit
        // an empty marker piece so the caller rolls to a fresh
        // segment instead of appending onto the tail.
        { CurrentLines = []
          CurrentBytes = 0
          Completed = "" :: assembly.Completed }

    let private sealEmptyAssembly (assembly: SegmentAssembly) : SegmentAssembly =
        if assembly.CurrentBytes > 0 then
            emptyHeadroomMarker assembly
        else
            assembly

    let private sealAssembly (assembly: SegmentAssembly) : SegmentAssembly =
        if List.isEmpty assembly.CurrentLines then
            sealEmptyAssembly assembly
        else
            let body = assembly.CurrentLines |> List.rev |> String.concat "\n"

            { CurrentLines = []
              CurrentBytes = 0
              Completed = (body + "\n") :: assembly.Completed }

    let private absorbLine (cap: int) (assembly: SegmentAssembly) (line: string) : SegmentAssembly =
        let lineBytes = byteLengthUtf8 (line + "\n")

        let sealedAssembly =
            if assembly.CurrentBytes > 0 && assembly.CurrentBytes + lineBytes > cap then
                sealAssembly assembly
            else
                assembly

        { sealedAssembly with
            CurrentLines = line :: sealedAssembly.CurrentLines
            CurrentBytes = sealedAssembly.CurrentBytes + lineBytes }

    /// durable-events-005: split canonical text into pieces that fit the
    /// segment cap at line boundaries. `headroom` is the byte budget already
    /// consumed in the first (tail) segment — the line-continuation
    /// convergence appends onto the series tail this way. A single line
    /// larger than the cap occupies its own piece; empty text produces no
    /// pieces; an exhausted headroom emits one leading empty marker piece
    /// meaning "start at a fresh segment".
    let internal splitTextIntoSegmentsWithHeadroom (text: string) (cap: int) (headroom: int) : string list =
        if text.Length = 0 then
            []
        else
            let lines = text.Split('\n') |> Array.filter (fun line -> line.Length > 0)

            let final =
                Array.fold
                    (fun assembly line -> absorbLine cap assembly line)
                    { CurrentLines = []
                      CurrentBytes = headroom
                      Completed = [] }
                    lines

            (sealAssembly final).Completed |> List.rev

    let internal splitTextIntoSegments (text: string) (cap: int) : string list =
        splitTextIntoSegmentsWithHeadroom text cap 0

    /// Write one writer's logical stream as a fresh segment series; every
    /// segment lands (with its durability barrier) before any superseded
    /// physical file is removed.
    let private writeSegmentSeries (commonDir: string) (writerId: string) (text: string) : string list =
        let directory = eventsDirectory commonDir
        let segments = splitTextIntoSegments text (segmentCapBytes ())

        let names =
            List.init (List.length segments) (fun index -> segmentFileOf writerId index)

        segments
        |> List.iteri (fun index body ->
            let path = join2 directory names.[index]
            writeTextFileSync path body "utf8"
            durabilityBarrier path)

        names

    let private removeSupersededFiles (commonDir: string) (writerId: string) (keep: string list) =
        writerFilesOf commonDir writerId
        |> List.filter (fun name -> not (List.contains name keep))
        |> List.iter (fun name ->
            let path = join2 (eventsDirectory commonDir) name
            someWhen (existsSync path) path |> Option.iter unlinkSync)

    /// Merge one writer's logical stream while preserving the producer's
    /// activity time from the remote snapshot (durable-events-005). The
    /// incoming text must extend or equal the local logical stream; the
    /// write-back re-materializes the writer as a segment series, and a
    /// fetch/import must never make an old writer look new.
    let mergeWriterTextWithActivity
        (commonDir: string)
        (writerId: string)
        (incoming: string)
        (incomingActivityMs: float option)
        : Result<unit, string> =
        let writer = safeWriterId writerId
        let directory = eventsDirectory commonDir
        ensureDirectory directory

        result {
            let group =
                { WriterId = writer
                  FileNames = writerFilesOf commonDir writer }

            let! existing =
                localLogicalText commonDir group
                |> Result.mapError (fun reason -> sprintf "writer history is not valid UTF-8: %s" reason)

            if existing = incoming then
                reconcileSeriesActivity
                    (group.FileNames |> List.map (fun name -> join2 directory name))
                    incomingActivityMs
            elif incoming.StartsWith(existing, StringComparison.Ordinal) then
                let names = writeSegmentSeries commonDir writer incoming
                let highest = List.last names
                removeSupersededFiles commonDir writer names
                incomingActivityMs |> Option.iter (setWriterActivity (join2 directory highest))
            elif not (existing.StartsWith(incoming, StringComparison.Ordinal)) then
                return! Error(sprintf "writer history diverged: %s" writer)
        }

    /// Replace/import one writer's logical stream only when the incoming
    /// bytes extend the local complete-line prefix. Divergence is fail-closed
    /// physical corruption.
    let mergeWriterText (commonDir: string) (writerId: string) (incoming: string) : Result<unit, string> =
        mergeWriterTextWithActivity commonDir writerId incoming None

    /// durable-events-005 / durable-convergence-001/011: retention removes a
    /// writer as a whole — every segment of the series plus the legacy file.
    let removeWriter (commonDir: string) (writerId: string) : unit =
        writerFilesOf commonDir writerId
        |> List.iter (fun name ->
            let path = join2 (eventsDirectory commonDir) name
            someWhen (existsSync path) path |> Option.iter unlinkSync)

    let private decodeWriterFiles
        (commonDir: string)
        (group: WriterFileGroup)
        : Result<EventEnvelope list, StorageInvalid> =
        result {
            let! files =
                logicalStreamFiles commonDir group
                |> Result.mapError StorageInvalid.NonCanonical

            let! decoded =
                files
                |> List.traverseResultM (fun name -> decodeFileCached (join2 (eventsDirectory commonDir) name))

            return List.concat decoded
        }

    let private reorganizeLegacy (commonDir: string) (writerId: string) : Result<unit, string> =
        let directory = eventsDirectory commonDir
        let legacyFile = join2 directory (legacyFileOf writerId)
        let bytes = readBytesFileSync legacyFile

        match CanonicalEventCodec.tryDecodeUtf8Text bytes with
        | Error reason -> Error(sprintf "writer history is not valid UTF-8: %A" reason)
        | Ok text ->
            let names = writeSegmentSeries commonDir writerId text
            // The legacy file's producer-side activity survives the physical
            // reassignment; durable Journal activity lives in the bytes.
            let legacyActivity = statSync legacyFile |> fileActivityMs
            setWriterActivity (join2 directory (List.last names)) legacyActivity
            unlinkSync legacyFile
            Ok()

    /// durable-events-005: materialization-boundary convergence for one
    /// writer. An oversized legacy file is reorganized into segments; a
    /// coexisting legacy/segment pair (an interrupted reorganization or
    /// import) is reconciled by byte-prefix validation — the longer stream
    /// wins and the shorter physical form is removed. Diverged bytes fail
    /// closed; nothing is deleted before every replacement byte has landed.
    let private convergeLegacyOnly (commonDir: string) (writerId: string) (legacyFile: string) : Result<unit, string> =
        if not (existsSync legacyFile) then
            Ok()
        elif statSync legacyFile |> statSize <= segmentCapBytes () then
            Ok()
        else
            reorganizeLegacy commonDir writerId

    let private dropSeriesAndReassign
        (commonDir: string)
        (writerId: string)
        (legacyFile: string)
        (segments: string list)
        : Result<unit, string> =
        // The legacy bytes extend the partial series: the series is a
        // reorganization remnant; remove it and reassign when oversized.
        let directory = eventsDirectory commonDir
        segments |> List.iter (fun name -> unlinkSync (join2 directory name))

        if statSync legacyFile |> statSize > segmentCapBytes () then
            reorganizeLegacy commonDir writerId
        else
            Ok()

    /// durable-events-005: line-continuation convergence — append the
    /// legacy file's canonical lines verbatim onto the series tail (rolling
    /// fresh segments at the cap), then remove the legacy file only after
    /// every appended byte has landed.
    let private seriesTailOf (directory: string) (writerId: string) (segments: string list) : string * int =
        match List.rev segments |> List.tryHead with
        | Some latest -> latest, statSync (join2 directory latest) |> statSize
        | None -> segmentFileOf writerId 0, 0

    let private fileNameForPiece (tailName: string) (writerId: string) (index: int) : string =
        match index with
        | 0 -> tailName
        | _ -> segmentFileOf writerId (ordinalOfSegmentFileName tailName + index)

    let private appendLegacyPiece
        (directory: string)
        (writerId: string)
        (tailName: string)
        (index: int)
        (piece: string)
        : unit =
        if piece.Length > 0 then
            let fileName = fileNameForPiece tailName writerId index
            let path = join2 directory fileName
            AppendAllText path piece "utf8"
            durabilityBarrier path

    let private appendLegacyLinesToSeries
        (commonDir: string)
        (writerId: string)
        (legacyFile: string)
        : Result<unit, string> =
        let directory = eventsDirectory commonDir

        match CanonicalEventCodec.tryDecodeUtf8Text (readBytesFileSync legacyFile) with
        | Error reason -> Error(sprintf "writer history is not valid UTF-8: %A" reason)
        | Ok text ->
            let segments = seriesFilesOf commonDir writerId
            let tailName, headroom = seriesTailOf directory writerId segments
            let pieces = splitTextIntoSegmentsWithHeadroom text (segmentCapBytes ()) headroom

            pieces
            |> List.iteri (fun index piece -> appendLegacyPiece directory writerId tailName index piece)

            unlinkSync legacyFile
            Ok()

    let private reconcileCoexistingForms
        (commonDir: string)
        (writerId: string)
        (legacyFile: string)
        (segments: string list)
        : Result<unit, string> =
        let directory = eventsDirectory commonDir
        let legacyBytes = readBytesFileSync legacyFile

        let segmentBytes =
            segments
            |> List.map (fun name -> readBytesFileSync (join2 directory name))
            |> Array.concat

        if isPrefixOf legacyBytes segmentBytes then
            // The segment series extends (or equals) the legacy bytes:
            // the series is authoritative; drop the legacy file.
            unlinkSync legacyFile
            Ok()
        elif isPrefixOf segmentBytes legacyBytes then
            dropSeriesAndReassign commonDir writerId legacyFile segments
        elif isLineContinuation legacyBytes segmentBytes then
            appendLegacyLinesToSeries commonDir writerId legacyFile
        else
            Error(sprintf "writer files diverged: %s" writerId)

    let internal convergeWriterFiles (commonDir: string) (writerId: string) : Result<unit, string> =
        let directory = eventsDirectory commonDir
        let legacyFile = join2 directory (legacyFileOf writerId)
        let segments = seriesFilesOf commonDir writerId

        if List.isEmpty segments then
            convergeLegacyOnly commonDir writerId legacyFile
        elif not (existsSync legacyFile) then
            Ok()
        else
            reconcileCoexistingForms commonDir writerId legacyFile segments

    /// Frozen retained writer streams, sorted only by WriterId for deterministic
    /// enumeration. Retention is whole-writer physical policy; the canonical
    /// Integrator still owns cross-stream ordering and interpretation. Segments
    /// aggregate into one stream before k-way merge (durable-events-014).
    let readStreamsAt (commonDir: string) (nowMs: float) : Result<(string * EventEnvelope list) list, StorageInvalid> =
        pruneDecodeCache ()

        let rec read remaining acc =
            result {
                match remaining with
                | [] -> return List.rev acc
                | group :: tail ->
                    let! events = decodeWriterFiles commonDir group
                    return! read tail ((group.WriterId, events) :: acc)
            }

        writerPhysicalMetadata commonDir
        |> List.filter (fun writer -> isWriterActiveAt nowMs writer.LastActivityMs)
        |> List.map (fun writer ->
            { WriterId = writer.WriterId
              FileNames = writer.FileNames })
        |> fun groups -> read groups []

    let readStreams (commonDir: string) : Result<(string * EventEnvelope list) list, StorageInvalid> =
        readStreamsAt commonDir (currentTimeMs ())

    /// Public content digest for inline payload staging (durable-events-012).
    /// The digest IS the PayloadRef content address.
    let payloadDigest (content: byte[]) : string =
        createHash "sha256" |> fun hash -> hashUpdate hash content |> hashHex
