import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const GATE = resolve(REPO_ROOT, '.github/scripts/release-lineage-gate.sh');
const EXPECTED_SHA = 'a'.repeat(40);
const NEWER_SHA = 'b'.repeat(40);
const LIVE_SHA = 'c'.repeat(40);
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function parseOutputs(path) {
  const values = {};
  for (const line of readFileSync(path, 'utf8').trim().split('\n')) {
    if (!line) continue;
    const separator = line.indexOf('=');
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

/**
 * Stub gh/curl so the gate sees: main at `main`, compare(expected...main) =
 * `lineageStatus`, `pendingSuccessors` newer controller runs, live production
 * at `liveSha`, and `unshipped` commits whose oldest landed `ageSeconds` ago.
 */
function runGate({
  main = EXPECTED_SHA,
  lineageStatus = 'ahead',
  lineageExit = 0,
  pendingSuccessors = 0,
  runsFail = false,
  runsResponse = /** @type {string | undefined} */ (undefined),
  liveSha = LIVE_SHA,
  unshipped = 3,
  ageSeconds = 600,
  compareFails = false,
  buildInfoFails = false,
  starvationSeconds = 5400,
  inFlight = false,
  failTimes = 0,
  failHttp = '403 Forbidden',
  failBody = '{"message":"API rate limit exceeded for installation ID 1."}',
  retryAfter = '',
  remaining = '',
  rateReset = '',
  gitMode = 'unproven',
  compareAttempts = 4,
  maxSleep = 15,
  // Queued successors with staging evidence: { sha, staging: 'deployed' |
  // 'superseded' | 'not_applicable' | 'failure' | 'missing' | 'no-artifact' }.
  successors = /** @type {{sha: string, staging: string}[]} */ ([]),
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'lineage-gate-'));
  tempRoots.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const output = join(root, 'github-output');
  writeFileSync(output, '');
  const oldest = new Date(Date.now() - ageSeconds * 1000)
    .toISOString()
    .replace(/\.\d+Z$/, 'Z');
  const runs =
    runsResponse ??
    JSON.stringify({
      workflow_runs: [
        { id: 100, status: 'in_progress' },
        ...Array.from({ length: pendingSuccessors }, (_, i) => ({
          id: 101 + i,
          status: 'pending',
        })),
        ...successors.map((successor, i) => ({
          id: 201 + i,
          status: 'pending',
          display_title: `Production Controller ${successor.sha} from CI ${301 + i} attempt 1`,
        })),
        { id: 50, status: 'pending' },
      ],
    });
  const extraRoutes = {};
  const stagingRuns = [];
  successors.forEach((successor, i) => {
    if (successor.staging === 'missing') return;
    const stagingId = 401 + i;
    stagingRuns.push({
      id: stagingId,
      run_attempt: 1,
      status: 'completed',
      conclusion: successor.staging === 'failure' ? 'failure' : 'success',
      display_title: `${successor.sha} from CI ${301 + i} attempt 1`,
    });
    const artifacts =
      successor.staging === 'no-artifact'
        ? []
        : [{ id: 501 + i, name: 'staging-completion-1', expired: false }];
    extraRoutes[
      `repos/JovieInc/Jovie/actions/runs/${stagingId}/artifacts?per_page=100`
    ] = JSON.stringify({ total_count: artifacts.length, artifacts });
    const dir = join(root, `zip-${501 + i}`);
    mkdirSync(dir);
    writeFileSync(
      join(dir, 'staging-completion.json'),
      JSON.stringify({ sha: successor.sha, outcome: successor.staging })
    );
    execFileSync(
      'zip',
      ['-q', join(root, `${501 + i}.zip`), 'staging-completion.json'],
      {
        cwd: dir,
      }
    );
  });
  extraRoutes[
    'repos/JovieInc/Jovie/actions/workflows/staging-controller.yml/runs?branch=main&event=workflow_run&per_page=50'
  ] = JSON.stringify({ workflow_runs: stagingRuns });
  writeFileSync(join(root, 'routes.json'), JSON.stringify(extraRoutes));
  const compare = compareFails
    ? ''
    : JSON.stringify({
        status: unshipped > 0 ? 'ahead' : 'identical',
        ahead_by: unshipped,
        commits:
          unshipped > 0 ? [{ commit: { committer: { date: oldest } } }] : [],
      });
  const compareLog = join(root, 'compare.log');
  const compareCount = join(root, 'compare.count');
  const sleepLog = join(root, 'sleep.log');
  const gitLog = join(root, 'git.log');
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh
case "$*" in
  *compare/${EXPECTED_SHA}...*)
    printf '%s\\n' "$*" >> "$COMPARE_LOG"
    n=0
    if [ -f "$COMPARE_COUNT" ]; then n=$(cat "$COMPARE_COUNT"); fi
    n=$((n + 1))
    printf '%s\\n' "$n" > "$COMPARE_COUNT"
    if [ "$n" -le "\${LINEAGE_FAIL_TIMES:-0}" ]; then
      printf 'HTTP/2.0 %s\\r\\n' "\${LINEAGE_FAIL_HTTP:-403 Forbidden}"
      if [ -n "\${LINEAGE_RETRY_AFTER:-}" ]; then
        printf 'retry-after: %s\\r\\n' "$LINEAGE_RETRY_AFTER"
      fi
      if [ -n "\${LINEAGE_REMAINING:-}" ]; then
        printf 'x-ratelimit-remaining: %s\\r\\n' "$LINEAGE_REMAINING"
      fi
      if [ -n "\${LINEAGE_RESET:-}" ]; then
        printf 'x-ratelimit-reset: %s\\r\\n' "$LINEAGE_RESET"
      fi
      printf '\\r\\n%s\\n' "\${LINEAGE_FAIL_BODY:-{\\"message\\":\\"API rate limit exceeded for installation ID 1.\\"}}"
      exit 1
    fi
    if [ "${lineageExit}" -ne 0 ]; then
      printf 'HTTP/2.0 503 Service Unavailable\\r\\n\\r\\n{"message":"stub transport failure"}\\n'
      exit ${lineageExit}
    fi
    printf 'HTTP/2.0 200 OK\\r\\n\\r\\n{"status":"%s"}\\n' "${lineageStatus}"
    exit 0
    ;;
  *compare/${liveSha}...*) ${compareFails ? 'exit 1' : `cat <<'JSON'\n${compare}\nJSON\n`}
  ;;
  *production-controller.yml/runs*) ${runsFail ? 'exit 22' : ''}
