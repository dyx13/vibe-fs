Temporary formal harness migration drafts, not executed by this audit agent.
Parent owns repository application, red/green execution and final records.

Input actual red: host-owned-harness-red.log,290planned/290completed,281pass9fail,11.8s. Eight failures are old ownerless/_child lifecycle fixture assumptions; one is obsolete SIGKILL source-location scanning. This is separate from full release/integration file counts.

host-harness-migration.patch
Only integration/harness/cases.mjs. Migrate two old EventEmitter/_child fixtures to the new explicit owner.terminal AbortSignal; actual HTTP request receipt triggers the code17 terminal without sleep. The original signal must have one observer during the request and zero after readiness settles even if host._owner changed to null. Existing ownerless real HTTP assertions remain unchanged and depend on parent preserving optional lifecycle observation in production.
Replace dispose source scanning with behavior: explicit owned completion failure rejects with the exact original error/code; stop closes the owner once; unrelated actual HTTP listener remains live; public disposal state resets. Existing actual leak probe and new successful stop case retain PID/port/group disposal coverage.

host-harness-lifecycle-cases.patch
Only integration/harness/readiness-cases.mjs. Adds two cases to the unchanged runner: public actual Host PID/exitInfo mapping and ready stdout arriving before started admission. Full harness becomes292cases; no existing case, negative control, skip or TODO is removed. GATE_HOST_START_TIMEOUT_MS5000 and all runner budgets/concurrency remain unchanged.
Both launch a real executable stub and the real owned-tool monitor in a private isolated child subject so native ChildProcess hooks cannot affect eight concurrent harness cases. They assert the stub's own PID/PGID/parent identity, one actual Host spawn, zero terminal observers after readiness, actual Host+monitor groups empty after stop, and public reset. ProcessHost.stop retains its actual port closure assertion.
Actualexit23 is triggered immediately by the real /global/health request handler. Native socket rejection can precede monitor completion, so the test separately asserts global-health start failure and awaits actual completed before asserting selected23/null, no monitor failure and public exitInfo23/null. It does not assume a code23 string is always the earliest HTTP failure.
Early-ready intercepts only the actual first verification-tool-started IPC delivery. It releases that exact message only after complete actual ready stdout has been observed and forwarded into the Host ring. No sleep, guessed microsecond ordering, probability retry or synthetic ready line is used. Removing the production buffered-read consumption must fail this controlled case.

All results for these drafts are not-run until parent applies and executes them. These are local infrastructure acceptance cases, not complete installed Host,44-file integration, Long Stroke or release proof.
