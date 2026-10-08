/**
 * process-host-utils.js — Pure helpers for ProcessHost: child lifecycle,
 * socket/PID/process-tree checks, listen-port parsing.
 *
 * Side-effect-free functions live here; the main class file imports them.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnOwnedVerificationTool } from "../../../../../scripts/lib/verification-owned-tool.mjs";
import { getDescendantPids } from "./process-host-checks.js";
import { terminateTree } from "./process-lifecycle.js";
import { recordSpawn, recordExit } from "./spawn-ledger.js";
import { SIGTERM_GRACE_MS, SIGKILL_GRACE_MS } from "./time-budget.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

/** Prefer repo-local bin so CI `npm ci` can run ProcessHost without a global install. */
function defaultOpencodeBin() {
  const local = path.join(REPO_ROOT, "node_modules", ".bin", "opencode");
  if (fs.existsSync(local)) return local;
  return "opencode";
}

export const OPENCODE_BIN = process.env.OPENCODE_BIN || defaultOpencodeBin();

const STDOUT_RING_MAX = 100;

/** In-process OpenCode serve spawn counter (G4R §2: exactly one lifetime). */
let opencodeServeSpawnCount = 0;

/** How many times the actual OpenCode process reported its spawned PID. */
export function getOpencodeSpawnCount() {
  return opencodeServeSpawnCount;
}

/** Test-only reset between isolated harness cases (not used by Long Stroke). */
export function resetOpencodeSpawnCount() {
  opencodeServeSpawnCount = 0;
}

export const READY_POLL_INTERVAL_MS = 100;

export function parseListenPort(listenLine) {
  const m = listenLine.match(/http:\/\/127\.0\.0\.1:(\d+)/)
    || listenLine.match(/http:\/\/localhost:(\d+)/)
    || listenLine.match(/:(\d+)/);
  return m ? Number(m[1]) : 0;
}

export function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === "ESRCH") return false;
    if (err.code === "EPERM") return true;
    return false;
  }
}

export function ringPush(buffer, s) {
  buffer.push(s);
  if (buffer.length > STDOUT_RING_MAX) buffer.shift();
}

/** Raw child termination for process fixtures; ProcessHost owns a lifeline handle. */
export async function terminateChild(child, termMs = SIGTERM_GRACE_MS, killMs = SIGKILL_GRACE_MS) {
  const pid = child?.pid;
  if (!pid) return;

  try {
    const descendants = await getDescendantPids(pid);
    for (const dpid of descendants) {
      try { process.kill(dpid, "SIGKILL"); } catch {}
    }
  } catch {}

  try {
    await terminateTree(child, { termGraceMs: termMs, killGraceMs: killMs });
  } catch (err) {
    // terminateTree already sent SIGTERM then SIGKILL to the whole process group
    // and still found survivors. Under heavy parallel load a descendant can be
    // mid-fork when the group kill runs, escaping the group; one more SIGKILL
    // aimed at the group (plus the leader) closes that race. Not a budget bump —
    // SIGKILL is unconditional, and the caller's assertNoLeak still verifies the
    // port is actually gone afterwards.
    console.error(`[ProcessHost] terminateTree error: ${err.message}; retrying SIGKILL`);
    try { process.kill(-pid, "SIGKILL"); } catch {}
    try { process.kill(pid, "SIGKILL"); } catch {}
  }
}

export async function initGitWorkspace(workDir) {
  const gitDir = path.join(workDir, ".git");
  if (fs.existsSync(gitDir)) return;
  try {
    const { execSync } = await import("node:child_process");
    execSync("git init", { cwd: workDir, stdio: "ignore" });
    execSync("git config user.email test@example.com", { cwd: workDir, stdio: "ignore" });
    execSync("git config user.name test", { cwd: workDir, stdio: "ignore" });
    // Diagnostic bridge + local runtime dirs must never trip Orchestrator IsDirty.
    const excludePath = path.join(gitDir, "info", "exclude");
    fs.mkdirSync(path.dirname(excludePath), { recursive: true });
    fs.appendFileSync(
      excludePath,
      "\n# wanxiangshu e2e / diagnostic non-authoritative paths\n.wanxiangshu/\n",
      "utf8",
    );
    // Stage any fixture files already written by setupScenario, then commit.
    // --allow-empty keeps an empty initial commit when the canary has no files.
    execSync("git add -A", { cwd: workDir, stdio: "ignore" });
    execSync("git commit --allow-empty -m init", { cwd: workDir, stdio: "ignore" });
  } catch {
    // Non-fatal.
  }
}

export function spawnOwnedOpencodeServe(workDir, env, hooks) {
  const owner = spawnOwnedVerificationTool(
    OPENCODE_BIN,
    ["serve", "--port", "0", "--hostname", "127.0.0.1"],
    { cwd: workDir, env },
  );
  const terminal = new AbortController();
  let hostPid = null;
  const started = owner.started.then(result => {
    if (result.failure === null) {
      hostPid = result.pid;
      opencodeServeSpawnCount += 1;
      recordSpawn(hostPid, `opencode serve ${workDir}`);
    }
    return result;
  });
  owner.child.stdout.on("data", (chunk) => hooks.onStdoutChunk(chunk.toString()));
  owner.child.stderr.on("data", (chunk) => hooks.onStderrChunk(chunk.toString()));
  const completed = owner.completed.then(result => {
    if (hostPid !== null && (result.exitCode !== null || result.signal !== null)) recordExit(hostPid);
    hooks.onExit(result.exitCode, result.signal, result.failure);
    terminal.abort(result);
    return result;
  });
  return { child: owner.child, stop: owner.stop, started, completed, terminal: terminal.signal };
}
