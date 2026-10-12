import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Behavior of .github/scripts/mac-lane.sh (policy: .claude/rules/infra.md
// "macOS runners"). A fake gh answers from per-test fixtures.
const SCRIPT = resolve(
  import.meta.dirname,
  '../../../.github/scripts/mac-lane.sh'
);

const FAKE_GH = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_DIR/calls"
args="$*"
if [[ "$args" == *"/dispatches"* ]]; then
  [ -f "$FAKE_DIR/dispatch.json" ] || exit 1
  cat "$FAKE_DIR/dispatch.json"
elif [[ "$args" == *"/cancel"* ]]; then
  echo '{}'
elif [[ "$args" == *"/jobs"* ]]; then
  [ -f "$FAKE_DIR/jobs.json" ] || exit 1
  jq "$(sed -n 's/.*--jq //p' <<<"$args")" "$FAKE_DIR/jobs.json"
elif [[ "$args" == *"/actions/runs/"* ]]; then
  [ -f "$FAKE_DIR/run.json" ] || exit 1
  jq -r "$(sed -n 's/.*--jq //p' <<<"$args")" "$FAKE_DIR/run.json"
else
  exit 1
fi
`;

function run(command, { env = {}, fixtures = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mac-lane-'));
  const bin = join(dir, 'bin');
  spawnSync('mkdir', ['-p', bin]);
  writeFileSync(join(bin, 'gh'), FAKE_GH);
  chmodSync(join(bin, 'gh'), 0o755);
  for (const [name, value] of Object.entries(fixtures)) {
    writeFileSync(join(dir, name), JSON.stringify(value));
  }
  const output = join(dir, 'output');
  writeFileSync(output, '');
  writeFileSync(join(dir, 'calls'), '');
  const result = spawnSync('bash', [SCRIPT, command], {
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_DIR: dir,
      GITHUB_OUTPUT: output,
      GITHUB_SERVER_URL: 'https://github.com',
      GH_REPO: 'JovieInc/Jovie',
      LANE: 'ios',
      FIRST_POLL_SECONDS: '0',
      POLL_SECONDS: '0',
      ...env,
    },
  });
  const outputs = Object.fromEntries(
    readFileSync(output, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => line.split(/=(.*)/s).slice(0, 2))
  );
  const calls = readFileSync(join(dir, 'calls'), 'utf8')
    .split('\n')
    .filter(Boolean);
  return { status: result.status, outputs, calls, stdout: result.stdout };
}

const macJob = (status, conclusion = null, failedStep = false) => ({
  status,
  conclusion,
  runner_name: status === 'queued' ? null : 'tw-mac-001',
  labels: ['self-hosted', 'macOS', 'ARM64', 'jovie-mac'],
  steps: [{ name: 'Test', conclusion: failedStep ? 'failure' : 'success' }],
});
const dispatchEnv = {
  GH_TOKEN: 'token',
  DISPATCH_REF: 'main',
  CHECKOUT_SHA: 'abc',
  JOIN_GROUP: 'join',
  SUPERSEDE_GROUP: 'supersede',
  PARENT_RUN: 'https://github.com/JovieInc/Jovie/actions/runs/1',
};

describe('mac-lane.sh dispatch', () => {
  it('hands off to the join once a Mac picks up the child run', () => {
    const result = run('dispatch', {
      env: dispatchEnv,
      fixtures: {
        'dispatch.json': { workflow_run_id: 42 },
        'jobs.json': { jobs: [macJob('in_progress')] },
      },
    });
    expect(result.status).toBe(0);
    expect(result.outputs).toMatchObject({
      fallback: 'false',
      child_run_id: '42',
      join_group: 'join',
    });
    expect(result.calls.some(call => call.includes('/cancel'))).toBe(false);
  });

  it('cancels the child and falls back when no Mac picks it up in time', () => {
    const result = run('dispatch', {
      env: { ...dispatchEnv, MAC_PICKUP_SECONDS: '0' },
      fixtures: {
        'dispatch.json': { workflow_run_id: 42 },
        'jobs.json': { jobs: [macJob('queued')] },
      },
    });
    expect(result.status).toBe(0);
    expect(result.outputs.fallback).toBe('true');
    expect(result.calls.at(-1)).toContain('actions/runs/42/cancel');
  });

  it('falls back when the dispatch itself fails', () => {
    const result = run('dispatch', { env: dispatchEnv });
    expect(result.status).toBe(0);
    expect(result.outputs.fallback).toBe('true');
    expect(result.outputs.child_run_id).toBeUndefined();
  });
});

describe('mac-lane.sh result', () => {
  const RUN = { display_title: 'Mac lane ios @ abc for parent' };
  const result = (jobs, run = RUN) => run_('result', jobs, run);
  const run_ = (command, jobs, runFixture) =>
    run(command, {
      env: { GH_TOKEN: 't', CHILD_RUN_ID: '42', CHECKOUT_SHA: 'abc' },
      fixtures: {
        ...(jobs ? { 'jobs.json': { jobs } } : {}),
        ...(runFixture ? { 'run.json': runFixture } : {}),
      },
    });

  it('passes a Mac success through', () => {
    const passed = result([macJob('completed', 'success')]);
    expect(passed.status).toBe(0);
    expect(passed.outputs.infra).toBe('false');
  });

  it('fails the lane on a real failure', () => {
    const failed = result([macJob('completed', 'failure', true)]);
    expect(failed.status).toBe(1);
    expect(failed.outputs.infra).toBe('false');
  });

  it('hands lost, timed-out or unreadable Macs back to hosted', () => {
    for (const jobs of [
      [macJob('completed', 'failure', false)],
      [macJob('completed', 'cancelled')],
      [macJob('completed', 'timed_out')],
      [],
      undefined,
    ]) {
      const lost = result(jobs);
      expect(lost.status).toBe(0);
      expect(lost.outputs.infra).toBe('true');
    }
  });

  it('never treats a child for another SHA, or an unreadable one, as evidence', () => {
    for (const runFixture of [
      { display_title: 'Mac lane ios @ other for parent' },
      null,
    ]) {
      const untrusted = result([macJob('completed', 'success')], runFixture);
      expect(untrusted.status).toBe(0);
      expect(untrusted.outputs.infra).toBe('true');
    }
  });
});
