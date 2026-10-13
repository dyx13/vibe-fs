namespace Wanxiangshu.Execution.Session

[<RequireQualifiedAccess>]
type SyncDelegateRole =
    | Inspector
    | Coder
    | Engineer
    /// planning-010: the plan ask delegation's fixed DevOps. A dedicated
    /// Work+Attached delegate like the other sync roles; read-only discipline
    /// for its investigations is carried by the DevOps office prompt, not by
    /// a runtime gate.
    | DevOps

module SyncDelegateRole =
    let toAttachmentKind (role: SyncDelegateRole) : AttachmentKind =
        match role with
        | SyncDelegateRole.Inspector -> AttachmentKind.SyncInspector
        | SyncDelegateRole.Coder -> AttachmentKind.SyncCoder
        | SyncDelegateRole.Engineer -> AttachmentKind.SyncEngineer
        | SyncDelegateRole.DevOps -> AttachmentKind.SyncDevOps
