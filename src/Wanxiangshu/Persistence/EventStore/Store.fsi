namespace Wanxiangshu.Persistence.EventStore

[<RequireQualifiedAccess>]
module EventStore =
    val createLocal: commonDir: string -> writerId: string -> integrator: ICanonicalIntegrator -> IEventStore

    /// durable-events-005: create with an injected single-segment byte cap;
    /// `createLocal` uses the 64 MiB default.
    val createLocalWithSegmentCap:
        commonDir: string -> writerId: string -> segmentCap: int -> integrator: ICanonicalIntegrator -> IEventStore
