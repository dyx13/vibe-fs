namespace Wanxiangshu.Repository.Programming.Js.OpenCode

open System.Threading.Tasks
open Fable.Core
open Fable.Core.JsInterop
open Wanxiangshu.Foundation
open Wanxiangshu.OpenCode
open Wanxiangshu.Participant.Provider
open Wanxiangshu.Repository.Programming.Js

/// Coexistence seam between builtin filesystem fallbacks and generated js-*.
/// GrandRewrite keeps read/edit/write/glob/grep as normal primitive fallback:
/// their Host descriptions are left untouched. Preference for intent-level
/// programs is taught inside the generated js-* contract and its Ultra Example.
module BuiltinToolDescriptionHook =

    [<Emit("$0===undefined||$0===null")>]
    let private isUndefined (value: obj) : bool = jsNative

    /// The builtin filesystem tools the hook may annotate (凡存在者).
    let BuiltinFilesystemTools =
        set [ "read"; "edit"; "write"; "glob"; "grep"; "patch" ]

    let annotate (builtinName: string) (description: string) (jsRoleToolName: string) : string =
        ignore builtinName
        ignore jsRoleToolName
        description

    /// JS-003: the hook must not recommend a tool the provider cannot see.
    /// `visibleToolNames` is the current Attempt's tool set; a recommendation
    /// outside it is a lying hook and fails closed.
    let validateRecommendation (jsRoleToolName: string) (visibleToolNames: Set<string>) : Result<unit, string> =
        if Set.contains jsRoleToolName visibleToolNames then
            Ok()
        else
            Error(
                ProviderProse.render
                    (ProviderLanguageBinding.readGlobalPreference ())
                    JsCanonicalDescription.Path.HookNotVisible
                    (Map [ "tool", jsRoleToolName ])
            )

/// PROMPT-019: load already-localized js-program prose. Domain assembles;
/// this module binds language.
module JsDescriptionAssets =

    let private text (lang: ProviderLanguage) (path: string) =
        ProviderProse.render lang path Map.empty

    let private template (lang: ProviderLanguage) (path: string) =
        ProviderResources.requireLanguagePair path
        ProviderResources.readText lang path

    let load (lang: ProviderLanguage) : JsCanonicalDescription.Prose =
        { Header = text lang JsCanonicalDescription.Path.Header
          EditPrelude = template lang JsCanonicalDescription.Path.EditPrelude
          EditStructuralGuidance = template lang JsCanonicalDescription.Path.EditStructuralGuidance
          Footer = text lang JsCanonicalDescription.Path.Footer
          Contract = template lang JsCanonicalDescription.Path.Contract
          ContractEditRecommendation = template lang JsCanonicalDescription.Path.ContractEditRecommendation
          ContractParallelEdits = template lang JsCanonicalDescription.Path.ContractParallelEdits
          ContractParallelReads = template lang JsCanonicalDescription.Path.ContractParallelReads
          VerbRead = text lang JsCanonicalDescription.Path.VerbRead
          VerbSearch = text lang JsCanonicalDescription.Path.VerbSearch
          VerbTransform = text lang JsCanonicalDescription.Path.VerbTransform
          VerbRewrite = text lang JsCanonicalDescription.Path.VerbRewrite
          VerbCreate = text lang JsCanonicalDescription.Path.VerbCreate
          ReadRules = template lang JsCanonicalDescription.Path.ReadRules
          GlobRules = text lang JsCanonicalDescription.Path.GlobRules
          GrepRules = text lang JsCanonicalDescription.Path.GrepRules
          EditRules = template lang JsCanonicalDescription.Path.EditRules
          WriteRules = text lang JsCanonicalDescription.Path.WriteRules
          MutationRules = text lang JsCanonicalDescription.Path.MutationRules
          UltraFraming = text lang JsCanonicalDescription.Path.UltraFraming
          UltraUnavailable = text lang JsCanonicalDescription.Path.UltraUnavailable
          UltraEngineering = text lang JsCanonicalDescription.Path.UltraEngineering
          UltraInvestigation = text lang JsCanonicalDescription.Path.UltraInvestigation
          UltraDevOps = text lang JsCanonicalDescription.Path.UltraDevOps
          UltraManagerInvestigation = text lang JsCanonicalDescription.Path.UltraManagerInvestigation
          UltraPlan = text lang JsCanonicalDescription.Path.UltraPlan
          MechanicalSemantic = text lang JsCanonicalDescription.Path.MechanicalSemantic
          CommentAnchorOwnSearch = text lang JsCanonicalDescription.Path.CommentAnchorOwnSearch
          CommentIgnoreGy = text lang JsCanonicalDescription.Path.CommentIgnoreGy
          CommentHostCapability = text lang JsCanonicalDescription.Path.CommentHostCapability
          ReasonEmptyStringPattern = text lang JsCanonicalDescription.Path.ReasonEmptyStringPattern
          ReasonInvalidRegexp = text lang JsCanonicalDescription.Path.ReasonInvalidRegexp
          ReasonPatternType = text lang JsCanonicalDescription.Path.ReasonPatternType
          ReasonAnchorEmptyNames = text lang JsCanonicalDescription.Path.ReasonAnchorEmptyNames
          ReasonAnchorReserved = text lang JsCanonicalDescription.Path.ReasonAnchorReserved
          ReasonAnchorNamesDiffer = text lang JsCanonicalDescription.Path.ReasonAnchorNamesDiffer
          ReasonAnchorNamesUnique = text lang JsCanonicalDescription.Path.ReasonAnchorNamesUnique
          ReasonAnchorNotFound = text lang JsCanonicalDescription.Path.ReasonAnchorNotFound
          ReasonUnknownAnchor = text lang JsCanonicalDescription.Path.ReasonUnknownAnchor
          ReasonInvalidSlice = text lang JsCanonicalDescription.Path.ReasonInvalidSlice
          ReasonFileReadFailed = text lang JsCanonicalDescription.Path.ReasonFileReadFailed
          ReasonRunUnimplemented = text lang JsCanonicalDescription.Path.ReasonRunUnimplemented
          ReasonEditInvalid = text lang JsCanonicalDescription.Path.ReasonEditInvalid
          ReasonEditNotFound = text lang JsCanonicalDescription.Path.ReasonEditNotFound
          ReasonEditAmbiguous = text lang JsCanonicalDescription.Path.ReasonEditAmbiguous
          ReasonEditOverlap = text lang JsCanonicalDescription.Path.ReasonEditOverlap
          ReasonEditAtomicity = text lang JsCanonicalDescription.Path.ReasonEditAtomicity
          ReasonEditPreview = text lang JsCanonicalDescription.Path.ReasonEditPreview
          ReasonEditCopyReady = text lang JsCanonicalDescription.Path.ReasonEditCopyReady
          ReasonEditAttempted = text lang JsCanonicalDescription.Path.ReasonEditAttempted
          ReasonEditUnknownFields = text lang JsCanonicalDescription.Path.ReasonEditUnknownFields
          ReasonEditCandidate = text lang JsCanonicalDescription.Path.ReasonEditCandidate
          ReasonEditLine = text lang JsCanonicalDescription.Path.ReasonEditLine
          ReasonEditOverlaps = text lang JsCanonicalDescription.Path.ReasonEditOverlaps }

    let argProgram (lang: ProviderLanguage) =
        text lang JsCanonicalDescription.Path.ArgProgram

    let missingProgram (lang: ProviderLanguage) =
        text lang JsCanonicalDescription.Path.MissingProgram

