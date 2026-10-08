/**
 * gate-readiness-cases.mjs — the startup ladder, under test (verification-system-004, W5).
 *
 * The clause requires the startup window to have a causal criterion of its own:
 *
 *   启动阶段（进程拉起到就绪）必须有独立的就绪判据，不得只靠兜底 wall-clock 覆盖。
 *   禁止：存在一段「只有总超时保护的时间窗」
 *
 * A ladder over log lines has one failure mode that matters more than the rest, and it is the
 * reason this file leads with source-derived evidence rather than hand-written expectations: the
 * ladder advances only on the NEXT expected marker, so a list whose ORDER disagrees with the order
 * production prints stalls at the first disagreement and fails every canary at the stage budget.
 * That failure is indistinguishable, from the launcher's diagnostic, from a genuinely wedged host.
 * It was measured here — the first draft listed `workspace` before `provider` because that is the
 * order the two read naturally, while `scenario-parallel.js` prints `provider.start took` at :88 and
 * `prepareWorkspace took` at :94. A readiness gate that reports 「stuck at 1/9」 for a healthy
 * startup is worse than no readiness gate, because the reader stops looking at the host.
 *
 * So the order is not asserted against a copy of itself. It is derived from where the harness
 * actually prints each marker and compared, which makes the next reordering of production prints a
 * failure here instead of a suite-wide hang whose cause is nowhere near its symptom.
 */

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { assertEq, assertTrue, tmpScenarioDir } from './lib.mjs';
import { ReadinessLadder, READINESS_STAGES } from '../../e2e/support/readiness.js';
import { CANARY_READY_MS, GATE_HOST_START_TIMEOUT_MS, READINESS_STAGE_MS } from '../../e2e/support/time-budget.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The two files that print the stage lines. Nothing else may own a stage marker. */
const STAGE_SOURCES = ['tests/e2e/support/scenario-parallel.js', 'tests/e2e/support/process-host.js'];

const readSource = (relative) => readFileSync(`${REPO_ROOT}${relative}`, 'utf8');

/**
 * Where each stage marker is printed, as `{ file, line }` per stage name.
 *
 * Collected across both sources so a marker that has moved between them, or been printed twice, is
 * visible as data rather than as a stalled climb at runtime.
 */
const printSites = () => {
  const sites = new Map();

  for (const relative of STAGE_SOURCES) {
    readSource(relative)
      .split('\n')
      .forEach((text, index) => {
        for (const stage of READINESS_STAGES) {
          if (!text.includes(stage.marker)) continue;
          const previous = sites.get(stage.name) ?? [];
          sites.set(stage.name, [...previous, { file: relative, line: index + 1 }]);
        }
      });
  }

  return sites;
};

/** The line in `scenario-parallel.js` that reports the nested `host.start`, as a position proxy. */
const hostStartLine = () =>
  readSource(STAGE_SOURCES[0])
    .split('\n')
    .findIndex((text) => text.includes('[setupScenario] host.start took')) + 1;

/** Feed a ladder a whole sequence of markers, one accumulated buffer at a time. */
const climb = (stageNames) => {
  const ladder = new ReadinessLadder();
  let buffer = '';

  for (const name of stageNames) {
    const stage = READINESS_STAGES.find((candidate) => candidate.name === name);
    buffer += `${stage.marker} 12ms\n`;
    ladder.observe(buffer);
  }

  return ladder;
};

const allStageNames = READINESS_STAGES.map((stage) => stage.name);

const execFileAsync = promisify(execFile);

