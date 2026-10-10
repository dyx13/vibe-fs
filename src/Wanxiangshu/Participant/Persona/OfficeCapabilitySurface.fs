namespace Wanxiangshu.Participant.Persona

open Fable.Core
open Fable.Core.JsInterop
open Wanxiangshu.Foundation

/// JS-native office-capability owner. Role and permission labels are vocabulary
/// at this edge; callers never decode Role unions or F# collections.
[<RequireQualifiedAccess>]
module OfficeCapabilitySurface =

    [<Emit("$0 == null")>]
    let private isNullish (value: obj) : bool = jsNative

    let private officeName role =
        match role with
        | Role.Engineer -> "engineer"
        | Role.Coder -> "coder"
        | Role.Inspector -> "inspector"
        | Role.DevOps -> "devops"
        | Role.Browser -> "browser"
        | Role.Inquiry -> "inquiry"
        | _ -> failwith "OfficeCapabilitySurface: catalog contains a non-forkable role"

    /// office-capability-007 / ARCH-017: the canonical manager fork office consequence set.
    let managerForkableOffices () : string array =
        ManagedAgentCatalog.managerForkableRoles |> List.map officeName |> List.toArray

    /// Sorted permission labels for a role. Unknown role fails closed.
    let permissions (roleLabel: string) : string array =
        match Roles.tryParseRole roleLabel with
        | None
        | Some(Role.Coder | Role.Inspector | Role.Browser | Role.Inquiry | Role.Distiller) -> [||]
        | Some role ->
            OfficeCapability.permissions role
            |> Set.toList
            |> List.map OfficeCapability.permissionLabel
            |> List.sort
            |> List.toArray

    /// Unknown role or permission is denied.
    let isAllowed (roleLabel: string) (permissionLabel: string) : bool =
        match Roles.tryParseRole roleLabel, OfficeCapability.permissionOfLabel permissionLabel with
        | Some role, Some permission when Roles.all |> List.contains role -> OfficeCapability.isAllowed role permission
        | _ -> false

    /// capability-enforcement-025: manager gate facts as a plain JS object. The
    /// caller declares the four facts and never sees the F# record.
    let managerFacts
        (hasActiveIncumbency: bool)
        (hasAssessment: bool)
        (isFinalIncumbent: bool)
        (cleanupBlockerDigest: string)
        : obj =
        box
            {| hasActiveIncumbency = hasActiveIncumbency
               hasAssessment = hasAssessment
               isFinalIncumbent = isFinalIncumbent
               cleanupBlockerDigest = cleanupBlockerDigest |}

    let private factsOfJs (facts: obj) : ManagerCapabilityFacts option =
        if isNullish facts then
            None
        else
            let digest: string = facts?cleanupBlockerDigest

            Some
                { HasActiveIncumbency = unbox<bool> (facts?hasActiveIncumbency)
                  HasAssessment = unbox<bool> (facts?hasAssessment)
                  IsFinalIncumbent = unbox<bool> (facts?isFinalIncumbent)
                  CleanupBlockerDigest = if isNullish digest then None else Some digest }

    /// capability-enforcement-025: the fact-driven manager gate. Missing facts and
    /// unknown permission labels both fail closed.
    let managerFactsAllowed (facts: obj) (permissionLabel: string) : bool =
        match factsOfJs facts, OfficeCapability.permissionOfLabel permissionLabel with
        | Some facts, Some permission -> OfficeCapability.isAllowedForManagerFacts facts permission
        | _ -> false
