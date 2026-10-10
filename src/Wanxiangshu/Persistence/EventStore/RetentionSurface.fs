namespace Wanxiangshu.Persistence.EventStore

open System
open System.Collections.Generic
open System.Text
open System.Threading.Tasks
open Fable.Core
open Fable.Core.JsInterop

[<RequireQualifiedAccess>]
module RetentionSurface =

    let readLastCompleteLine (path: string) : string =
        match ProcessEventLog.readLastCompleteLine path with
        | Ok(Some line) -> line
        | Ok None -> null
        | Error error -> failwith error

    let retainedWriterIdsAt (commonDir: string) (nowMs: float) : string[] =
        match ProcessEventLog.readStreamsAt commonDir nowMs with
        | Ok streams -> streams |> List.map fst |> List.toArray
        | Error error -> failwith (sprintf "%A" error)

    let syncAt (repoPath: string) (commonDir: string) (remoteRoot: string) (nowMs: float) : Task<obj> =
        task {
            let raw = ProcessGitRawStore.create repoPath

            let remote =
                if String.IsNullOrWhiteSpace remoteRoot then
                    None
                else
                    Some { RootOid = remoteRoot |> GitObjectId.create |> RootOid.create }

            match! WriterStreamSync.syncWriterStreamsAt raw commonDir remote nowMs with
            | Ok snapshot ->
                return
                    createObj
                        [ "ok" ==> true
                          "root" ==> (snapshot.RootOid |> RootOid.value |> GitObjectId.value) ]
            | Error error -> return createObj [ "ok" ==> false; "error" ==> sprintf "%A" error ]
        }

    [<Import("createHash", "node:crypto")>]
    let private createHash (algorithm: string) : obj = jsNative

    let private sha1 (kind: string) (bytes: byte[]) =
        let hash = createHash "sha1"
        hash?update (box (Encoding.UTF8.GetBytes(kind + "\000"))) |> ignore
        hash?update (box bytes) |> ignore
        hash?digest (box "hex") |> unbox<string>

    /// JSON-only adapter proof seam. The fake ends at IGitRawStore; all writer
    /// import, validation, retention, and materialization execute production code.
    let writerSyncAdapterScenario (input: obj) : Task<obj> =
        task {
            let commonDir: string = input?commonDir
            let nowMs: float = input?nowMs
            let remoteWriterId: string = input?remoteWriterId
            let remoteWriterText: string = input?remoteWriterText
            let remoteActivityMs: float = input?remoteActivityMs
            let blobs = Dictionary<string, byte[]>()
            let trees = Dictionary<string, TreeEntry list>()
            let protocol = ResizeArray<string>()

            let putBlob (bytes: byte[]) =
                let oid = sha1 "blob" bytes
                blobs.[oid] <- bytes
                GitObjectId.create oid

            let treeBytes entries =
                entries
                |> GitTree.canonicalOrder
                |> List.map (fun entry -> String.concat "\t" [ entry.Mode; entry.Name; entry.Oid |> GitObjectId.value ])
                |> String.concat "\n"
                |> Encoding.UTF8.GetBytes

            let putTree entries =
                let canonical = GitTree.canonicalOrder entries
                let oid = sha1 "tree" (treeBytes canonical)
                trees.[oid] <- canonical
                GitObjectId.create oid

            let raw =
                { new IGitRawStore with
                    member _.WriteBlob bytes =
                        let oid = putBlob bytes
                        protocol.Add(sprintf "WriteBlob %s" (GitObjectId.value oid))
                        Task.FromResult oid

                    member _.WriteTree entries =
                        let oid = putTree entries
                        protocol.Add(sprintf "WriteTree %s" (GitObjectId.value oid))
                        Task.FromResult oid

                    member _.ReadObject oid =
                        let value = GitObjectId.value oid
                        protocol.Add(sprintf "ReadObject %s" value)

                        match blobs.TryGetValue value with
                        | true, bytes -> Task.FromResult(Some bytes)
                        | _ -> Task.FromResult None

                    member _.ReadTree oid =
                        let value = GitObjectId.value oid
                        protocol.Add(sprintf "ReadTree %s" value)

                        match trees.TryGetValue value with
                        | true, entries -> Task.FromResult(Some entries)
                        | _ -> Task.FromResult None

                    member _.ReadRef refName =
                        protocol.Add(sprintf "ReadRef %s" refName)
                        Task.FromResult None

                    member _.CompareAndSwapRef(refName, expectedOld, newOid) =
                        let expected =
                            expectedOld |> Option.map GitObjectId.value |> Option.defaultValue "-"

                        protocol.Add(sprintf "CompareAndSwapRef %s %s %s" refName expected (GitObjectId.value newOid))
                        Task.FromResult false }

            let remoteWriterName = remoteWriterId + ".ndjson"
            let remoteBlob = remoteWriterText |> Encoding.UTF8.GetBytes |> putBlob

            let writerTree =
                putTree
                    [ { Mode = "100644"
                        Name = remoteWriterName
                        Oid = remoteBlob } ]

            let encodedName =
                emitJsExpr remoteWriterName "Buffer.from($0, 'utf8').toString('base64url')"
                |> unbox<string>

            let manifest =
                sprintf "v2\n%s\t%s\t%g\n" encodedName (GitObjectId.value remoteBlob) remoteActivityMs
                |> Encoding.UTF8.GetBytes
                |> putBlob

            let validRoot =
                putTree
                    [ { Mode = "40000"
                        Name = "writers"
                        Oid = writerTree }
                      { Mode = "100644"
                        Name = "writer-manifest"
                        Oid = manifest } ]

            let invalidRoot =
                putTree
                    // durable-events-012: a root without the writers/ tree carries no
                    // writer stream at all and must be refused.
                    [ { Mode = "100644"
                        Name = "writer-manifest"
                        Oid = manifest } ]

            protocol.Clear()

            let run root =
                task {
                    protocol.Clear()

                    let! outcome =
                        WriterStreamSync.syncWriterStreamsAt
                            raw
                            commonDir
                            (Some { RootOid = RootOid.create root })
                            nowMs

                    let calls = protocol.ToArray()

                    return
                        match outcome with
                        | Ok snapshot ->
                            createObj
                                [ "ok" ==> true
                                  "root" ==> (snapshot.RootOid |> RootOid.value |> GitObjectId.value)
                                  "protocol" ==> calls ]
                        | Error error ->
                            createObj [ "ok" ==> false; "error" ==> sprintf "%A" error; "protocol" ==> calls ]
                }

            let! first = run validRoot
            let! repeat = run validRoot
            let beforeInvalid = retainedWriterIdsAt commonDir nowMs
            let! invalid = run invalidRoot
            let afterInvalid = retainedWriterIdsAt commonDir nowMs

            return
                createObj
                    [ "validRemoteRoot" ==> GitObjectId.value validRoot
                      "localWriterIds" ==> beforeInvalid
                      "first" ==> first
                      "repeat" ==> repeat
                      "invalid" ==> invalid
                      "writerIdsAfterInvalid" ==> afterInvalid ]
        }
