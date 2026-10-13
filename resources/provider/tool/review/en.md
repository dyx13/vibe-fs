# Tool · review

Submit this incumbency's stage review, deciding the gap to the next milestone. Shares the tool name and the three-question semantics with the Manager's review; the Plan backend's review target is the next milestone, derived from the current stage: `S1` targets `S2` (understanding and paths ready), `S2` targets `S3` (process and pseudocode ready), `S3` targets becoming the last runner (delivery authority granted).

## Contract and Usage

1. **Three Questions**: formalize the target state; state the current gap to it; decide whether the gap set is empty.
2. **findings Pairs**: `findings` is an array of `acceptance_criteria` and `work_plan` pairs. Each non-empty gap yields one acceptance criterion (the formalized target state) and one work plan (how to close the gap). An empty array means the gap set is empty.
3. **Consequences**: an empty set promotes — `S1` to `S2`, `S2` to `S3`, `S3` grants delivery authority. A non-empty set keeps the incumbency in place; the gaps return as repair obligations.
4. **Once Per Incumbency**: after this incumbency has been reviewed, further calls are rejected with a typed error. Repair quality is reviewed independently by the next runner; you do not self-certify.
5. **Object of Review**: the gap, not a self-assessed completion score. The first runner and every successor face the same standard.