async function processHostDiagnosticChannels(mode) {
  const scenarioDir = tmpScenarioDir();
  const executable = join(scenarioDir, 'fake-host.mjs');
  writeFileSync(executable, `#!${process.execPath}
import http from 'node:http';
const server = http.createServer((request, response) => {
  response.setHeader('content-type', 'application/json');
  if (request.url === '/global/health') {
    response.end(JSON.stringify({ healthy: true }));
  } else if (request.url === '/path') {
    response.end(JSON.stringify({ home: process.env.HOME, state: process.env.XDG_STATE_HOME,
      config: process.env.XDG_CONFIG_HOME, worktree: process.cwd(), directory: process.cwd() }));
  } else {
    response.writeHead(404).end();
  }
});
process.stdout.write('Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.\\n');
server.listen(0, '127.0.0.1', () => {
  process.stdout.write('opencode server listening on http://127.0.0.1:' + server.address().port + '\\n');
});
`, { mode: 0o755 });
  const hostModule = new URL('../../e2e/support/process-host.js', import.meta.url).href;
  const subject = `
import { ProcessHost } from ${JSON.stringify(hostModule)};
const host = new ProcessHost();
const phases = [];
try {
  await host.start({ scenarioDir: ${JSON.stringify(scenarioDir)}, providerUrl: 'http://127.0.0.1:1/v1',
    pluginPaths: [${JSON.stringify(executable)}], onProgress: phase => phases.push(phase) });
} finally {
  await host.stop();
}
process.stdout.write(JSON.stringify({ phases, hostOutputCaptured: host.stdoutLog.includes('opencode server listening'),
  released: host.pid === null }) + '\\n');
`;
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, ['--input-type=module', '-e', subject], {
      env: { ...process.env, OPENCODE_BIN: executable, CANARY_VERBOSE: '', DEBUG: '', [mode]: '1' },
    });
    assert.doesNotMatch(stdout, /\[host\.start\]|opencode server listening|OPENCODE_SERVER_PASSWORD/,
      `${mode} diagnostics must not enter the caller's protocol stdout`);
    const result = JSON.parse(stdout);
    assert.deepEqual(result.phases, ['bootstrapped', 'listening', 'global-healthy', 'project-events', 'healthy']);
    assert.equal(result.hostOutputCaptured, true, 'the real Host stdout remains available in its diagnostic ring');
    assert.equal(result.released, true, 'the actual child and socket have passed ProcessHost cleanup');
    assert.match(stderr, /\[host\.start\] bootstrap observed/);
    assert.match(stderr, /\[host\.start\] _waitForListening took \d+ms/);
    assert.match(stderr, /\[host\.start\] _waitForGlobalHealth took \d+ms/);
    assert.match(stderr, /\[host\.start\] project event source observed/);
    assert.match(stderr, /\[host\.start\] _waitForHealth took \d+ms/);
  } finally {
    rmSync(scenarioDir, { recursive: true, force: true });
  }
}

async function processHostOwnedLifecycle(mode) {
  const scenarioDir = tmpScenarioDir();
  const executable = join(scenarioDir, 'owned-host.mjs');
  const identityPath = join(scenarioDir, 'actual-host.json');
  const requestPath = join(scenarioDir, 'global-request.json');
  writeFileSync(executable, `#!${process.execPath}
import http from 'node:http';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const server = http.createServer((request, response) => {
  response.setHeader('content-type', 'application/json');
  if (request.url === '/global/health') {
    fs.writeFileSync(${JSON.stringify(requestPath)}, JSON.stringify({ pid: process.pid, path: request.url }));
    if (${JSON.stringify(mode)} === 'exit') process.exit(23);
    response.end(JSON.stringify({ healthy: true }));
  } else if (request.url === '/path') {
    response.end(JSON.stringify({ home: process.env.HOME, state: process.env.XDG_STATE_HOME,
      config: process.env.XDG_CONFIG_HOME, worktree: process.cwd(), directory: process.cwd() }));
  } else response.writeHead(404).end();
});
process.stdout.write('Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.\\n');
server.listen(0, '127.0.0.1', () => {
  const pgid = Number(execFileSync('/bin/ps', ['-o', 'pgid=', '-p', String(process.pid)], { encoding: 'utf8' }).trim());
  fs.writeFileSync(${JSON.stringify(identityPath)}, JSON.stringify({ pid: process.pid, parentPid: process.ppid, pgid, port: server.address().port }));
  process.stdout.write('opencode server listening on http://127.0.0.1:' + server.address().port + '\\n');
});
`, { mode: 0o755 });
  const hostModule = new URL('../../e2e/support/process-host.js', import.meta.url).href;
  const monitorPath = fileURLToPath(new URL('../../../../../scripts/lib/verification-tool-monitor.mjs', import.meta.url));
  const hostUtilsModule = new URL('../../e2e/support/process-host-utils.js', import.meta.url).href;
  const subject = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ChildProcess, execFileSync } from 'node:child_process';
