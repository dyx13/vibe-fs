namespace Wanxiangshu.OpenCode

open System.Threading.Tasks
open Wanxiangshu.Context.Prefix
open Wanxiangshu.Mission.Relay.OpenCode

module PluginTransformSurface =
    let ordinaryEffects tentative retired : Task<string array> =
        task {
            let effects = ResizeArray<string>()
            let record name = effects.Add name

            let complete name =
                record name
                Task.FromResult()

            let caps: PluginTransforms.NormalTransformCapabilities =
                { TryStopRetiredAttempt =
                    fun _ _ ->
                        if retired then
                            record "retired-attempt"

                        Task.FromResult retired
                  BeginPhysicalProviderAttempt = fun _ _ -> complete "begin"
                  BindSessionStartedAt =
                    fun _ ->
                        record "session-time"
                        Task.FromResult None
                  ApplyStrengthReplay =
                    fun _ _ ->
                        record "replay"
                        Task.FromResult []
                  RestoreProtocolArguments = fun _ -> complete "restore-arguments"
                  ApplyRelayProjection =
                    fun _ _ ->
                        record "relay"

                        Task.FromResult RelayProjectionDisposition.CurrentIteration
                  CaptureXTraceMessages =
                    fun _ _ ->
                        record "capture"
                        Task.FromResult { RawMessages = []; Current = None }
                  CommitStrengthTrace = fun _ _ _ -> complete "commit-trace"
                  RefreshCompanionXTrace = fun _ _ -> record "refresh-companion"
                  ApplyCompanion = fun _ _ _ -> complete "companion"
                  ApplyXWire =
                    fun _ ->
                        record "prefix"

                        Task.FromResult(
                            if tentative then
                                PrefixPresentationHorizon.TentativeCold
                            else
                                PrefixPresentationHorizon.Current
                        )
                  FreezeProviderAttemptPlan = fun _ _ -> complete "freeze-plan"
                  ApplyEnforcerContinuation = fun _ _ -> complete "continuation"
                  ApplyReadonlyDelegation = fun _ _ -> complete "delegation"
                  InjectPairGuideline = fun _ _ _ -> complete "pair"
                  ProjectRequirementGrounding = fun _ _ -> complete "grounding"
                  InjectBloggerChronicle = fun _ _ _ -> record "chronicle"
                  SettleAndReplaceDeferredInspections = fun _ _ -> complete "deferred"
                  SanitizeMessages = fun _ -> record "sanitize" }

            do!
                PluginTransforms.normalTransform
                    caps
                    (Some "surface-owner")
                    (box {| sessionID = "surface-owner" |})
                    (box {| messages = ([||]: obj array) |})

            return effects.ToArray()
        }
