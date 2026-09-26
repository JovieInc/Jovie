import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const SCRIPT = 'scripts/symphony/tests/codex-recovery-ci.sh';
const REAL_PYTHON = execFileSync('bash', ['-c', 'command -v python3'], {
  encoding: 'utf8',
}).trim();
const GATE_COUNT = 11;

const temps = [];
afterEach(() => {
  for (const dir of temps.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

// The runner itself executes as `python3 -`; every gate is `python3 <gate>`.
// The shim forwards the runner to the real interpreter and fakes each gate.
function runWithFakeGates({ jobs, failGate = '', sleep = '0.2' }) {
  const dir = mkdtempSync(join(tmpdir(), 'codex-recovery-ci-'));
  temps.push(dir);
  const bin = join(dir, 'bin');
  const running = join(dir, 'running');
  mkdirSync(bin);
  mkdirSync(running);
  const shim = join(bin, 'python3');
  writeFileSync(
    shim,
    `#!/usr/bin/env bash
if [ "$1" = "-" ]; then exec "${REAL_PYTHON}" "$@"; fi
gate="$(basename "$1")"
echo "$gate" >> "${dir}/started"
touch "${running}/$gate"
ls "${running}" | wc -l | tr -d ' ' >> "${dir}/concurrency"
echo "output from $gate"
sleep "${sleep}"
rm -f "${running}/$gate"
[ "$gate" = "$FAIL_GATE" ] && exit 7
exit 0
`
  );
  chmodSync(shim, 0o755);
  const result = spawnSync('bash', [SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      CODEX_RECOVERY_CI_JOBS: String(jobs),
      FAIL_GATE: failGate,
    },
  });
  const lines = file =>
    readdirSync(dir).includes(file)
      ? readFileSync(join(dir, file), 'utf8').trim().split('\n')
      : [];
  return {
    ...result,
    started: lines('started'),
    concurrency: lines('concurrency').map(Number),
  };
}

describe('codex-recovery-ci.sh', () => {
  it('runs every gate within the concurrency bound and prints logs in declaration order', () => {
    const result = runWithFakeGates({ jobs: 3 });
    expect(result.status, result.stderr).toBe(0);
    expect(new Set(result.started).size).toBe(GATE_COUNT);
    expect(Math.max(...result.concurrency)).toBeLessThanOrEqual(3);
    expect(Math.max(...result.concurrency)).toBeGreaterThan(1);
    const groups = [...result.stdout.matchAll(/::group::(\S+) \(exit 0,/g)].map(
      match => match[1]
    );
    const declared = readFileSync(join(REPO_ROOT, SCRIPT), 'utf8')
      .match(/"scripts\/symphony\/tests\/[^"]+\.py"/g)
      .map(entry => entry.slice(1, -1));
    expect(groups).toEqual(declared);
    expect(result.stdout).toContain('output from run-codex-rotate-gate.py');
  });

  it('propagates a failing gate exit code and stops launching new gates', () => {
    const result = runWithFakeGates({
      jobs: 1,
      failGate: 'codex-account-probe.test.py',
      sleep: '0',
    });
    expect(result.status).toBe(7);
    expect(result.started).toEqual([
      'run-codex-rotate-gate.py',
      'codex-account-probe.test.py',
    ]);
    expect(result.stderr).toContain(
      'FAILED (exit 7): scripts/symphony/tests/codex-account-probe.test.py'
    );
    expect(result.stderr).toContain(
      'NOT RUN (earlier gate failed): scripts/symphony/tests/run-pr-discovery-gate.py'
    );
  });

  it('fails when a gate fails late while other gates are in flight', () => {
    const result = runWithFakeGates({
      jobs: GATE_COUNT,
      failGate: 'run-pr-discovery-gate.py',
    });
    expect(result.status).toBe(7);
    expect(new Set(result.started).size).toBe(GATE_COUNT);
  });

  it('rejects an invalid concurrency bound', () => {
    const result = runWithFakeGates({ jobs: 0 });
    expect(result.status).toBe(2);
    expect(result.started).toEqual([]);
  });
});