cat <<'JSON'
${runs}
JSON
  ;;
  */zip) id="\${2%/zip}"; cat "${root}/\${id##*/}.zip" ;;
  *) exec node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[process.argv[2]];if(r===undefined)process.exit(1);process.stdout.write(r)' "${root}/routes.json" "$2" ;;
esac
`
  );
  chmodSync(join(bin, 'gh'), 0o755);
  writeFileSync(
    join(bin, 'curl'),
    buildInfoFails
      ? '#!/bin/sh\nexit 22\n'
      : `#!/bin/sh\nprintf '{"commitSha":"${liveSha}"}\\n'\n`
  );
  chmodSync(join(bin, 'curl'), 0o755);
  writeFileSync(
    join(bin, 'sleep'),
    `#!/bin/sh\nprintf '%s\\n' "$1" >> "$SLEEP_LOG"\nexit 0\n`
  );
  chmodSync(join(bin, 'sleep'), 0o755);
  writeFileSync(
    join(bin, 'git'),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$GIT_LOG"
mode="\${GIT_LINEAGE_MODE:-unproven}"
case "$*" in
  *rev-parse\\ refs/remotes/origin/main*)
    printf '%s\\n' "\${GIT_MAIN_SHA}"
    exit 0
    ;;
  *--is-shallow-repository*)
    if [ "$mode" = shallow ]; then printf 'true\\n'; else printf 'false\\n'; fi
    exit 0
    ;;
  *merge-base*)
    case "$mode" in
      ancestor) exit 0 ;;
      diverged) exit 1 ;;
      *) exit 128 ;;
    esac
    ;;
  *fetch*)
    if [ "$mode" = unproven ]; then exit 1; fi
    exit 0
    ;;
