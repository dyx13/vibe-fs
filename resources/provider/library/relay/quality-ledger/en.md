# Quality Ledger

Class: Binding Ledger

Purpose: the dimensions that must be considered when deciding whether work has earned acceptance.

Authority Boundary: this Ledger does not prescribe a report format, grant mutation or execution authority, or expose review protocol mechanics. It guides judgment; it does not replace judgment.

This Ledger belongs to those entrusted with judgment.

It does not prescribe a report format.
It does not tell you how many paragraphs to write.
It does not require eight headings in every review.
It does not enlarge what you may inspect, execute, or change.

It teaches what deserves attention when deciding whether work has earned acceptance.

The entries are not eight boxes to check off mindlessly.
They are eight directions from which unfinished or poorly structured work tends to show itself.
Walk through the entire Ledger in your mind. Write down only what is genuinely worth saying.

A short review can be completely thorough; a long review can still miss the main point entirely.
The measure is not how much criticism you produce, but the quality of your judgment.

Acceptance must be earned; rejection must also be earned.

## The Weight of Judgment

A work record is a fact. A test result is a fact. A clean build is a fact. A diff is a fact. A convincing explanation is a fact. Source code is a fact.
None of these, on its own, is judgment.

Your task is to decide what the facts actually establish about the work that was required.

Do not reward confidence.
Do not punish unfamiliarity.
Do not reject merely because you would have written the code differently.
Do not accept merely because the implementation looks polished on the surface.

The user's real requirement remains the true measure.
An immediate review focus may direct your attention toward one part of the work, but it cannot erase obligations that belong to the request as a whole.

A lens may narrow your view, but it cannot narrow your responsibility.

## I. Language & Algorithms

Ask whether the implementation speaks its language well and uses mechanisms appropriate to the real problem.

Idiomatic code does not chase trendy fashions. It works with the grain of the language rather than fighting against it.

Check whether the chosen algorithm matches the actual shape of the problem. A logically correct algorithm can still be defective if its cost grows disastrously along a dimension that matters to the task.

Look closely at the trade-offs actually being made.

Signs of trouble include:
repeated representation conversions; manually rebuilding behavior the platform already provides; picking data structures just to suit a single call site; hidden quadratic complexity; inventing concurrency where things are not independent; forcing serialization where work is independent; mixed error conventions; and low-level patches trying to compensate for an earlier design mismatch.

Novelty itself is not a defect. When standard mechanisms cannot express the necessary semantics, a custom approach may be exactly what is needed.

## II. Simplicity

Simplicity is not merely having the fewest lines, files, or abstractions.
Simplicity is the absence of complexity that has not earned its keep.

Every abstraction asks future readers to learn a new concept.
Every compatibility layer asks future maintainers to look after two worlds at once.

A good abstraction makes an important truth easier to state once.
A bad abstraction merely gives a fancy name to an accident.
A good state variable holds a fact that cannot safely be derived.
A bad state variable memorizes something the world already knows.

If a value can be derived cleanly from durable facts, question whether storing it separately is necessary.

Aggressive deletion is not automatically simplicity. Removing an explicit concept can force the remaining code to rely on invisible conventions.

Simplicity is not poverty; it is economy without loss of meaning.

## III. Structure

Structure is where responsibilities are placed.
A well-structured system has boundaries that correspond to real differences in responsibility.

Be suspicious when the same decision is made across multiple layers.
Be suspicious when a lower layer knows why a high-level business action happens.
Be suspicious when transport code decides semantic policy.
Be suspicious when domain truth is reconstructed by scraping formatted text.
Be suspicious when an adapter turns into a second owner.
Be suspicious when two modules must change together every single time.

Beware of architecture performed merely for show.
A new interface does not automatically create a boundary.
A dependency injection layer does not produce a meaningful distinction just by inserting indirection.

Structure is sound when the shape of the program follows the shape of responsibility:
one semantic decision has one owner;
observations flow inward without seizing decision rights;
effects happen behind clear contracts that define what they do;
internal machine state stays behind the scenes;
causal relationships are made explicit rather than guessed from arrival order.

A boundary earns its place only when crossing it changes what may legitimately be known, decided, or done.

## IV. Granularity

There is no virtuous number of lines.
Thirty lines are not inherently better than eighty.

Judge granularity by semantic pressure, not by counting lines.
A unit may be too large when independent responsibilities share a single lifecycle.
A unit may be too small when a straightforward idea is fragmented across too many tiny pieces.

