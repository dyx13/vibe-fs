namespace Wanxiangshu.Execution.Session

[<RequireQualifiedAccess>]
type SyncDelegateRole =
    | Inspector
    | Coder
    | Engineer
    | DevOps

module SyncDelegateRole =
    val toAttachmentKind: role: SyncDelegateRole -> AttachmentKind
