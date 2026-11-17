import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { describe, expect, it, vi } from 'vitest';
import { SOURCE_GUARDS } from '../../ci-fast-lanes.mjs';
import {
  dispatchSyntheticCanary,
  main,
} from '../../synthetic-canary-liveness.mjs';
import {
  githubFor,
  installSplitSuiteHooks,
  iso,
  job,
  NOW,
  repo,
  root,
  run,
} from './synthetic-canary-liveness.fixtures.mjs';

installSplitSuiteHooks();
describe('watchdog wiring', () => {
  /** @typedef {{name?: string, id?: string, uses?: string, run?: string, if?: string,
   * env?: Record<string, string>, with?: Record<string, string>, 'continue-on-error'?: boolean}} Step */
  /** @typedef {{on: {schedule?: unknown, workflow_run: {workflows: string[]}},
   * jobs: Record<string, {steps: Step[]}>, 'run-name'?: string}} Workflow */
  const load = name =>
    /** @type {Workflow} */ (
      loadYaml(readFileSync(join(root, '.github/workflows', name), 'utf8'))
    );
  const observer = load('automation-liveness.yml');
  const producer = load('synthetic-monitoring.yml');
  const steps = observer.jobs.liveness.steps;

  it('uses exactly the synthetic failure alert action, channel and webhook', () => {
    const failure = producer.jobs['synthetic-test'].steps.find(
      step => step.name === 'Send Slack Alert on Failure'
    );
    const alarm = steps.find(
      step => step.name === 'Send Slack Alert on Synthetic Silence'
    );
    expect(alarm.uses).toBe(failure.uses);
    expect(alarm.with.channel).toBe(failure.with.channel);
    expect(alarm.with.author_name).toBe(failure.with.author_name);
    expect(alarm.env).toEqual(failure.env);
    expect(alarm.if).toContain('always()');
    expect(alarm.if).toContain(
      "steps.synthetic-heartbeat.outcome != 'success'"
    );
    expect(alarm.with.custom_payload).toContain(
      'heartbeat check did not complete'
    );
    const intake = steps.find(
      step => step.name === 'File synthetic heartbeat Linear issue'
    );
    const failureIntake = producer.jobs['synthetic-test'].steps.find(
      step => step.name === 'File or resolve the synthetic Linear issue'
    );
    expect(intake.run).toBe('node scripts/synthetic-monitoring-intake.mjs');
    expect(failureIntake.run).toContain(
      'node scripts/synthetic-monitoring-intake.mjs'
    );
    expect(intake.env.LINEAR_API_KEY).toBe(failureIntake.env.LINEAR_API_KEY);
    expect(intake.env.REMEDIATION_TRIGGERS_DISABLED).toBe(
      failureIntake.env.REMEDIATION_TRIGGERS_DISABLED
    );
    expect(intake.env.TEST_STATUS).toBe('failed');
    expect(intake.env.FAILED_TESTS).toContain(
      'heartbeat check did not complete'
    );
    expect(intake.if).toBe(alarm.if);
  });

  it('alerts before preserving failure, using the existing backstop without a cron or flag', () => {
    expect(observer.on.schedule).toBeUndefined();
    expect(observer.on.workflow_run.workflows).toEqual([
      'Production Continuity Guard',
    ]);
    expect(producer['run-name']).toContain('github.event.schedule');
    const probe = steps.find(step => step.id === 'synthetic-heartbeat');
    expect(probe.run).toBe('node scripts/synthetic-canary-liveness.mjs');
    expect(probe['continue-on-error']).toBeUndefined();
    expect(probe.if).toBe('${{ always() }}');
    const preserve = steps.find(
      step => step.name === 'Preserve synthetic dead-man failure'
    );
    expect(preserve.run).toContain('exit 1');
    expect(steps.indexOf(preserve)).toBeGreaterThan(
      steps.findIndex(
        step => step.name === 'Send Slack Alert on Synthetic Silence'
      )
    );
    expect(preserve.if).toContain('always()');
  });

  it('enforces behavior coverage in source and merge-group CI for every changed input', () => {
    const guard = SOURCE_GUARDS.find(
      item => item.id === 'synthetic-canary-liveness'
    );
    expect(guard.prOnly).toBe(false);
    for (const file of [
      '.github/workflows/automation-liveness.yml',
      '.github/workflows/synthetic-monitoring.yml',
      'scripts/synthetic-canary-liveness.mjs',
      'scripts/lib/__tests__/synthetic-canary-liveness.test.mjs',
    ]) {
      expect(guard.inputs.test(file)).toBe(true);
    }
    expect(guard.command).toContain(
      'lib/__tests__/synthetic-canary-liveness.test.mjs'
    );
    expect(guard.command).toContain('run --coverage');
    expect(guard.command).toContain(
      '--coverage.include=synthetic-canary-liveness.mjs'
    );
    expect(guard.command).toContain('--coverage.thresholds.lines=90');
  });
});