Ask:
Could this part change for reasons completely unrelated to the rest?
Does this unit hold several different kinds of knowledge at once?
Does extracting this piece reveal a genuine concept, or merely move syntax around?

Repetitive mechanical structure may justify extraction; repeated phrasing does not always mean identical meaning.

Cut where responsibility changes, not where a ruler hits a number.

## V. Tests & Behavioral Records

Tests are how work earns confidence in its behavior.
The right quantity and kind depend on what changed and what needs to be established.

Do not merely ask: "Were tests added?"
Ask: "What claim about behavior needed proof, and what facts actually prove it?"

A test is useful only when its failure reliably distinguishes correct behavior from a plausible defect.
A test that merely executes a new line proves very little.
A test that mirrors implementation logic can pass even when the underlying contract is broken.
A test that asserts incidental ordering, timing, or private details freezes accidents into dogma.

Important boundaries include: failure and recovery, empty and maximal cases, concurrent events, persistence and restarts, idempotency, compatibility, security, partial success, cancellation, stale state, malformed inputs, and version transitions.

Execution records must have provenance.
Do not assume a command passed because the code looks clean.
Do not assume a test ran because a test file exists on disk.
Do not infer current success from an obsolete run.

A passing test proves only what it was designed to check, and nothing more.

## VI. Logic, Reliability & Boundaries

What happens when assumptions break down?
An operation fails halfway through?
A duplicate request arrives?
Independent events arrive out of expected order?
A process dies between prepare and commit?
A callback arrives after cancellation?
The state changes right after you observed it?
Old durable records are replayed?

Not every task demands elaborate recovery machinery.
Where failure leaves no messy partial state, adding heavy recovery logic is itself a defect.

Common causal mistakes include:
confusing completion with correctness; confusing arrival with causality; confusing history with current state; confusing a successful write with a successful outcome; assuming a timeout means work has stopped; assuming a retry is a brand new semantic act; and confusing capability with authority.

Watch for invariants broken by interruption, reordering, duplication, or stale observations.
Watch for security boundaries that exist only in documentation while runtime capabilities remain far too broad.

Do not invent machinery for imaginary catastrophes. Protect the boundaries the real world actually has; do not invent a phantom world just to demonstrate caution.

## VII. Caller Ergonomics

An implementation is not complete simply because its internal machinery works.
Someone must live with its public surface.

A good surface makes the right action feel natural.
A poor surface forces callers to reconstruct internal mechanics before they can do anything.

A tool name should mean the exact same act wherever it is used.
A field should exist because the caller needs it, not because the internal storage happens to have it.
Do not expose internal state labels when the system already knows the next instruction to run.
Internal IDs should not leak across boundaries just because machines need correlation.
Return values should not merely echo back what the caller just provided.

Compatibility matters, but compatibility is not the worship of every past accident.
A surface is part of the system's logic; friction imposed on callers is real complexity.

## VIII. Completeness

Completeness asks whether the work has fulfilled the obligation that brought it into being.
This is not the same as whether the core code exists.

Watch for language that disguises abandonment:
calling required work "out of scope";
calling an existing requirement a "future enhancement";
calling a bug introduced by the change a "known limitation";
calling broken invariants "good enough";
deferring tasks that could be done right now to "the next session";
or pointing to effort, elapsed time, or clean milestones as if hard work discharges an obligation.

Honesty is not completion currency. Admitting that required work remains is valuable because it prevents self-deception, but it is also direct proof that completeness has not yet been achieved. Required work remains blocking until it is finished, transferred to a real owner who is actually present, or made impossible by a concrete boundary.

Do not turn every hypothetical improvement into unfinished work. The repository may have older flaws unrelated to your assignment without invalidating what you did.

Ask the causal question:
If left as it is, is the requested outcome still materially incomplete?

Then ask the residual-action question:
Can you name a concrete, useful, authorized action that would advance an unmet requirement? If you can, and no concrete boundary blocks you, acceptance is premature. You do not need to show that a mountain of work remains; one live required action is enough.

Completeness means finishing this road, not paving every road in sight.

## On Materiality

A reviewer must distinguish a real defect from personal taste.

This is not permission to ignore small things.
A single character error can invalidate a protocol; a missing await is a tiny edit that causes severe failure.

The size of an edit and the materiality of its consequences are completely different things.

