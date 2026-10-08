# 2026-10-08 package interruption and owned resources audit

Read-only audit for input `0c6c170d3c0273187f024cbb2ca6fb5e30c26ec2`. No repository edits, builds, tests, process termination, or scratch deletion were performed. Evidence copies and analysis were written only under `/private/tmp`.

## Original outcome remains failed

`/private/tmp/vibe-fs-oct8-alias-release/independent-package.json` records start `2026-10-08T03:33:33.224Z`, duration `977603.687916 ms`, original timeout `600000 ms`, `timedOut=true`, `exitCode=null`, `signal=SIGKILL`, and `cleanupFailure=null`. Before and after input digest both equal `2583e334543582347c4922f4666c826da10f34d753b001ff48d17b9e12dcdd06`. The child output log is empty. There is no successful package summary and no authoritative pass/fail/skip/TODO count.

The selected npm log `/Users/yuanxi/.npm/_logs/2026-10-08T03_33_45_401Z-debug-0.log` identifies Node 22.23.3, npm 11.12.1, and the actual `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` command. Its configuration paths bind this invocation to `wx-consumer-scratch-2KMDNA/runtime-root` (lines 5–9). It ends after cache entries at line 133, without an exit or completed timing record. Last mtime is `2026-10-08 11:33:46.3806844 +0800`.

`pmset -g log` records Maintenance Sleep at `2026-10-08 11:33:46 +0800` for `963 secs`, then DarkWake at `11:49:49 +0800`. This spans essentially the unexplained wall-clock interval and explains why a 600-second JavaScript timer was only observed after the machine resumed. It does not establish how much execution remained or prove the consumer would pass. Do not subtract sleep and relabel the run as a pass.

## Reached boundary and cleanup

`scripts/verify-package.mjs:656` creates the scratch, then extracts the validated tarball and checks registrations before invoking `runExternalConsumer` at line 671. That helper creates `runtime-root` at line 421 and synchronously runs real npm ci at lines 440–447 before copying the verified package, creating the consumer, and running it.

The surviving scratch contains only `package` and `runtime-root`; `consumer` and `home` are absent. This is consistent with the log ending during npm ci. The isolated consumer execution and final generation/freshness check are not-run, rather than passed. The earlier pack/extract progress does not establish the whole package stage passed.

SIGKILL prevents the `finally` at lines 678–681 from executing. The surviving filesystem directory therefore does not contradict the wrapper's `cleanupFailure=null` process-group receipt. That receipt cannot be expanded into a filesystem cleanup claim. Current scoped `ps` matches the package command and exact scratch name only to check for remaining processes; it found neither, while the current task's `caffeinate -i` guard remains. This is a current command-line match snapshot, not a complete historical descendant inventory.

Exact owned scratch snapshot:

- Path and realpath: `/private/var/folders/g_/3ydzn7kx5lg9ylq8fd9p_13r0000gn/T/wx-consumer-scratch-2KMDNA`.
- Device `16777231`, inode `157404276`, uid `501`, directory mode `040700`, mtime ns `1791430425127989149`.
- Runtime entries: `.empty-global-npmrc`, `.empty-npmrc`, `node_modules`, `package-lock.json`, `package.json`.

Cleanup recommendation: after preserving these receipts, recheck that exact path, realpath, device and inode still match, then remove only this one task-owned scratch. Do not sweep similarly named directories or the user's npm cache/logs. No deletion was performed during this audit. Preserve the active `caffeinate -i` guard owned by parent session `35771` (observed PID `46710`); `pmset` confirms `PreventUserIdleSystemSleep=1`. This assertion is an idle-sleep guard, not proof that every possible system sleep cause is disabled.

## Preserved evidence

Evidence directory: `/private/tmp/vibe-fs-oct8-package-sleep-audit/`.

- `metadata.json`: capture time, exact paths, device/inode/uid/mode/size/mtime ns and SHA256 for all original receipts and the archive; bounded scratch entries.
- `independent-package.json`, `independent-package.log`, `independent-package-console.log`: exact copied original receipts.
- `2026-10-08T03_33_45_401Z-debug-0.log`: exact copied npm log.
- `pmset-sleep.txt`: matching sleep/DarkWake/WakeTime records.
- `pmset-owned-caffeinate.txt`: current guard assertion.
- `process-scope.json`: timestamped, narrowly scoped current command-line process snapshot.
- `wanxiangshu-0.9.0.original-9538a6c7.tgz`: preserved original archive, before a later package verification can overwrite the repository's fixed output name.

Original archive path: `/Users/yuanxi/Workwork/vibe-fs/.fable-build/verify-logs/package/wanxiangshu-0.9.0.tgz`. SHA256 `9538a6c7f81326a0fd1ab14c0cda6e6d3143fcdda3179b6c529c2b2fb601fb2b`, size `2532520` bytes. Read-only tar inventory counted `2073` members and `12486826` uncompressed regular-file bytes; `package.json` identifies `wanxiangshu@0.9.0`. This inventory is preservation evidence, not a substitute for the real package verifier's closure and consumer checks.

Original receipt SHA256 `dd79d2f43b5443981acc9d0d9d0bbf449a0d450cf3a4da4ee0db029ae5d4c5e0`; npm log SHA256 `06ef1647d47949ff095f24422e60143e4b59f5d7beedf0f2a595082aecf1b25b`.

## Acceptance implication

Classify this original run as environment-interrupted package failure with consumer not-run. A fresh, unchanged-input package execution under the original 600-second budget is needed for acceptance. Its result must be a separate receipt and must not overwrite or retroactively turn this original SIGKILL run green.
