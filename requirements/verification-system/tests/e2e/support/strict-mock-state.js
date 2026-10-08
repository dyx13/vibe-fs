/**
 * strict-mock-state.js — Provider state record.
 *
 * K9 deleted the legacy edge forest (`pushExpectation`, template dedupe, path
 * cursors). What remains is the request/response bookkeeping plus the alias
 * binding map a scenario uses for session routing diagnostics.
 */

export function createState() {
  return {
    sessionBindings: new Map(), // diagnostic / canary routing only
    unexpected: [],
    requests: [],
    toolCallBatches: [],
    responseCounter: 0,
    idCounter: 0,
    strict: true,
    fatal: null,
    sealedBySession: new Map(),
    stopped: false,
  };
}

export function resetState(state) {
  state.sessionBindings.clear();
  state.unexpected.length = 0;
  state.requests.length = 0;
  state.toolCallBatches.length = 0;
  state.responseCounter = 0;
  state.stopped = false;
  state.fatal = null;
  state.sealedBySession.clear();
}
