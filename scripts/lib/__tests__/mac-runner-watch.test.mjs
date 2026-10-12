import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(
  import.meta.dirname,
  '../../../.github/scripts/mac-runner-watch.sh'
);
// GitHub timestamps carry no milliseconds (jq fromdateiso8601 rejects them).
const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const old = iso(Date.now() - 30 * 60 * 1000);
const fresh = iso(Date.now());

// Fake gh: serves canned API JSON through real jq and logs every call.
const FAKE_GH = `#!/usr/bin/env bash
echo "$*" >> "$GH_LOG"
jq_expr=""; args=()
while [ $# -gt 0 ]; do
  if [ "$1" = --jq ]; then jq_expr="$2"; shift 2; else args+=("$1"); shift; fi
done
case "\${args[*]}" in
  "api repos/o/r/actions/runs?status=queued&per_page=100") body="$RUNS_QUEUED" ;;
  "api repos/o/r/actions/runs?status=in_progress&per_page=100") body="$RUNS_IN_PROGRESS" ;;
  "api repos/o/r/actions/runs/"*"/jobs?per_page=100") body="$JOBS" ;;
  "api repos/o/r/actions/runs/"*) body='{"status":"completed"}' ;;
  *) exit 0 ;;
esac
if [ -n "$jq_expr" ]; then printf '%s' "$body" | jq -r "$jq_expr"; else printf '%s' "$body"; fi
`;

let dir;
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

function watch({ runs = [], jobs = [] }) {
  dir = mkdtempSync(resolve(tmpdir(), 'mac-runner-watch-'));
  writeFileSync(resolve(dir, 'gh'), FAKE_GH);
  chmodSync(resolve(dir, 'gh'), 0o755);
  const log = resolve(dir, 'gh.log');
  writeFileSync(log, '');
  const result = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      GH_LOG: log,
      MAC_WATCH_REPOS: 'o/r',
      MAC_WATCH_CANCEL_WAIT_SECONDS: '0',
      RUNS_QUEUED: JSON.stringify({ workflow_runs: [] }),
      RUNS_IN_PROGRESS: JSON.stringify({ workflow_runs: runs }),
      JOBS: JSON.stringify({ jobs }),
    },
  });
  expect(result.status, result.stderr).toBe(0);
  return readFileSync(log, 'utf8').trim().split('\n');
}

const run = (over = {}) => ({
  id: 7,
  run_attempt: 1,
  path: '.github/workflows/ci.yml',
  created_at: old,
  ...over,
});
const macJob = (over = {}) => ({
  status: 'queued',
  runner_name: null,
  labels: ['self-hosted', 'macOS', 'ARM64', 'jovie-mac'],
  created_at: old,
  ...over,
});

describe('mac-runner-watch', () => {
  it('dispatches the heartbeat every pass', () => {
    expect(watch({})[0]).toBe(
      'workflow run mac-runner-heartbeat.yml -R o/r --ref main'
    );
  });

  it('force-cancels and reruns a run stuck on a sleeping Mac', () => {
    const calls = watch({ runs: [run()], jobs: [macJob()] });
    expect(calls).toContain(
      'api -X POST repos/o/r/actions/runs/7/force-cancel'
    );
    expect(calls).toContain('run rerun 7 -R o/r');
  });

  it.each([
    ['a rerun (already hosted)', [run({ run_attempt: 2 })], [macJob()]],
    [
      'a run still inside the grace window',
      [run({ created_at: fresh })],
      [macJob()],
    ],
    [
      'a workflow without a Mac route',
      [run({ path: '.github/workflows/other.yml' })],
      [macJob()],
    ],
    [
      'a Mac job that a runner picked up',
      [run()],
      [macJob({ runner_name: 'tw-mac-001' })],
    ],
    [
      'a hosted macOS job waiting on the pool',
      [run()],
      [macJob({ labels: ['macos-15'] })],
    ],
    ['a Mac job queued only briefly', [run()], [macJob({ created_at: fresh })]],
  ])('leaves %s alone', (_name, runs, jobs) => {
    const calls = watch({ runs, jobs }).join('\n');
    expect(calls).not.toContain('force-cancel');
    expect(calls).not.toContain('run rerun');
  });
});
