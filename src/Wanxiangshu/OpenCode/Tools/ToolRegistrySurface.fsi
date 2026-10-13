namespace Wanxiangshu.OpenCode

/// JS-native execution-gate surface. ToolRegistry remains the owner of the
/// role predicate; callers provide labels and receive only a boolean decision.
module ToolRegistrySurface =

    /// Unknown role and unknown tool both fail closed.
    val rolePredicate: toolName: string -> roleLabel: string -> bool

    /// capability-enforcement-006: which authority the execute gate resolves for a tool. `office`
    /// needs the session's established public Role; `private-attachment` is an
    /// internal leaf admitted by owner-held evidence and never holds an office.
    val admissionAuthority: toolName: string -> string

    /// capability-enforcement-006: the internal-leaf decision for a session holding no public
    /// office profile. Office tools always answer false here.
    val privateAttachmentAdmits: toolName: string -> sessionId: string -> bool

    /// Provider tool names projected from the same capability set as the gate.
    val capabilityToolNames: roleLabel: string -> requestKindLabel: string -> string array

    val runJsPlan:
        store: Wanxiangshu.Persistence.EventStore.IEventStore ->
        root: string ->
        workId: string ->
        program: string ->
            System.Threading.Tasks.Task<string>

    val jsPlanDescription: language: string -> string
