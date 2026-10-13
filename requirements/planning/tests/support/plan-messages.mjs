// requirements/planning/tests/support/plan-messages.mjs — real Host message
// rows + canonical messageCursors builders for the planning tenure-isolation
// contract.
//
// A Host message is exactly `{ info, parts }`: the stable id and role live on
// `info`, the semantic payload lives in `parts`. This is the single shape the
// production decoders read (ProviderWireCapture / ProviderWireDecode) and the
// shape the durable XTrace keys on, so fixtures, the LWR_prev record and test
// assertions all use it — no parallel top-level `id`/`role`/`content` copy.
//
// The canonical first-observation evidence is the 4th assembly argument: a
// plain `id -> bigint` map keyed by the stable `info.id`. Cursors live ONLY in
// that map, never on the message.

/** A Host message row: `{ info: { id, role, ...extra }, parts }`. */
export const hostMessage = (id, role, parts, extra = {}) => ({
  info: { id, role, ...extra },
  parts,
})

/** Real user text message. */
export const userText = (id, text) => hostMessage(id, 'user', [{ type: 'text', text }])

/** Real assistant text message, optionally carrying its physical parentID. */
export const assistantText = (id, text, parentID) =>
  hostMessage(id, 'assistant', [{ type: 'text', text }], parentID ? { parentID } : {})

/** Real tool-result row for a completed tool call. */
export const toolResult = (id, tool, output) =>
  hostMessage(id, 'assistant', [
    { id, type: 'tool', callID: id, tool, state: { status: 'completed', output } },
  ], { name: tool })

/** Real assistant tool-call row (the call side of an atomic pair). */
export const toolCall = (id, tool, args) =>
  hostMessage(id, 'assistant', [{ id, type: 'tool', callID: id, tool, state: { status: 'running', input: args } }], {
    name: tool,
    parentID: `${id}-parent`,
  })

/** A synthetic previous-record row exactly as production emits it. */
export const syntheticLwr = (incumbencyId, workId, text) =>
  hostMessage(`lwr-prev-${incumbencyId}`, 'user', [{ type: 'text', text }], {
    sessionID: workId,
    synthetic: true,
    source: 'plan-tenure-record',
  })

/**
 * Build the canonical messageCursors plain object from an `{ id: bigint }` map.
 * Values MUST be scalar bigints — this is the canonical first-physical-
 * observation evidence, never a fabricated cursor on a Host message.
 */
export const cursors = (entries) => ({ ...entries })

// ── accessors: read the single Host shape, never a top-level copy ───────────

/** The stable Host id of an assembled message row. */
export const msgId = (message) => message.info.id

/** The role of an assembled message row. */
export const msgRole = (message) => message.info.role

/** Concatenated text of a row's text parts (the model-visible text). */
export const msgText = (message) =>
  message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')

/** Ordered ids of an assembled message list. */
export const ids = (messages) => messages.map(msgId)
