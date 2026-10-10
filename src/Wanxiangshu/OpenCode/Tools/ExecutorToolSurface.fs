namespace Wanxiangshu.OpenCode

open System
open System.Collections.Generic
open System.Threading.Tasks
open Fable.Core.JsInterop
open Wanxiangshu.Execution.Session
open Wanxiangshu.Execution.Session.Wait
open Wanxiangshu.Foundation.Identity

/// JS-native semantic surface for bounded command execution and raw output tailing.
/// A JS test never
/// constructs `runSpec`, a ToolHostCodec factory, ToolRuntimeScope or a
/// recovery union: those remain owner-private here.
module ExecutorToolSurface =

    /// Provider-visible execution verb.
    let runToolName: string = ExecutorTool.RunToolName

    type private SurfaceScope(scope: ToolRuntimeScope) =
        member _.Value = scope

    let private scopeOf (value: obj) = (value :?> SurfaceScope).Value

    let private rawField (raw: obj) (name: string) : obj = if isNull raw then null else raw?(name)

    let private rawString (raw: obj) (name: string) : string option =
        let value = rawField raw name
        if isNull value then None else Some(string value)

    let private createScope (sessionsRaw: obj) (workspaceDirectory: string option) : obj =
        let sessions: ISessionHostPort =
            if isNull sessionsRaw then
                Unchecked.defaultof<ISessionHostPort>
            else
                unbox<ISessionHostPort> sessionsRaw

        let scope =
            new ToolRuntimeScope(
                sessions,
                CausalWaitRuntime().Observer,
                { new IRootWorkspaceReader with
                    member _.TryRead() = workspaceDirectory },
                None,
                workspaceDirectory,
                Dictionary<string, string>(),
                (fun _ -> None),
                Dictionary<string, string>(),
                None,
                None,
                None,
                None,
                None
            )

        SurfaceScope(scope) :> obj

    let private attachRecovery (scope: ToolRuntimeScope) (mode: string) = scope.AttachCurrentProcessJoinMode mode

    /// Plain metadata for the provider-visible run contract.
    let describeRun (toolModule: obj) : obj =
        let factory = ToolHostCodec.factory toolModule
        let spec = ExecutorTool.runSpec factory (createScope null None |> scopeOf)

        box
            {| name = spec.Name
               description = spec.Description
               arguments = spec.Arguments |> List.map fst |> List.toArray |}

    /// Execute the provider-visible run contract. `toolModule` is the Host's
    /// schema module, `sessions` is an opaque Host session capability, `args`
    /// and `context` are plain Host objects, and `recovery` is the owner-owned
    /// recovery mode used by tests/canaries ("blocked", "waiting", or "ready").
    let run (toolModule: obj) (sessions: obj) (args: obj) (context: obj) (recovery: string) : Task<string> =
        let factory = ToolHostCodec.factory toolModule
        let scopeHandle = createScope sessions (rawString context "workspaceDirectory")
        let scope = scopeOf scopeHandle

        if not (String.IsNullOrWhiteSpace recovery) then
            attachRecovery scope recovery

        let spec = ExecutorTool.runSpec factory scope
        let hostArgs = HostToolArguments args
        let hostContext = ToolHostCodec.decodeContext context
        spec.Execute hostArgs hostContext

    let formatSpooledOutcome (exitCode: int) (summary: string) : string =
        ExecutorTool.formatSpooledOutcome exitCode summary
