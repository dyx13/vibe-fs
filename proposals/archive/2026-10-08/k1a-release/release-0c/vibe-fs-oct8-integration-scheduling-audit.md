# 2026-10-08 integration scheduling evidence

Read-only analysis of the original frozen `0c6c170d3` integration run. No test, build, repository mutation or scheduling patch was performed.

Source log `/private/tmp/vibe-fs-oct8-alias-release/independent-integration.log`, SHA256 `98b8b03d43ed29c632db1f5c377c9f6d398d60ef42939704726729a4b690d412`. Recomputed lifecycle receipt `/private/tmp/vibe-fs-oct8-integration-scheduling-audit.json` contains each original file admission/drain line, the arithmetic and the active set. Only the `integration:suites` parent's lifecycle is included; nested distribution and harness events are excluded.

## No evidenced idle capacity to recover by priority alone

The original two-lane parent discovered 44 files. At the original 300000 ms backstop, 41 drained, two remained active, and `verification-system/016` remained queued.

- Sum of all 41 completed admission-to-drain intervals: `298997.141 ms`.
- `durable-events/022` admitted at `48456.563667 ms` (log line 369), so occupied one admission slot for at least `251543.436333 ms` before the backstop.
- `structured-workflow/012` admitted at `250663.833417 ms` (log line 697), so occupied one admission slot for at least `49336.166583 ms` before the backstop.
- Total observed slot occupancy through the backstop: at least `599876.743916 ms`, against `600000 ms` of two-lane capacity. The remaining difference is just `123.256084 ms`, while two files have unfinished work and a whole file has not started.

These are admission wall intervals from one parent monotonic clock, not CPU times and not proof of passing tests. Unlike the unit run's long final idle lane, this integration run has no comparable idle interval that a stable priority partition can demonstrably reclaim. Under unchanged observed per-file service cost, permutation alone cannot complete the missing work within 300 seconds. A new ordering might change contention and hence service cost, but that would require fresh causal measurement; the original receipt does not establish it.

Discovery currently orders package names and then suite filenames (`requirements/verification-system/tests/support/discover-suite-tests.mjs:30–35`), and the orchestrator passes the full set unchanged to the two-lane supervisor (`requirements/verification-system/tests/integration/run.mjs:79–93`). There is no explicit WHAT contract requiring a particular long-running file to go first. Giving 022, 012 or 016 an individual magic priority would not be justified by these data. Bringing the complete verification-system package forward is a defensible default admission policy for infrastructure, but here it can only move which work remains queued and is not a demonstrated capacity fix.

## Real compiler work is present; no proved duplicate can be removed

`durable-events/022` deliberately compiles every bounded locality sequentially, plus real positive and negative closure probes (`requirements/durable-events/tests/022.test.mjs:303–470`), followed by distinct real Journal, EventStore, append-result and Snapshot recovery compile cases (lines 478, 494, 510 and 654). The last actual body at interruption is the Snapshot read-capability compile. Their distinct owners, probes and cold/isolated inputs cannot be merged or cached away merely because compilation calls look similar.

`structured-workflow/012`'s active body invokes nine distinct actual Fable boundary projects together through `Promise.all` (lines 2364–2385). `compileFableDirect` spawns one actual Fable process and a unique output directory per project (lines 2157–2175). This establishes that the two admitted test lanes can create more than two compiler children; it does not establish that this caused the slowdown. The original worker-cost records exclude child CPU and lack final exits for both active files, so CPU saturation or compiler startup duplication remains a hypothesis. This helper also uses plain `spawn`, which deserves the existing ownership review, rather than assuming its fixture cleanup executes when the containing runner is killed.

The smallest evidence-led next investigation is to collect per-invocation actual start/end/selected project/owned process cleanup costs in the existing compiler boundary, then identify a repeated unchanged prerequisite if one exists. Any optimization must retain each distinct compile and negative-control assertion. Merely capping the nine internal children or moving compiler files earlier is not yet a proven fix and cannot be reported as throughput closed. No implementation change is recommended solely on this receipt.

## Original acceptance limitations remain

The original stage exits 1. Four ordinary assertion failures were observed; the parent process group also required reclamation and reports `accepted=false`. Final whole-suite pass/fail/skip/TODO is unknown because the backstop prevented its authoritative summary. Exact input comparison also recorded one changed ignored `requirements/.DS_Store` path; that original frozen-input failure must remain in the receipt. Distribution separately reports 3 pass, 0 fail, 0 skip and 1 TODO, and harness separately reports 290 pass/0 fail. Those results do not turn the truncated parent integration run into a pass.
