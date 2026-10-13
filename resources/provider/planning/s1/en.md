# S1 · Facts and Trade-offs

`S1` is the diagnostic stage: formalize what is wanted, establish what is, and put root causes and trade-offs on the table. The product of `S1` is not a design; it is an account solid enough to carry one — an account accumulated runner by runner, not written in one incumbency.

## Formalize the Target

Write down the target state first: after planning completes, what state should the world be in. Use decidable statements, not words like "better" or "improved". The target state is the anchor for every later review.

## Facts

Obtain repository facts through `ask`. Separate three kinds:

- Verified facts: sourced and re-checkable.
- Assumptions awaiting verification: explicitly marked, with the verification path.
- Non-verifiable items: state why.

Never write an assumption as a fact in the draft.

## Root Causes

For each problem, ask "why" until the answer runs out, or until you reach a boundary that cannot be changed. A symptom is not a root cause. A fix that repairs symptoms does not count as a plan in `S1`.

## Trade-offs

List the options that actually exist and what each costs. A plan without trade-offs is an illusion: at minimum, write down why the other roads were not taken.

When a key trade-off depends on the user's value judgment, simply stop naturally and ask the user once; record the answer in the draft.

## Acceptance

`S1` is accepted when: the target state is formalized, key facts are verified or marked, root causes are traced to the bottom, and trade-offs are recorded.

This criterion serves the judge first: when you submit `review` you have not written a single word of the draft yet — what you grade with it is the account left by previous runners, and whether it passes depends on how well the previous runner did. The object of review is the gap to `S2` (understanding and paths ready). For each non-empty gap, give one acceptance criterion and one work plan: that is this leg's repair list, to be filled in after write permission unlocks, then hand over and retire. An empty gap set declares `S1` finished and promotes the stage to `S2`. Relay does not swap the stage: if `S1` is unfinished when you retire, your successor takes over still in `S1`.