A concern deserves weight when it affects user requirements, correctness, invariants, behavior, security, recovery, maintainability at meaningful boundaries, public or internal contracts, or work made significantly harder in the future.

Do not invent severity to justify personal taste. Do not dismiss an issue just because the fix is small.

Small is not harmless; large is not important. Trace the consequences.

## On Facts

Facts have weight, scope, and age.
Let each fact support only the claims it can genuinely bear.
Prefer direct facts when distinctions matter.
A decisive counterexample can settle an inquiry immediately; the absence of a counterexample is not automatic proof.

Trust facts in direct proportion to what it actually distinguishes.

## On Independence

Judge the work as you find it.

Do not soften a verdict just to be kind; do not harden one just to seem strict.
Do not inflate an evaluation to reward effort, nor deflate it to perform rigor.

Each assessment stands on its own: judged by the facts present and the obligations undertaken. Record honestly what the facts establish about the required work — nothing more, nothing less. An honest evaluation is itself an act of judgment.

## On Simplicity and Thoroughness

Thoroughness does not mean investigating everything under the sun.
When a decisive defect is already established, do not waste resources gathering ceremonial proof.
When no defect has appeared, but acceptance relies on unsupported assertions, keep verifying.
When multiple independent observations are worth making, gather them together.
When the next observation depends strictly on the meaning of an earlier one, understand the earlier one first.

Be economical without being timid; be thorough without ritual.

## On Existing Imperfection

Old code may look awkward, and existing tests may follow conventions you dislike.
Your review is not a license to redesign everything the current work touches.

Distinguish among:
a pre-existing problem that prevents the current work from being correct;
a pre-existing problem that the new work makes materially worse;
a pre-existing condition that the new work legitimately depends on;
and neighboring imperfections unrelated to the task at hand.

The first three matter; the fourth is not yours to prosecute today.
Judge scope by obligation, not by habit.

## On Tests That Pass / Work That Looks Elegant

A passing test suite deserves respect; it is a record bought with real resources.
Do not brush it aside merely to show off skepticism.
Yet never ask passing tests to prove things they were never designed to examine.

Elegant code can still be wrong.
Do not let polished style borrow confidence that the facts have not earned.
Still, when two designs satisfy the same requirements, elegance is not irrelevant: code with fewer unnecessary moving parts is usually easier to maintain.
The mistake is treating elegance as proof of correctness.

## On Rejection / Acceptance

Rejection is not punishment.
A constructive rejection identifies exactly which requirement has not been met.
Point out where the defect is, and explain its consequences.
Unless an implementation detail is explicitly required, do not dictate the exact coding pattern to use.

Distinguish between "Write it my preferred way" and "This pattern allows two writers to mutate state that must have one owner."
The first is personal taste; the second is a well-reasoned defect.

Acceptance is not the absence of complaints.
Acceptance is the informed judgment that no material obligation remains unsupported or violated, given the facts reasonably required.
Before accepting, ask:
What would still make this work materially incomplete?
What important failure could the current facts have failed to uncover?
Am I mistaking personal familiarity for objective correctness?
Am I manufacturing objections just because a reviewer is supposed to find something?

A reviewer who cannot accept good work is not strict; they are inaccurate.

The goal of judgment is not rejection, but honest discernment.

## The Eight Entries Together

These dimensions keep one another in check.
Language without simplicity becomes cleverness.
Simplicity without structure becomes mere compression.
Structure without granularity becomes a museum of fragments.
Granularity without completeness optimizes pieces while losing the task.
Tests without logic certify the wrong behavior.
Logic without ergonomics makes correctness difficult to use safely.
Ergonomics without completeness makes unfinished features pleasant to call.
Completeness without restraint becomes scope creep.

Do not maximize one dimension at the expense of the others.
Aim for work where these dimensions remain in harmony with the real assignment.
Consider the entire Ledger, and write only what is genuinely worth saying.

## Closing Leaves

The first answer is not automatically true.
A finished implementation is not proof of a correct one.
A passing test suite is not proof of a complete one.
A strange design is not necessarily a bad one.
A small defect is not necessarily harmless.
A personal preference is not a requirement.
A report does not become a fact merely because it sounds confident.
An observation is not a defect until judgment connects it to something that matters.

Acceptance must be earned.
Rejection must also be earned.
Judge the work that exists, against the obligations that exist, with the facts that exist.
