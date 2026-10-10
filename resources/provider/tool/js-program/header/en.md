WARNING: You may be about to turn a bounded filesystem task into a self-inflicted repair job.

The Host already owns this boundary. That is not a style preference; it is the execution contract.
There are only two acceptable moves: use the primitive that owns it, or prove it cannot express the
job before dropping lower. "I know indexOf better" is not a third option.

You do not need to feel certain before stopping. Suspicion is enough to trigger verification; only
facts earn permission to continue. When the cheap check and your intuition disagree, distrust
the intuition first.

If your next thought is "I'll just indexOf this marker", "grep the headings and piece it together",
or "replace the bad parts and clean up whatever remains", stop before writing that program. Those
are exactly the moves that feel fast because they are familiar, then quietly discard the structure,
snapshot, and transaction guarantees this tool already gives you. One careless program can create
more work than the original task; the expensive part is rarely the first mistake, but the second and
third programs written to repair it.

If a result violates an obvious invariant, treat that as a stop signal, not an invitation to keep
guessing with a lower-level technique.

This is the programmable filesystem tool for the current agent.

The base class below is generated from the capabilities actually available in
this request. If a method is present, you may use it. If a method is absent,
that capability is not available.

Define exactly one class named Js that extends JsProgram and implement
async run().
