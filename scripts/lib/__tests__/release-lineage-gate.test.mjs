import { spawnSync } from 'node:child_process';
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
        { id: 50, status: 'pending' },
      ],
    });
  const compare = compareFails
    ? ''
    : JSON.stringify({
        status: unshipped > 0 ? 'ahead' : 'identical',
        ahead_by: unshipped,
        commits:
          unshipped > 0 ? [{ commit: { committer: { date: oldest } } }] : [],
      });
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh
case "$*" in
  *compare/${EXPECTED_SHA}...*) printf '%s\\n' "${lineageStatus}" ;;
  *compare/${liveSha}...*) ${compareFails ? 'exit 1' : `cat <<'JSON'\n${compare}\nJSON\n`}
  ;;
  *production-controller.yml/runs*) ${runsFail ? 'exit 22' : ''}
cat <<'JSON'
${runs}
JSON
  ;;
  *) exit 1 ;;
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
  const result = spawnSync('bash', [GATE], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH || ''}`,
      CURRENT_MAIN_SHA: main,
      EXPECTED_SHA,
      GITHUB_OUTPUT: output,
      GITHUB_RUN_ID: '100',
      IN_FLIGHT: inFlight ? 'true' : 'false',
      PRODUCTION_STARVATION_SECONDS: String(starvationSeconds),
      REPOSITORY: 'JovieInc/Jovie',
    },
  });
  return {
    result,
    decision: result.stdout.trim(),
    outputs: parseOutputs(output),
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
    for (const status of ['diverged', 'behind', '']) {
      const run = runGate({ main: NEWER_SHA, lineageStatus: status });
      expect(run.result.status, run.result.stderr).toBe(0);
      expect(run.decision).toBe('decision=yield');
      expect(run.outputs.lineage).toBe('diverged');
    }
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

  it('fails closed on malformed inputs', () => {
    const run = runGate({ main: 'not-a-sha' });
    expect(run.result.status).not.toBe(0);
  });
});
