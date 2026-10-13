namespace Wanxiangshu.Mission.Relay.OpenCode

open Wanxiangshu.OpenCode
open Wanxiangshu.Persistence.EventStore

/// relay-assessment-011: the shared `review` shell. Owns the one ToolSpec
/// (name, description, findings schema, admission) and dispatches by caller
/// role: Plan goes to the plan backend (ReviewPlanBackend), every other
/// admitted caller goes to the Manager backend (ReviewBackendManager). The
/// shell renders the plan backend's result; the Manager backend keeps its own
/// result rendering so its byte behavior is unchanged.
module ReviewShell =
    val admission: ToolAdmission
    val spec: factory: HostToolFactory -> scope: ToolRuntimeScope -> planStore: IEventStore option -> ToolSpec
