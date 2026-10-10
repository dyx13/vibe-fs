# E2E — One World / The Long Stroke

Sole entry: `requirements/verification-system/tests/014.test.mjs`，由 `npm run verify:release` 开启 release 层执行；直接运行文件不会自动开启真实验收。分层和因果进展例子见 [测试说明](../README.md)。

| File | Role |
|------|------|
| `../014.test.mjs` | Only top-level E2E entry (One World) |
| `scenarios/long-stroke.toml` | Provider turn script for the Long Stroke |
| `support/long-stroke-oracles.mjs` | Sequencing / adversity oracles the TOML cannot express |

One continuous OpenCode lifetime (`spawn === 1`). There is no multi-canary pool, no `cases/` suite runner, and no `--repeat` / shuffle release gate.

## What the Long Stroke covers

Public product contracts exercised here (formal docs win on conflict):

- **Join user-message wake (EXEC-017)** — blocked Manager `join` exits with
  `status="interrupted"`, `reason="user_message"` (not `operator_abort`).
- **Consecutive provider failure + fallback** — failure → failed recovery → one successful recovery, with distinct durable episode claims and no retry/return overlap.
- **Manager loop assessment & retirement** — each iteration independently audits the same authority, non-empty findings assign current repair, and retirement closes live resources before the system continues or accepts.
- **Publish conflict / reconciliation** — stale target via `gitConflictProof` invalidates the certificate; another ordinary iteration resolves the conflict and retires, then the rebased candidate is Published.
- **§21 adversity oracles** — see `support/long-stroke-oracles.mjs` (`oracleLongStroke`).

### Strict mock causal hold

`support/strict-mock-responses.js` supports `respond.waitUntil` (a Promise).
While the promise is pending, the mock keeps the SSE open after tokens and only
writes `[DONE]` after resolve. The Long Stroke uses this so a child can stay
incomplete across join + external user message without fixed sleep as the wake
mechanism.

## Related unit proof

`requirements/delegation/tests/015.test.mjs` — real journal-less
join interruption, child completion after interruption, spurious wakes and lock release.

`requirements/change-integration/tests/014.test.mjs` and `015.test.mjs` — real verdict
mailbox drain-before-interrupt, removal of interrupted waiters, bounded FIFO and
idle completion. Neither probe claims journal-backed or fission-lane coverage.

Temporal race examples live in `requirements/verification-system/tests/007.test.mjs`,
with shared support in `requirements/verification-system/tests/support/temporal-harness.mjs`.