describe('missed-slot dispatch fallback', () => {
  const staleRun = () => [run({ id: 110, created_at: iso(421) })];
  const withPost = (github, status) => {
    github.rest.mockImplementation(async (method, path) => {
      if (method === 'POST') return { status };
      return {
        status: 200,
        json: () => ({ workflow_runs: staleRun() }),
      };
    });
    return github;
  };

  it('re-dispatches the canary on a missed slot without softening the verdict', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dir = mkdtempSync(join(tmpdir(), 'synthetic-dispatch-'));
    const env = {
      GITHUB_REPOSITORY: repo,
      SYNTHETIC_CANARY_DISPATCH: '1',
      GITHUB_OUTPUT: join(dir, 'output'),
      GITHUB_STEP_SUMMARY: join(dir, 'summary'),
    };
    try {
      const github = withPost(githubFor(staleRun()), 204);
      expect(await main({ github, env, now: NOW })).toBe(1);
      const post = github.rest.mock.calls.find(([method]) => method === 'POST');
      expect(post[1]).toBe(
        `/repos/${repo}/actions/workflows/synthetic-monitoring.yml/dispatches`
      );
      expect(post[2]).toEqual({ ref: 'main' });
      expect(post[3]).toEqual({
        priority: 'poll',
        timeoutMs: 10_000,
        maxAttempts: 1,
        maxWaitMs: 5_000,
      });
      expect(readFileSync(env.GITHUB_OUTPUT, 'utf8')).toContain(
        'test_status=failed\n'
      );
      expect(readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8')).toContain(
        'canary re-dispatched'
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never dispatches while the gate is off, on a failed canary, or with a run in flight', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const off = githubFor(staleRun());
    expect(
      await main({ github: off, env: { GITHUB_REPOSITORY: repo }, now: NOW })
    ).toBe(1);
    expect(off.rest.mock.calls.every(([method]) => method === 'GET')).toBe(
      true
    );
    const failed = githubFor(
      [run({ id: 111, created_at: iso(30), conclusion: 'failure' })],
      { 111: [job()] }
    );
    await main({
      github: failed,
      env: { GITHUB_REPOSITORY: repo, SYNTHETIC_CANARY_DISPATCH: '1' },
      now: NOW,
    });
    expect(failed.rest.mock.calls.every(([method]) => method === 'GET')).toBe(
      true
    );
    // The fallback's own aftermath: its dispatched run is still queued above
    // the stale scheduled run — the alarm holds, the re-kick does not repeat.
    const inFlight = run({ id: 112, status: 'queued', conclusion: null });
    const aftermath = githubFor(
      [inFlight, run({ id: 113, created_at: iso(421) })],
      { 112: [], 113: [] }
    );
    await main({
      github: aftermath,
      env: { GITHUB_REPOSITORY: repo, SYNTHETIC_CANARY_DISPATCH: '1' },
      now: NOW,
    });
    expect(
      aftermath.rest.mock.calls.every(([method]) => method === 'GET')
    ).toBe(true);
  });

  it('keeps the dead-man red when the dispatch is rejected or errors', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dir = mkdtempSync(join(tmpdir(), 'synthetic-dispatch-rejected-'));
    try {
      const rejected = withPost(githubFor(staleRun()), 403);
      expect(
        await main({
          github: rejected,
          env: {
            GITHUB_REPOSITORY: repo,
            SYNTHETIC_CANARY_DISPATCH: '1',
            GITHUB_STEP_SUMMARY: join(dir, 's'),
          },
          now: NOW,
        })
      ).toBe(1);
      const posts = rejected.rest.mock.calls.filter(
        ([method]) => method === 'POST'
      );
      expect(posts).toHaveLength(1);
      expect(posts[0][1]).toBe(
        `/repos/${repo}/actions/workflows/synthetic-monitoring.yml/dispatches`
      );
      expect(posts[0][2]).toEqual({ ref: 'main' });
      await expect(
        dispatchSyntheticCanary({ github: rejected, repo })
      ).rejects.toThrow('dispatch-rejected');
      const throwing = githubFor(staleRun());
      throwing.rest.mockImplementation(async method => {
        if (method === 'POST') throw new Error('sensitive response body');
        return {
          status: 200,
          json: () => ({ workflow_runs: staleRun() }),
        };
      });
      expect(
        await main({
          github: throwing,
          env: { GITHUB_REPOSITORY: repo, SYNTHETIC_CANARY_DISPATCH: '1' },
          now: NOW,
        })
      ).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