esac
exit 0
`
  );
  chmodSync(join(bin, 'git'), 0o755);
  const result = spawnSync('bash', [GATE], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH || ''}`,
      CURRENT_MAIN_SHA: main,
      EXPECTED_SHA,
      GH_TOKEN: '',
      GITHUB_TOKEN: '',
      GITHUB_OUTPUT: output,
      GITHUB_RUN_ID: '100',
      GIT_LINEAGE_MODE: gitMode,
      GIT_LOG: gitLog,
      GIT_MAIN_SHA: main,
      IN_FLIGHT: inFlight ? 'true' : 'false',
      LINEAGE_COMPARE_ATTEMPTS: String(compareAttempts),
      LINEAGE_COMPARE_BACKOFF_SECONDS: '0',
      LINEAGE_COMPARE_MAX_SLEEP_SECONDS: String(maxSleep),
      LINEAGE_FAIL_BODY: failBody,
      LINEAGE_FAIL_HTTP: failHttp,
      LINEAGE_FAIL_TIMES: String(failTimes),
      LINEAGE_REMAINING: remaining,
      LINEAGE_RESET: rateReset,
      LINEAGE_RETRY_AFTER: retryAfter,
      PRODUCTION_STARVATION_SECONDS: String(starvationSeconds),
      REPOSITORY: 'JovieInc/Jovie',
      COMPARE_COUNT: compareCount,
      COMPARE_LOG: compareLog,
      SLEEP_LOG: sleepLog,
    },
  });
  return {
    result,
    decision: result.stdout.trim(),
    outputs: parseOutputs(output),
    root,
  };
}