/// JS-073/JS-074: a generated js-* tool spec — the dynamic counterpart of the
/// static baseSpecs. Built from a generated surface (JS-002); execution goes
/// through JsToolWorkflow (sandbox → staging → preflight → durable facts →
/// commit) and the result renders through JsToolsResult (JS-016).
module JsToolSpec =

    let admissionFor (roleName: string) : ToolAdmission =
        let fsPermissions =
            set
                [ ToolPermission.Read
                  ToolPermission.Write
                  ToolPermission.Edit
                  ToolPermission.Glob
                  ToolPermission.Grep ]

        ToolAdmission.OfficeRole(fun _ r ->
            (string r).ToLowerInvariant() = roleName.ToLowerInvariant()
            && not (Set.isEmpty (Set.intersect (OfficeCapability.permissions r) fsPermissions)))

    [<Emit("$0===undefined||$0===null")>]
    let private isUndefined (value: obj) : bool = jsNative

    /// Build a ToolSpec for one generated surface.
    ///
    /// `workspaceRoot` is where the tool executes; `persistence` enables the
    /// durable transaction facts (JS-012) when the caller has an EventStore.
    /// `modelSourceProvider` supplies the model program (the tool arguments);
    /// the first version reads it from the Host arguments payload.
    let create
        (factory: HostToolFactory)
        (surface: JsSurface)
        (workspaceRoot: string)
        (persistence: IJsTransactionPersistence option)
        (fileAccessObservation: (HostToolContext -> JsExplicitFileRead list -> string list -> Task<unit>) option)
        : ToolSpec =
        let readProgram (args: HostToolArguments) : string option = args.OptionalText "program"

        let runProgram ctx programSource =
            let deadlineEpochMs = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + 10000L

            match fileAccessObservation with
            | None ->
                JsToolWorkflow.run
                    surface.Capabilities
                    workspaceRoot
                    surface.BaseClassSource
                    programSource
                    10000
                    deadlineEpochMs
                    (1 <<< 20)
                    persistence
            | Some observe ->
                JsToolWorkflow.runWithFileAccessObservation
                    surface.Capabilities
                    workspaceRoot
                    surface.BaseClassSource
                    programSource
                    10000
                    deadlineEpochMs
                    (1 <<< 20)
                    persistence
                    (observe ctx)

        { Name = surface.ToolName
          Description = surface.Description
          Arguments =
            [ "program",
              ToolHostCodec.stringSchemaDescribed
                  (JsDescriptionAssets.argProgram (ProviderLanguageBinding.readGlobalPreference ()))
                  factory ]
          Admission = admissionFor surface.RoleName
          Execute =
            fun args ctx ->
                task {
                    match readProgram args with
                    | None ->
                        return
                            ToolHostCodec.tomlObject
                                [ "error",
                                  ToolHostCodec.TString(
                                      JsDescriptionAssets.missingProgram (
                                          ProviderLanguageBinding.readGlobalPreference ()
                                      )
                                  ) ]
                    | Some programSource ->
                        // 10 s sandbox deadline; 1 MiB output bound (JS-054).
                        let! outcome = runProgram ctx programSource

                        return JsToolsResult.render outcome
                } }

    /// Build a ToolSpec for the dedicated js-predictor surface with PrivateAttachment admission.
    let createWithAdmission
        (factory: HostToolFactory)
        (surface: JsSurface)
        (admission: ToolAdmission)
        (workspaceRoot: string)
        (persistence: IJsTransactionPersistence option)
        (fileAccessObservation: (HostToolContext -> JsExplicitFileRead list -> string list -> Task<unit>) option)
        : ToolSpec =
        let spec = create factory surface workspaceRoot persistence fileAccessObservation
        { spec with Admission = admission }
