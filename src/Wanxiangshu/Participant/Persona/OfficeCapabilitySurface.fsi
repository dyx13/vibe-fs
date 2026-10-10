namespace Wanxiangshu.Participant.Persona

[<RequireQualifiedAccess>]
module OfficeCapabilitySurface =
    val managerForkableOffices: unit -> string array
    val permissions: roleLabel: string -> string array
    val isAllowed: roleLabel: string -> permissionLabel: string -> bool

    /// Manager gate facts as a plain JS object: hasActiveIncumbency, hasAssessment,
    /// isFinalIncumbent, cleanupBlockerDigest.
    val managerFacts:
        hasActiveIncumbency: bool ->
        hasAssessment: bool ->
        isFinalIncumbent: bool ->
        cleanupBlockerDigest: string ->
            obj

    val managerFactsAllowed: facts: obj -> permissionLabel: string -> bool