describe('release lineage gate', () => {
  it('proceeds when main still equals the generation', () => {
    const run = runGate({ main: EXPECTED_SHA });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=proceed');
    expect(run.outputs).toMatchObject({
      lineage: 'exact',
      gate_decision: 'proceed',
    });
  });

  it('yields when the generation left main lineage', () => {
    for (const status of ['diverged', 'behind']) {
      const run = runGate({ main: NEWER_SHA, lineageStatus: status });
      expect(run.result.status, run.result.stderr).toBe(0);
      expect(run.decision).toBe('decision=yield');
      expect(run.outputs.lineage).toBe('diverged');
    }
  });

  it.each([
    { lineageStatus: '', lineageExit: 1 },
    { lineageStatus: 'ahead', lineageExit: 22 },
    { lineageStatus: '', lineageExit: 0 },
    { lineageStatus: 'not json', lineageExit: 0 },
    { lineageStatus: 'identical', lineageExit: 0 },
  ])('rejects unreadable ancestry instead of superseding: %j', overrides => {
    const run = runGate({ main: NEWER_SHA, ...overrides });
    expect(run.result.status).toBe(1);
    expect(run.decision).toBe('decision=error');
    expect(run.outputs).toMatchObject({
      lineage: 'unknown',
      lineage_lookup_exit: String(overrides.lineageExit),
      gate_decision: 'error',
      gate_reason: 'lineage_lookup_unavailable',
    });
    expect(run.result.stderr).toContain('Release ancestry is unknown');
    expect(run.result.stderr).toMatch(/HTTP (200|503)/);
    expect(run.outputs.lineage_lookup_http).toMatch(/^(200|503)$/);
    expect(run.result.stderr).not.toContain('left main');
    expect(run.decision).not.toContain('yield');
  });

  it.each([
    { runsFail: true },
    { runsResponse: '' },
    { runsResponse: '{}' },
    { runsResponse: 'not json' },
    { runsResponse: '{"workflow_runs":[{"id":101}]}' },
  ])(
    'keeps failed successor visibility unknown even under starvation: %j',
    overrides => {
      const run = runGate({
        main: NEWER_SHA,
        ageSeconds: 6000,
        inFlight: true,
        ...overrides,
      });
      expect(run.result.status).toBe(1);
      expect(run.decision).toBe('decision=error');
      expect(run.outputs).toMatchObject({
        successor_pending: 'unknown',
        starving: 'unknown',
        gate_decision: 'error',
      });
      expect(run.result.stderr).not.toContain('no newer generation');
    }
  );

  it('keeps the lease for an ancestor when no newer generation is queued', () => {
    const run = runGate({ main: NEWER_SHA, pendingSuccessors: 0 });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=proceed');
    expect(run.outputs).toMatchObject({
      lineage: 'ancestor',
      successor_pending: 'false',
      starving: 'false',
      unshipped_commits: '3',
    });
  });

  it('yields to a queued successor while production is fresh', () => {
    const run = runGate({
      main: NEWER_SHA,
      pendingSuccessors: 2,
      ageSeconds: 600,
    });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=yield');
    expect(run.outputs).toMatchObject({
      successor_pending: 'true',
      starving: 'false',
    });
  });

  it('drains a queued ancestor to the newest successor once production is starving', () => {
    const run = runGate({
      main: NEWER_SHA,
      pendingSuccessors: 2,
      ageSeconds: 6000,
    });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=yield');
    expect(run.outputs).toMatchObject({
      successor_pending: 'true',
      starving: 'true',
    });
    expect(Number(run.outputs.unshipped_age_seconds)).toBeGreaterThanOrEqual(
      5400
    );
  });

  it('keeps the lease for an in-flight generation despite a queued successor once production is starving', () => {
    const run = runGate({
      main: NEWER_SHA,
      pendingSuccessors: 2,
      ageSeconds: 6000,
      inFlight: true,
    });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=proceed');
    expect(run.outputs).toMatchObject({
      successor_pending: 'true',
      starving: 'true',
      in_flight: 'true',
    });
  });

  it.each([0, 1, 2, 3, 4])(
    'drains five queued generations under starvation: position %i',
    position => {
      // Five stale generations queued FIFO behind a starving production. Each
      // still-queued generation yields to its queued successors in seconds, so
      // only the newest (no successors behind it) proceeds to the pipeline.
      const queued = 5;

      const run = runGate({
        main: NEWER_SHA,
        pendingSuccessors: queued - 1 - position,
        ageSeconds: 6000,
      });
      expect(run.result.status, run.result.stderr).toBe(0);
      expect(run.outputs.starving).toBe('true');
      expect(run.decision).toBe(
        position === queued - 1 ? 'decision=proceed' : 'decision=yield'
      );
    }
  );

  it('treats unreadable production evidence as starving rather than yielding forever', () => {
    for (const overrides of [
      { buildInfoFails: true },
      { compareFails: true },
    ]) {
      // A still-queued generation still yields: its queued successor ships a
      // newer SHA, so the stale backlog drains instead of running the full
      // pipeline for every generation.
      const queued = runGate({
        main: NEWER_SHA,
        pendingSuccessors: 1,
        ...overrides,
      });
      expect(queued.result.status, queued.result.stderr).toBe(0);
      expect(queued.decision).toBe('decision=yield');
      expect(queued.outputs.starving).toBe('true');

      // An in-flight generation keeps the lease so unreadable evidence can
      // never starve production of a ship.
      const inFlight = runGate({
        main: NEWER_SHA,
        pendingSuccessors: 1,
        inFlight: true,
        ...overrides,
      });
      expect(inFlight.result.status, inFlight.result.stderr).toBe(0);
      expect(inFlight.decision).toBe('decision=proceed');
      expect(inFlight.outputs.starving).toBe('true');
    }
  });

  it('is not starving when production already has every main commit', () => {
    const run = runGate({
      main: NEWER_SHA,
      pendingSuccessors: 1,
      unshipped: 0,
    });
    expect(run.decision).toBe('decision=yield');
    expect(run.outputs).toMatchObject({
      starving: 'false',
      unshipped_commits: '0',
    });
  });

  it('does not yield to queued successors whose staging cannot ship (2026-10-20, run 39460322150)', () => {
    // 826b00a held a deployed staging generation, but four queued successors
    // were superseded in staging by a397d64, whose staging canary then failed.
    // Yielding to them left production on 060037d with no generation able to
    // promote.
    const run = runGate({
      main: NEWER_SHA,
      inFlight: true,
      successors: [
        { sha: 'd'.repeat(40), staging: 'superseded' },
        { sha: 'e'.repeat(40), staging: 'superseded' },
        { sha: 'f'.repeat(40), staging: 'superseded' },
        { sha: '1'.repeat(40), staging: 'failure' },
      ],
    });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=proceed');
    expect(run.outputs).toMatchObject({
      successor_pending: 'false',
      skipped_successors: '4',
      gate_decision: 'proceed',
    });
    expect(run.outputs.gate_reason).toContain(
      '4 queued successor(s) cannot ship'
    );
    expect(run.result.stderr).toContain('staging 404 concluded failure');
    expect(run.result.stderr).toContain('staging 401 finished superseded');
  });

  it.each(['deployed', 'not_applicable', 'missing', 'no-artifact'])(
    'still yields to a newer successor whose staging is %s or unknown',
    staging => {
      const run = runGate({
        main: NEWER_SHA,
        successors: [
          { sha: 'd'.repeat(40), staging: 'superseded' },
          { sha: 'e'.repeat(40), staging },
        ],
      });
      expect(run.result.status, run.result.stderr).toBe(0);
      expect(run.decision).toBe('decision=yield');
      expect(run.outputs).toMatchObject({
        successor_pending: 'true',
        skipped_successors: '0',
      });
    }
  );

  it('retries a rate-limited compare inside the sleep cap', () => {
    const run = runGate({
      main: NEWER_SHA,
      failTimes: 1,
      retryAfter: '2',
      remaining: '20',
    });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=proceed');
    expect(run.outputs).toMatchObject({
      lineage: 'ancestor',
      lineage_source: 'rest',
    });
    expect(readFileSync(join(run.root, 'compare.count'), 'utf8').trim()).toBe(
      '2'
    );
    expect(readFileSync(join(run.root, 'sleep.log'), 'utf8').trim()).toBe('2');
    expect(run.result.stderr).toContain('HTTP 403');
    expect(run.result.stderr).toContain(
      'API rate limit exceeded for installation ID 1.'
    );
  });

  it('does not retry before a Retry-After that exceeds the bound, and uses git', () => {
    const run = runGate({
      main: NEWER_SHA,
      failTimes: 5,
      retryAfter: '120',
      remaining: '0',
      gitMode: 'ancestor',
    });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=proceed');
    expect(run.outputs).toMatchObject({
      lineage: 'ancestor',
      lineage_source: 'git',
      lineage_lookup_http: '403',
    });
    expect(readFileSync(join(run.root, 'compare.count'), 'utf8').trim()).toBe(
      '1'
    );
    expect(() => readFileSync(join(run.root, 'sleep.log'), 'utf8')).toThrow();
    expect(run.result.stderr).toContain('past the 15s bound');
    expect(run.result.stderr).toContain('proved lineage with git (ahead)');
  });

  it('does not treat an error payload status as divergence', () => {
    const run = runGate({
      main: NEWER_SHA,
      failTimes: 5,
      retryAfter: '120',
      failBody:
        '{"status":"diverged","message":"API rate limit exceeded for installation ID 1."}',
      gitMode: 'ancestor',
    });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=proceed');
    expect(run.outputs.lineage).toBe('ancestor');
    expect(run.result.stderr).not.toContain('left main');
  });

  it('fails closed with the HTTP status when git cannot prove ancestry', () => {
    const run = runGate({
      main: NEWER_SHA,
      failTimes: 5,
      failHttp: '404 Not Found',
      failBody: '{"message":"Not Found","status":"404"}',
      remaining: '100',
      gitMode: 'unproven',
    });
    expect(run.result.status).toBe(1);
    expect(run.decision).toBe('decision=error');
    expect(run.outputs).toMatchObject({
      lineage: 'unknown',
      lineage_lookup_exit: '1',
      lineage_lookup_http: '404',
      gate_decision: 'error',
      gate_reason: 'lineage_lookup_unavailable',
    });
    expect(run.result.stderr).toContain(
      'Release ancestry is unknown (exit=1, HTTP 404)'
    );
    expect(run.result.stderr).toContain('compare response: Not Found');
    expect(run.result.stderr).toContain('git fetch of main failed');
    expect(readFileSync(join(run.root, 'compare.count'), 'utf8').trim()).toBe(
      '1'
    );
  });

  it('yields only when git proves the generation left main', () => {
    const run = runGate({
      main: NEWER_SHA,
      failTimes: 5,
      retryAfter: '120',
      gitMode: 'diverged',
    });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=yield');
    expect(run.outputs).toMatchObject({
      lineage: 'diverged',
      lineage_source: 'git',
    });
  });

  it('still yields to a queued successor after git proves ancestry', () => {
    const run = runGate({
      main: NEWER_SHA,
      failTimes: 5,
      retryAfter: '120',
      gitMode: 'ancestor',
      pendingSuccessors: 2,
      ageSeconds: 600,
    });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=yield');
    expect(run.outputs).toMatchObject({
      lineage: 'ancestor',
      lineage_source: 'git',
      successor_pending: 'true',
    });
  });

  it('honors a primary rate-limit reset that fits in the bound', () => {
    const reset = String(Math.floor(Date.now() / 1000) + 4);
    const run = runGate({
      main: NEWER_SHA,
      failTimes: 1,
      remaining: '0',
      rateReset: reset,
    });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=proceed');
    const slept = Number(
      readFileSync(join(run.root, 'sleep.log'), 'utf8').trim()
    );
    expect(slept).toBeGreaterThan(0);
    expect(slept).toBeLessThanOrEqual(15);
    expect(readFileSync(join(run.root, 'compare.count'), 'utf8').trim()).toBe(
      '2'
    );
  });

  it('does not ask git when the compare response already classifies the pair', () => {
    const run = runGate({ main: NEWER_SHA, lineageStatus: 'diverged' });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=yield');
    expect(run.outputs.lineage_source).toBe('rest');
    expect(() => readFileSync(join(run.root, 'git.log'), 'utf8')).toThrow();
  });

  it('fails closed on malformed inputs', () => {
    const run = runGate({ main: 'not-a-sha' });
    expect(run.result.status).not.toBe(0);
  });
});
