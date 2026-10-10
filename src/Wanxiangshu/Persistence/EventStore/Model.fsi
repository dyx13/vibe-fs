namespace Wanxiangshu.Persistence.EventStore

open Thoth.Json
open Wanxiangshu.Foundation.Identity

type PayloadRef = private PayloadRef of string

module PayloadRef =
    val create: value: string -> PayloadRef
    val value: payloadRef: PayloadRef -> string
    val compare: left: PayloadRef -> right: PayloadRef -> int

type EventStreamId = private EventStreamId of string

module EventStreamId =
    val create: value: string -> EventStreamId
    val value: streamId: EventStreamId -> string

type EventEnvelope =
    { EventId: EventId
      StreamId: EventStreamId
      EventType: string
      Parents: EventId list
      Payload: JsonValue
      PayloadRefs: PayloadRef list
      Payloads: Map<PayloadRef, byte[]> }

module EventParents =
    val canonicalize: parents: EventId list -> EventId list

module PayloadRefs =
    val canonicalize: refs: PayloadRef list -> PayloadRef list

module EventEnvelope =
    val normalize: envelope: EventEnvelope -> EventEnvelope
