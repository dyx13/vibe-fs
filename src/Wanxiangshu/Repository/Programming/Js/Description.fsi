namespace Wanxiangshu.Repository.Programming.Js

type JsExample =
    { Requires: Set<JsCapability>
      Source: string }

module JsCanonicalDescription =
    [<RequireQualifiedAccess>]
    module Path =
        [<Literal>]
        val Header: string = "tool/js-program/header"

        [<Literal>]
        val EditPrelude: string = "tool/js-program/edit-prelude"

        [<Literal>]
        val EditStructuralGuidance: string = "tool/js-program/edit-structural-guidance"

        [<Literal>]
        val Footer: string = "tool/js-program/footer"

        [<Literal>]
        val Contract: string = "tool/js-program/contract"

        [<Literal>]
        val ContractEditRecommendation: string = "tool/js-program/contract-edit-recommendation"

        [<Literal>]
        val ContractParallelEdits: string = "tool/js-program/contract-parallel-edits"

        [<Literal>]
        val ContractParallelReads: string = "tool/js-program/contract-parallel-reads"

        [<Literal>]
        val VerbRead: string = "tool/js-program/verb-read"

        [<Literal>]
        val VerbSearch: string = "tool/js-program/verb-search"

        [<Literal>]
        val VerbTransform: string = "tool/js-program/verb-transform"

        [<Literal>]
        val VerbRewrite: string = "tool/js-program/verb-rewrite"

        [<Literal>]
        val VerbCreate: string = "tool/js-program/verb-create"

        [<Literal>]
        val ReadRules: string = "tool/js-program/rules-read"

        [<Literal>]
        val GlobRules: string = "tool/js-program/rules-glob"

        [<Literal>]
        val GrepRules: string = "tool/js-program/rules-grep"

        [<Literal>]
        val EditRules: string = "tool/js-program/rules-edit"

        [<Literal>]
        val WriteRules: string = "tool/js-program/rules-write"

        [<Literal>]
        val MutationRules: string = "tool/js-program/rules-mutation"

        [<Literal>]
        val UltraFraming: string = "tool/js-program/ultra-framing"

        [<Literal>]
        val UltraUnavailable: string = "tool/js-program/ultra-unavailable"

        [<Literal>]
        val UltraEngineering: string = "tool/js-program/ultra-engineering"

        [<Literal>]
        val UltraInvestigation: string = "tool/js-program/ultra-investigation"

        [<Literal>]
        val UltraDevOps: string = "tool/js-program/ultra-devops"

        [<Literal>]
        val UltraManagerInvestigation: string = "tool/js-program/ultra-manager-investigation"

        [<Literal>]
        val UltraPlan: string = "tool/js-program/ultra-plan"

        [<Literal>]
        val MechanicalSemantic: string = "tool/js-program/mechanical-semantic"

        [<Literal>]
        val CommentAnchorOwnSearch: string = "tool/js-program/comment-anchor-own-search"

        [<Literal>]
        val CommentIgnoreGy: string = "tool/js-program/comment-ignore-gy"

        [<Literal>]
        val CommentHostCapability: string = "tool/js-program/comment-host-capability"

        [<Literal>]
        val ReasonEmptyStringPattern: string = "tool/js-program/reason-empty-string-pattern"

        [<Literal>]
        val ReasonInvalidRegexp: string = "tool/js-program/reason-invalid-regexp"

        [<Literal>]
        val ReasonPatternType: string = "tool/js-program/reason-pattern-type"

        [<Literal>]
        val ReasonAnchorEmptyNames: string = "tool/js-program/reason-anchor-empty-names"

        [<Literal>]
        val ReasonAnchorReserved: string = "tool/js-program/reason-anchor-reserved"

        [<Literal>]
        val ReasonAnchorNamesDiffer: string = "tool/js-program/reason-anchor-names-differ"

        [<Literal>]
        val ReasonAnchorNamesUnique: string = "tool/js-program/reason-anchor-names-unique"

        [<Literal>]
        val ReasonAnchorNotFound: string = "tool/js-program/reason-anchor-not-found"

        [<Literal>]
        val ReasonUnknownAnchor: string = "tool/js-program/reason-unknown-anchor"

        [<Literal>]
        val ReasonInvalidSlice: string = "tool/js-program/reason-invalid-slice"

        [<Literal>]
        val ReasonFileReadFailed: string = "tool/js-program/reason-file-read-failed"

        [<Literal>]
        val ReasonRunUnimplemented: string = "tool/js-program/reason-run-unimplemented"

        [<Literal>]
        val ReasonEditInvalid: string = "tool/js-program/reason-edit-invalid"

        [<Literal>]
        val ReasonEditNotFound: string = "tool/js-program/reason-edit-not-found"

        [<Literal>]
        val ReasonEditAmbiguous: string = "tool/js-program/reason-edit-ambiguous"

        [<Literal>]
        val ReasonEditOverlap: string = "tool/js-program/reason-edit-overlap"

        [<Literal>]
        val ReasonEditAtomicity: string = "tool/js-program/reason-edit-atomicity"

        [<Literal>]
        val ReasonEditPreview: string = "tool/js-program/reason-edit-preview"

        [<Literal>]
        val ReasonEditCopyReady: string = "tool/js-program/reason-edit-copy-ready"

        [<Literal>]
        val ReasonEditAttempted: string = "tool/js-program/reason-edit-attempted"

        [<Literal>]
        val ReasonEditUnknownFields: string = "tool/js-program/reason-edit-unknown-fields"

        [<Literal>]
        val ReasonEditCandidate: string = "tool/js-program/reason-edit-candidate"

        [<Literal>]
        val ReasonEditLine: string = "tool/js-program/reason-edit-line"

        [<Literal>]
        val ReasonEditOverlaps: string = "tool/js-program/reason-edit-overlaps"

        [<Literal>]
        val ArgProgram: string = "tool/js-program/arg-program"

        [<Literal>]
        val MissingProgram: string = "tool/js-program/missing-program"

        [<Literal>]
        val HookNotVisible: string = "tool/js-program/hook-not-visible"

    type Prose =
        { Header: string
          EditPrelude: string
          EditStructuralGuidance: string
          Footer: string
          Contract: string
          ContractEditRecommendation: string
          ContractParallelEdits: string
          ContractParallelReads: string
          VerbRead: string
          VerbSearch: string
          VerbTransform: string
          VerbRewrite: string
          VerbCreate: string
          ReadRules: string
          GlobRules: string
          GrepRules: string
          EditRules: string
          WriteRules: string
          MutationRules: string
          UltraFraming: string
          UltraUnavailable: string
          UltraEngineering: string
          UltraInvestigation: string
          UltraDevOps: string
          UltraManagerInvestigation: string
          UltraPlan: string
          MechanicalSemantic: string
          CommentAnchorOwnSearch: string
          CommentIgnoreGy: string
          CommentHostCapability: string
          ReasonEmptyStringPattern: string
          ReasonInvalidRegexp: string
          ReasonPatternType: string
          ReasonAnchorEmptyNames: string
          ReasonAnchorReserved: string
          ReasonAnchorNamesDiffer: string
          ReasonAnchorNamesUnique: string
          ReasonAnchorNotFound: string
          ReasonUnknownAnchor: string
          ReasonInvalidSlice: string
          ReasonFileReadFailed: string
          ReasonRunUnimplemented: string
          ReasonEditInvalid: string
          ReasonEditNotFound: string
          ReasonEditAmbiguous: string
          ReasonEditOverlap: string
          ReasonEditAtomicity: string
          ReasonEditPreview: string
          ReasonEditCopyReady: string
          ReasonEditAttempted: string
          ReasonEditUnknownFields: string
          ReasonEditCandidate: string
          ReasonEditLine: string
          ReasonEditOverlaps: string }

    val fileAlgorithm: prose: Prose -> readSourceLine: string -> raiseFailure: string -> string
    val planFileAlgorithm: prose: Prose -> readSourceLine: string -> raiseFailure: string -> string
    val planEditAlgorithm: prose: Prose -> readSourceLine: string -> raiseFailure: string -> string
    val planRewriteAlgorithm: prose: Prose -> raiseFailure: string -> string
    val runtimePlanBaseClass: prose: Prose -> string
    val publicPlanBaseClass: prose: Prose -> string
    val has: capabilities: Set<JsCapability> -> capability: JsCapability -> bool
    val publicBaseClass: prose: Prose -> capabilities: Set<JsCapability> -> string
    val runtimeBaseClass: prose: Prose -> capabilities: Set<JsCapability> -> string
    val contract: prose: Prose -> toolName: string -> capabilities: Set<JsCapability> -> string
    val rules: prose: Prose -> capabilities: Set<JsCapability> -> string
    val ultraExample: prose: Prose -> roleName: string -> capabilities: Set<JsCapability> -> JsExample option
    val render: prose: Prose -> roleName: string -> toolName: string -> capabilities: Set<JsCapability> -> string
    val renderPlan: prose: Prose -> scope: string -> string
