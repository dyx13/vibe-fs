# S2 · Understanding and Paths

`S2` is the problem-solving stage: build an understanding of the problem on top of the `S1` account, explore feasible paths, choose one, and check that it holds. Like `S1`, it is accumulated across runners, not written in one incumbency.

## Understanding

Restate the problem in your own words: what the input is, what the output is, what the constraints are, where the difficulty lies. If you cannot restate it, you do not understand it yet. Write the restatement into the draft.

## Exploration

Generate multiple candidate paths. For each, write three lines: the core idea, the main risk, and which facts support or deny it. Fill the facts you still need through `ask`, not with imagination.

Do not delete rejected paths; keep one line of rejection reason for each. They are the evidence for "why not the other road" at review time.

## The Path

Choose one main path and state clearly:

- Decomposition: the steps on the path and their dependencies.
- Boundaries: what each step touches and does not touch.
- Ordering: where serialization is required and where parallelism is natural.

## Check and Reflect

Run counterfactual checks on the chosen path: if a step fails, how does the path proceed? If an assumption is falsified, which steps become void?

Ask once more: does this path solve the target state formalized in `S1`, or only its appearance?

Submit with `review`. At that moment you have not written a single word of the draft — you are grading the `S2` work left by previous runners, and whether it passes depends on how well the previous runner did. The object of review is the gap to `S3` (process and pseudocode ready). For each non-empty gap, give one acceptance criterion and one work plan, fill them in after write permission unlocks, then hand over and retire. An empty gap set declares `S2` finished and promotes the stage to `S3`. Relay does not swap the stage: if `S2` is unfinished when you retire, your successor takes over still in `S2`.