import { getEventListeners } from 'node:events';
import { ProcessHost } from ${JSON.stringify(hostModule)};
import { getOpencodeSpawnCount } from ${JSON.stringify(hostUtilsModule)};
const host = new ProcessHost();
const phases = [];
const trace = [];
const emit = ChildProcess.prototype.emit;
let monitor;
let heldStart;
let readyForwarded = false;
let readyObserver;
let terminalSignal;
let beforeStop;
function releaseStart() {
  if (!readyForwarded || !heldStart) return;
  assert.ok(host.stdoutLog.includes('opencode server listening on http://'));
  const held = heldStart;
  heldStart = null;
  trace.push('start-delivered');
  Reflect.apply(emit, held.receiver, ['message', ...held.args]);
}
ChildProcess.prototype.emit = function(event, ...args) {
  if (event === 'spawn' && this.spawnargs[1] === ${JSON.stringify(monitorPath)}) {
    monitor = this;
    if (${JSON.stringify(mode)} === 'early-ready') {
      let stdout = '';
      readyObserver = chunk => {
        stdout += chunk.toString();
        if (readyForwarded || !/opencode server listening on http:\\/\\/127[.]0[.]0[.]1:\\d+\\n/.test(stdout)) return;
        assert.ok(host.stdoutLog.includes('opencode server listening on http://'), 'Actual Host stdout is forwarded before release');
        readyForwarded = true;
        trace.push('ready-forwarded');
        queueMicrotask(releaseStart);
      };
      this.stdout.on('data', readyObserver);
    }
  }
  if (${JSON.stringify(mode)} === 'early-ready' && this === monitor && event === 'message' && args[0]?.type === 'verification-tool-started') {
    assert.equal(heldStart, undefined, 'Only the actual first start record is held');
    heldStart = { receiver: this, args };
    trace.push('start-held');
    queueMicrotask(releaseStart);
    return true;
  }
  return Reflect.apply(emit, this, [event, ...args]);
};
try {
  const starting = host.start({ scenarioDir: ${JSON.stringify(scenarioDir)}, providerUrl: 'http://127.0.0.1:1/v1',
    pluginPaths: [], startTimeoutMs: ${GATE_HOST_START_TIMEOUT_MS}, onProgress: phase => phases.push(phase) });
  if (${JSON.stringify(mode)} === 'exit') {
    await assert.rejects(starting, /global.*\\/global\\/health/s);
    const completed = await host._owner.completed;
    assert.equal(completed.exitCode, 23);
    assert.equal(completed.signal, null);
    assert.equal(completed.failure, null);
    assert.equal(host.exitInfo.code, 23);
    assert.equal(host.exitInfo.signal, null);
    assert.equal(host.exitInfo.failure, undefined);
  } else {
    await starting;
    assert.ok(phases.includes('healthy'));
    assert.ok(readyForwarded);
    assert.ok(trace.indexOf('ready-forwarded') < trace.indexOf('start-delivered'));
  }
  const actual = JSON.parse(fs.readFileSync(${JSON.stringify(identityPath)}, 'utf8'));
  assert.equal(host.pid, actual.pid, 'Public PID must name the selected Host');
  assert.equal(actual.pgid, actual.pid);
  assert.equal(actual.parentPid, monitor.pid);
  assert.notEqual(host.pid, monitor.pid);
  assert.equal(getOpencodeSpawnCount(), 1, 'Exactly one actual Host was spawned in this lifecycle');
  assert.deepEqual(JSON.parse(fs.readFileSync(${JSON.stringify(requestPath)}, 'utf8')), { pid: actual.pid, path: '/global/health' });
  terminalSignal = host._owner.terminal;
  assert.equal(getEventListeners(terminalSignal, 'abort').length, 0, 'All completed readiness stages release their terminal observer');
  beforeStop = { actual, publicPid: host.pid, exitCode: host.exitInfo?.code ?? null, signal: host.exitInfo?.signal ?? null };
} finally {
  ChildProcess.prototype.emit = emit;
  if (monitor && readyObserver) monitor.stdout.off('data', readyObserver);
  await host.stop();
}
const groups = [beforeStop.actual.pgid, monitor.pid];
const live = execFileSync('/bin/ps', ['-eo', 'pid=,pgid=,stat='], { encoding: 'utf8' }).trim().split('\\n').filter(line => {
  const fields = /^\\s*(\\d+)\\s+(\\d+)\\s+(\\S+)\\s*$/.exec(line);
  if (!fields) throw new Error('Invalid actual final process row');
  return groups.includes(Number(fields[2])) && !/^[ZX]/.test(fields[3]);
});
assert.deepEqual(live, []);
assert.equal(host.pid, null);
assert.equal(host.baseUrl, null);
assert.equal(getEventListeners(terminalSignal, 'abort').length, 0);
process.stdout.write(JSON.stringify({ mode: ${JSON.stringify(mode)}, beforeStop, trace, groupsDrained: true, reset: true }) + '\\n');
`;
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, ['--input-type=module', '-e', subject], {
      env: { ...process.env, OPENCODE_BIN: executable, CANARY_VERBOSE: '', DEBUG: '' },
    });
    const result = JSON.parse(stdout);
    assert.equal(result.mode, mode);
    assert.equal(result.beforeStop.publicPid, result.beforeStop.actual.pid);
    assert.equal(result.groupsDrained, true);
    assert.equal(result.reset, true);
    assert.doesNotMatch(stderr, /UnhandledPromiseRejection|uncaughtException/);
    if (mode === 'exit') assert.equal(result.beforeStop.exitCode, 23);
    else assert.ok(result.trace.indexOf('ready-forwarded') < result.trace.indexOf('start-delivered'));
  } finally {
    rmSync(scenarioDir, { recursive: true, force: true });
  }
}

export const readinessCases = [
  { name: 'WHAT[verification-system-005] ProcessHost public PID and exitInfo retain the actual Host exit before cleanup', fn: () => processHostOwnedLifecycle('exit') },
  { name: 'WHAT[verification-system-005] ProcessHost consumes actual ready stdout forwarded before its start record is admitted', fn: () => processHostOwnedLifecycle('early-ready') },
  ...['CANARY_VERBOSE', 'DEBUG'].map(mode => ({
    name: `WHAT[verification-system-005] ProcessHost ${mode} startup diagnostics preserve protocol stdout and report progress on stderr`,
    fn: () => processHostDiagnosticChannels(mode),
  })),
  {
    name: 'verification-system-004 the ladder stages are ordered the way production prints them',
    fn: () => {
      // The load-bearing case, and the one the measured defect would have failed. Within one file
      // the print order IS the completion order, so the ladder's relative order must match it.
      const sites = printSites();

      for (const relative of STAGE_SOURCES) {
        const owned = READINESS_STAGES.map((stage, ladderIndex) => ({
          name: stage.name,
          ladderIndex,
          line: sites.get(stage.name)?.find((site) => site.file === relative)?.line,
        })).filter((entry) => entry.line !== undefined);

        const byLadder = owned.map(({ name, line }) => `${name}@${line}`).join(' → ');
        const bySource = [...owned]
          .sort((a, b) => a.line - b.line)
          .map(({ name, line }) => `${name}@${line}`)
          .join(' → ');

        assertEq(
          byLadder,
          bySource,
          `${relative} prints these stages in a different order than the ladder expects them; the ` +
            'climb would stall at the first disagreement and every canary would fail at the stage ' +
            'budget while the host was healthy',
        );
      }
    },
  },

  {
    name: 'verification-system-004 every stage marker is printed exactly once by the harness',
    fn: () => {
      // Deliberately the guard that lets `readiness.js` NOT anchor to the exact log format. Matching
      // substrings means a reworded timing line still advances the ladder; it also means a DELETED
      // line silently never advances it. This case converts that second case into a gate failure, so
      // the cost of the loose match is paid here rather than by a canary hanging at 3/9.
      const sites = printSites();

      for (const stage of READINESS_STAGES) {
        const found = sites.get(stage.name) ?? [];

        assertEq(
          found.length,
          1,
          `stage '${stage.name}' (marker ${JSON.stringify(stage.marker)}) is printed ` +
            `${found.length} time(s) at ${JSON.stringify(found)}; zero means the ladder can never ` +
            'pass it, more than one means which print advances it depends on ordering',
        );
      }
    },
  },

  {
    name: 'verification-system-004 the host stages are nested where the ladder places them',
    fn: () => {
      // The cross-file half of the order check. All Host stages are printed inside
      // `process-host.js`, so within-file monotonicity cannot see that they belong between
      // `workspace` and `events`. The `host.start took` line is where that nesting is observable.
      const sites = printSites();
      const lineIn = (name) =>
        sites.get(name).find((site) => site.file === STAGE_SOURCES[0]).line;

      const nested = hostStartLine();
      assertTrue(nested > 0, 'scenario-parallel.js must still report host.start, or nesting is unprovable');

      assertTrue(
        lineIn('workspace') < nested && nested < lineIn('events'),
        `host.start is reported at :${nested}, outside workspace@${lineIn('workspace')}..` +
          `events@${lineIn('events')}; the ladder places all Host stages between them`,
      );

      const hostStages = READINESS_STAGES.map((stage, index) => ({ name: stage.name, index })).filter(
        ({ name }) => sites.get(name).some((site) => site.file === STAGE_SOURCES[1]),
      );

      assertEq(
        hostStages.map(({ name }) => name).join(','),
        'host-bootstrap,port-bound,host-global,host-project-events,host-project',
        'the stages owned by process-host.js changed; the nesting argument above no longer applies',
      );
      assertEq(
        hostStages.map(({ index }) => index).join(','),
        `${hostStages[0].index},${hostStages[0].index + 1},${hostStages[0].index + 2},${hostStages[0].index + 3},${hostStages[0].index + 4}`,
        'the five Host stages must be adjacent in the ladder, since nothing is printed between them',
      );
    },
  },

  {
    name: 'verification-system-004 no stage marker is a substring of another',
    fn: () => {
      // Substring matching plus a marker contained in another marker means one line advances two
      // stages, which makes the climb depend on which stage is checked first. Cheap to forbid, and
      // it is the shape a future stage named by extending an existing prefix would take.
      for (const outer of READINESS_STAGES) {
        for (const inner of READINESS_STAGES) {
          if (outer.name === inner.name) continue;
          assertTrue(
            !outer.marker.includes(inner.marker),
            `stage '${outer.name}' contains the marker of '${inner.name}'; one printed line would ` +
              'advance both and the ladder would skip a criterion',
          );
        }
      }
    },
  },

  {
    name: 'verification-system-004 one buffer carrying several stages drains all of them',
    fn: () => {
      // Output arrives in blocks, so advancing one step per call would leave the ladder permanently
      // behind a child that prints three stages into one pipe write — and 「behind」 here means the
      // stage budget expires on work already done.
      const ladder = new ReadinessLadder();
      const advanced = ladder.observe(
        READINESS_STAGES.slice(0, 3)
          .map((stage) => `${stage.marker} 5ms`)
          .join('\n'),
      );

      assertEq(advanced.join(','), 'provider,workspace,host-bootstrap', 'a multi-stage buffer must drain');
      assertTrue(!ladder.isReady, 'three of nine stages is not ready');
    },
  },

  {
    name: 'verification-system-004 a reprinted earlier stage does not reset the climb',
    fn: () => {
      // 「反复重连的 SSE 读者」 one layer earlier: a retried health check that reset the ladder would
      // renew the startup budget forever, and a host looping on a failing probe would look like a
      // host making progress. Monotonicity is what makes the per-stage budget a bound at all.
      const ladder = climb(['provider', 'workspace', 'port-bound']);
      const reached = ladder.describe();

      assertEq(
        ladder.observe(`${READINESS_STAGES[0].marker} 5ms`).join(','),
        '',
        'an earlier marker must advance nothing',
      );
      assertEq(ladder.describe().replace(/silent for \d+ms/, ''), reached.replace(/silent for \d+ms/, ''),
        'the position must be unchanged by a reprint');
    },
  },

  {
    name: 'verification-system-004 a later marker arriving alone does not skip the stages before it',
    fn: () => {
      // The converse, and the reason the launcher can feed the whole accumulated buffer safely: the
      // ladder is a sequence, not a set. A child that printed only its last line would otherwise be
      // declared ready having proven nothing about the port, the provider or the event stream.
      const ladder = new ReadinessLadder();

      assertEq(ladder.observe(`${READINESS_STAGES[5].marker}`).join(','), '', 'ready alone proves nothing');
      assertTrue(!ladder.isReady, 'the ready bark alone must not satisfy the ladder');

      assertTrue(climb(allStageNames).isReady, 'the full climb in order must reach ready');
    },
  },

  {
    name: 'verification-system-004 the diagnostic names the stage reached and the stage awaited',
    fn: () => {
      // Two different facts, and the pair is what makes a startup failure actionable: 「reached
      // provider, awaiting port-bound」 points at the Host's listen call, 「reached nothing」 points
      // at module load. The launcher's old message — "failed to emit ready" — was true of the
      // symptom and silent about both.
      assertTrue(
        /reached \(nothing\) \(0\/9\), awaiting provider/.test(new ReadinessLadder().describe()),
        `a fresh ladder must say it reached nothing: ${new ReadinessLadder().describe()}`,
      );

      const stalled = climb(['provider', 'workspace']).describe();
      assertTrue(
        /reached workspace \(2\/9\), awaiting host-bootstrap/.test(stalled),
        `a stalled climb must name both sides: ${stalled}`,
      );
      assertTrue(/silent for \d+ms/.test(stalled), `the dump must state the silence: ${stalled}`);

      const done = climb(allStageNames).describe();
      assertTrue(/awaiting \(ready\)/.test(done), `a finished climb must not claim to await a stage: ${done}`);
    },
  },

  {
    name: 'verification-system-004 the stage budget is tighter than the total startup ceiling',
    fn: () => {
      // Detection of the one degradation no static check can prevent: 「延长静默窗口以掩盖竞态」.
      // Stated as the relation rather than the value so raising the stage budget past the ceiling —
      // which would restore the flat window the clause forbids — fails with the reason attached.
      // This relation case does not read the retired multi-canary launcher; the budgets live in
      // time-budget.js regardless of which process feeds the ladder.
      assertTrue(
        READINESS_STAGE_MS < CANARY_READY_MS,
        `the stage budget (${READINESS_STAGE_MS}ms) must be tighter than the total ceiling ` +
          `(${CANARY_READY_MS}ms), or one stage may consume the whole startup and nothing inside ` +
          'the window is a criterion',
      );
      assertEq(READINESS_STAGES.length, 9, 'the ladder is nine stages; the diagnostics above pin that shape');
    },
  },
];
