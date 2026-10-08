# 2026-10-08 unit long-tail read-only audit

Input: `0c6c170d3c0273187f024cbb2ca6fb5e30c26ec2` (HEAD read directly).
Log: `.fable-build/verify-logs/2026-10-08T03-16-15-834Z/unit.log`.
Log SHA256: `fd280f8eb8b96c759e1b32be8901c532493a5545d598c547604eba199497af80`.
Scope: read AGENTS, verification-system WHAT, runner, actual fixtures, existing plans, and this actual log. No tests/builds or repository edits performed. This audit does not supply a new test verdict.

## What the failed run actually proves

- Planned 824 files. At the original 300000 ms physical backstop, 823 drained / 1 active / 0 queued (log 10351–10358).
- The sole active file was verification-system/016, worker PID 29403; start at 207940.723542 ms (log 9096).
- Every other planned file had drained by 231453.237917 ms (log 9666). The final second lane was idle for approximately 68546.762083 ms before the backstop. This is a measured scheduling long tail, not evidence that the last named test hung.
- The last physical event was `tool-spawned`, tool PID 33439 at 1791429736167, in the fresh-cache graph-change case. It was a new in-progress call, not a 30 s verdict-silence failure (log 10348–10350).
- Authoritative overall pass/fail/skip/TODO counts are unknown. Cleanup: outer PID 3641 group verification/reclamation accepted=true, elapsed 18.370 ms. This is the original outer cleanup receipt only, not an invented certificate for every unknown resource.

## Actual cost observations

All durations below derive from same-worker phase pairs, not wall-minus-CPU guesses. Nested harness lifecycle lines were excluded from top-level file totals. The three nested fixture filenames are not part of the planned 824 and must not inflate completion counts.

| Activity in worker 29403 | completed pairs | Sum ms | min / max ms |
| --- | ---: | ---: | --- |
| node-tools archive-enter → archive-written | 14 | 1563.708 | 0.946 / 225.490 |
| node-tools prepare-enter → prepare-settled | 29 | 18666.002 | 0.030 / 2544.180 |
| npm version-enter → version-completed | 10 | 680.699 | 63.244 / 89.347 |
| npm tool-capture-enter → tool-archive-written | 8 | 3974.050 | 398.814 / 744.186 |
| npm archive-install-enter → archive-install-settled | 10 | 24098.017 | 0.047 / 3669.279 |
| npm fixture-dispose-enter → fixture-disposed | 10 | 285.183 | 0.700 / 264.415 |

The 10 npm archive-install pairs include two deliberately pre-aborted calls; 8 were complete selected-tool operations. Pair durations overlap internal tool durations, and must not be added to them as independent elapsed cost.

115 complete selected-tool monitors:

- monitor start → actual tool spawn: 3434 ms total, max 42 ms;
- actual tool spawn → tool exit: 48924 ms total, max 1361 ms;
- tool exit → group-drained: 2262 ms total, max 42 ms;
- group-drained → monitor closed: 628 ms total, max 427 ms;
- complete monitor lifetime: 55248 ms total.

There is no evidence of a fixed 1 s cleanup sleep causing this run. `verification-tool-monitor.mjs:74–77` only repeats its 20 ms delay when live group members remain; actual cleanup phases above are short.

19 completed NuGet fixture executable paths each had two launches. Their first actual process lifetime totaled 10210 ms (mean 537.368 ms); second totaled 548 ms (mean 28.842 ms). Log lines 10141–10345 preserve the individual pairs. Each fixture writes a new selected executor (`nuget-project-tests.mjs:147–150`), and prepare launches evaluation then restore (`verification-nuget-project.mjs:125,156`). The correlation with first launch of a new executable is real. Its OS-level cause is unknown: the log does not identify macOS security scanning, disk IO, or CPU contention. Do not report one of those as established.

823 complete top-level file lifecycle intervals sum to 438657.401 ms. 821 complete worker-cost intervals sum to 408273.594 ms, and their self CPU user+system sum to 315424.814 ms. The missing two cost receipts and active 016 exit are not zero. Intervals overlap because there are two workers; these sums are not suite wall time or an authoritative summary.

## Current implementation and boundaries

- `walk.mjs:51` sorts paths lexically. `tests/run.mjs:76–84` passes this default discovery order through. `run-inner.mjs:194–198` assigns the next listed file to the next available lane. Default lexical package order caused verification infrastructure to enter late, while its monolithic 016 owns many independent physical boundaries.
- W1 already changed the Node candidate fixture archive producer to streaming pipeline + incremental digest (`node-tool-candidate-tests.mjs:44–61`). The measured 14 archive writes totaling 1.564 s do not justify redoing W1.
- A distinct npm archive fixture still uses `chunks` and `Buffer.concat` (`npm-tool-archive-tests.mjs:145–152`): 8 independent 125545984-byte archives were written. A later streaming change could remove these buffer copies while preserving raw-byte checks, modes, consumers and independent ownership. Its measured capture cost is only 3.974 s total including capture setup; it is not a proved solution to the full-suite backstop.
- Do not cache prepared SDK/tool owners or archive identities to eliminate new-executable startup cost. Those are independent mutating/cancellation/ownership cases, not proved identical immutable pure computations.

## Assessment of infrastructure-first default discovery

A stable partition that places the **whole verification-system package** before other default-discovered unit files is a reasonable scheduling choice with no reduced file set, provided the original discovery exclusions, intra-group order, remaining package order, explicit TESTS_MJS_FILES order, worker count, per-file isolation and all budgets remain unchanged.

There is no current WHAT clause explicitly requiring infrastructure-first scheduling. The rationale is the package's actual ownership of runner, verdict, cleanup, snapshot and complete-scope self-checks, plus the observed 68.547 s idle long tail. Do not claim WHAT[005] establishes a dependency requiring all infrastructure tests to pass before any product test starts: mere priority admission at concurrency 2 cannot guarantee that.

This change could reduce idle makespan; it does **not** reduce the true 016 cost, prove all pending cases fit, or close the broader throughput problem. The new full frozen input must run once through the original complete entry to establish its own result. The original 300 s failure remains a failure.

Suggested formal proof before implementation:

1. Under WHAT[021], build a fixture repository with exact independently enumerated expected files: verification-system, verification-system-extra (negative prefix control), ordinary packages, e2e, integration and .fixture files. Assert exact complete set/multiplicity, stable whole-package priority and original within/remaining order. Existing lexical implementation must fail the new priority assertion.
2. Assert an explicit override's mixed order, duplicates and missing paths are preserved rather than sorted, removed or silently normalized.
3. Under WHAT[006], use original runTestFiles with two lanes and controlled file-entry/barrier events. Both initial lanes must admit infrastructure files; releasing one must admit the next infrastructure file before a product file; after infrastructure is admitted, product files proceed. Use causal messages/held barriers, not sleeps or wall-speed assertions. Wire the tested default selection function into the real run.mjs path; a detached selector test does not prove the actual entry changed.
4. Keep original assertion-failure, pending-proof, physical-backstop and cleanup negative controls, and distinguish queue admission from test completion.

No production change or new green verdict is asserted by this audit.
