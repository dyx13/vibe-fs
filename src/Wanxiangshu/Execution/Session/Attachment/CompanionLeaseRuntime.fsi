namespace Wanxiangshu.Execution.Session.Attachment

open System.Threading.Tasks
open Wanxiangshu.Execution.Session
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.OpenCode

/// The observed allocation origin of a Companion child. The core's `Origin` is the
/// single source; this is its Companion-facing name.
type SatelliteOrigin =
    | Created
    | Reused
    | Replacement

/// DSL-class: PhysicalHandle — HOST-014 session lease identity and observed allocation origin; owner CompanionLeaseRuntime, law HOST-014, proof SatelliteSurface.
type SatelliteLease =
    { SessionId: SessionId
      Origin: SatelliteOrigin }

/// DSL-class: PhysicalHandle — HOST-014 injected session lifecycle ports and physical launch coordinates; owner CompanionLeaseRuntime, law HOST-014, proof SatelliteSurface.
type SatelliteSpec =
    { Kind: SatelliteKind
      Agent: string
      Title: string
      Directory: string option
      RestoredSessionId: SessionId option
      Link: SessionId -> SessionId -> string -> Task<Result<unit, string>>
      Close: SessionId -> Task<Result<unit, string>> }

/// HOST-014: the Companion kind's adapter onto the ONE attachment mechanism. The
/// registry it is given may be shared with every other AttachmentKind, so a kind
/// never sees another kind's bindings.
type CompanionLeaseRuntime =
    new: sessions: ISessionHostPort * registry: AttachmentLeaseRegistry -> CompanionLeaseRuntime
    member Ensure: owner: SessionId * spec: SatelliteSpec -> Task<Result<SatelliteLease, string>>
    member Invalidate: owner: SessionId * kind: SatelliteKind -> unit
    member Retire: owner: SessionId * spec: SatelliteSpec -> Task<Result<unit, string>>
