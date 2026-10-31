import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const SCRIPT = resolve(REPO_ROOT, 'scripts/ci-merge-queue-check.mjs');
const RULESET_FIXTURE = resolve(
  REPO_ROOT,
  'scripts/lib/__tests__/fixtures/main-ruleset-10512119.json'
);

// The live verify is the scheduled observer that reads the real ruleset via
// gh. These tests replay GitHub quota failures through a stub `gh` on PATH so
// the deferral contract stays executable: quota exhaustion defers (exit 75,
// github-quota-deferred, never a drift verdict), a real failure stays red,
// and a healthy read still validates.

/** @type {string | null} */
let stubDir = null;

function stubGh(script) {
  stubDir = mkdtempSync(join(tmpdir(), 'merge-queue-live-verify-'));
  writeFileSync(join(stubDir, 'gh'), `#!/bin/sh\n${script}\n`, {
    mode: 0o755,
  });
}

function runVerify(extraArgs = []) {
  const run = spawnSync(
    process.execPath,
    [SCRIPT, 'verify', '--allow-unavailable-bypass-actors', ...extraArgs],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${stubDir}:${process.env.PATH ?? ''}`,
      },
      timeout: 60_000,
    }
  );
  if (run.error) throw run.error;
  return run;
}

describe('merge queue live verify under quota exhaustion', () => {
  beforeEach(() => {
    stubDir = null;
  });

  afterEach(() => {
    if (stubDir) rmSync(stubDir, { recursive: true, force: true });
    stubDir = null;
  });

  it('defers with exit 75 and the github-quota-deferred marker on an installation 403', () => {
    stubGh(
      `echo "gh: API rate limit exceeded for installation ID 12345 (URL: https://api.github.com/repositories)" >&2\nexit 1`
    );
    const run = runVerify();
    expect(run.status).toBe(75);
    expect(run.stderr).toContain('github-quota-deferred');
    expect(run.stderr).toContain('Live GitHub ruleset verification deferred');
    expect(run.stderr).toContain('not a verdict on ruleset parity');
    // The drift verdict and its Slack message must stay reserved for real drift.
    expect(run.stdout).not.toContain('Live ruleset OK');
  });

  it('still validates and passes on a healthy read', () => {
    stubGh(`cat '${RULESET_FIXTURE}'\nexit 0`);
    const run = runVerify();
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('Live ruleset OK');
  });

  it('keeps a non-quota failure a hard red (exit 1)', () => {
    stubGh(
      `echo "gh: Resource not accessible by integration (HTTP 403)" >&2\nexit 1`
    );
    const run = runVerify();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Live GitHub ruleset verification failed');
    expect(run.stderr).toContain('Resource not accessible by integration');
    expect(run.stderr).not.toContain('github-quota-deferred');
  });
  it('keeps actual ruleset drift a hard red after a successful read', () => {
    const ruleset = JSON.parse(readFileSync(RULESET_FIXTURE, 'utf8'));
    ruleset.rules.find(
      rule => rule.type === 'required_status_checks'
    ).parameters.required_status_checks = [];
    stubGh(`cat <<'RULESET'\n${JSON.stringify(ruleset)}\nRULESET`);
    const run = runVerify();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('PR Ready');
    expect(run.stderr).not.toContain('github-quota-deferred');
    expect(run.stdout).not.toContain('Live ruleset OK');
  });

  it('rejects malformed successful responses without deferring', () => {
    stubGh("echo '{invalid json}'");
    const run = runVerify();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Live GitHub ruleset verification failed');
    expect(run.stderr).not.toContain('github-quota-deferred');
  });
});
