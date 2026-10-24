import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGitHubClient } from '../../../packages/api-client/github.ts';
import { SOURCE_GUARDS } from '../../ci-fast-lanes.mjs';
import {
  checkSyntheticCanary,
  main,
} from '../../synthetic-canary-liveness.mjs';

vi.mock('../../../packages/api-client/github.ts', () => ({
  createGitHubClient: vi.fn(),
}));
const NOW = Date.parse('2026-10-23T13:17:00Z');
const iso = minutes => new Date(NOW - minutes * 60_000).toISOString();
const repo = 'JovieInc/Jovie';
const root = resolve(import.meta.dirname, '../../..');
const job = (conclusion = 'success') => ({
  name: 'Production Synthetic Tests',
  status: 'completed',
  conclusion,
});
const run = (overrides = {}) => ({
  id: 100,
  run_attempt: 1,
  event: 'schedule',
  head_branch: 'main',
  created_at: iso(30),
  updated_at: iso(1),
  status: 'completed',
  conclusion: 'success',
  display_title: 'Production Synthetic Monitoring (17 */6 * * *)',
  ...overrides,
});
function githubFor(runs, jobs = { 100: [job()] }) {
  return {
    rest: vi.fn(async (_method, path) => ({
      status: 200,
      json: /** @returns {unknown} */ () =>
        path.includes('/workflows/')
          ? { workflow_runs: runs }
          : {
              jobs: jobs[path.match(/runs\/(\d+)/)[1]],
              total_count: jobs[path.match(/runs\/(\d+)/)[1]]?.length,
            },
    })),
  };
}
const check = github => checkSyntheticCanary({ github, repo, now: NOW });
afterEach(() => vi.restoreAllMocks());

describe('synthetic canary dead-man', () => {
  it('uses the scheduled main job for this attempt, through the shared polling client', async () => {
    const github = githubFor([run({ run_attempt: 2 })]);
    expect(await check(github)).toMatchObject({ ok: true });
    expect(github.rest).toHaveBeenNthCalledWith(
      1,
      'GET',
      `/repos/${repo}/actions/workflows/synthetic-monitoring.yml/runs?branch=main&event=schedule&per_page=10`,
      undefined,
      expect.objectContaining({
        priority: 'poll',
        timeoutMs: 10_000,
        maxAttempts: 2,
      })
    );
    expect(github.rest.mock.calls[1][1]).toContain(
      '/100/attempts/2/jobs?per_page=100'
    );
  });

  it('alarms on a missing run, and at seven hours even if an old run was just rerun', async () => {
    expect(await check(githubFor([]))).toMatchObject({
      ok: false,
      reason: expect.stringContaining('No recent'),
    });
    expect(
      await check(githubFor([run({ created_at: iso(421) })]))
    ).toMatchObject({ ok: false, reason: expect.stringContaining('7 hours') });
    expect(
      await check(githubFor([run({ created_at: iso(420) })]))
    ).toMatchObject({ ok: true });
  });

  it.each([
    'failure',
    'skipped',
    'cancelled',
    'timed_out',
    'action_required',
    'neutral',
  ])('alarms on a %s run despite a previous green', async conclusion => {
    expect(
      await check(
        githubFor([run({ conclusion }), run({ id: 99, created_at: iso(360) })])
      )
    ).toMatchObject({
      ok: false,
      reason: `Scheduled canary run concluded ${conclusion}`,
    });
  });

  it.each(['skipped', 'failure', 'cancelled', 'timed_out', null])(
    'alarms on a %s job even in a green workflow',
    async conclusion => {
      expect(
        await check(githubFor([run()], { 100: [job(conclusion)] }))
      ).toMatchObject({
        ok: false,
        reason: `Scheduled canary job concluded ${conclusion}`,
      });
    }
  );

  it('alarms when a completed workflow has no canary job', async () => {
    expect(await check(githubFor([run()], { 100: [] }))).toMatchObject({
      ok: false,
      reason: 'Completed run has no completed canary job',
    });
  });

  it('ignores named daily AI runs, which cannot mask a missed six-hour run', async () => {
    const daily = run({
      id: 101,
      display_title: 'Production Synthetic Monitoring (47 7 * * *)',
    });
    const github = githubFor([daily, run({ created_at: iso(421) })]);
    expect(await check(github)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('7 hours'),
    });
    expect(github.rest).toHaveBeenCalledTimes(1);
    expect(await check(githubFor([daily]))).toMatchObject({ ok: false });
  });

  it.each(['success', 'failure', null])(
    'recognizes a legacy AI-only run (%s) during rollout',
    async conclusion => {
      const daily = run({
        id: 101,
        display_title: 'Production Synthetic Monitoring',
      });
      expect(
        await check(
          githubFor([daily, run()], {
            101: [
              job('skipped'),
              {
                name: 'Web AI Health (Daily)',
                status: 'completed',
                conclusion,
              },
            ],
            100: [job()],
          })
        )
      ).toMatchObject({ ok: true });
    }
  );

  it('does not excuse a skipped six-hour job because a daily job ran', async () => {
    expect(
      await check(
        githubFor([run()], {
          100: [
            job('skipped'),
            {
              name: 'Web AI Health (Daily)',
              status: 'completed',
              conclusion: 'success',
            },
          ],
        })
      )
    ).toMatchObject({ ok: false, reason: expect.stringContaining('skipped') });
  });

  it('ignores manual/off-branch successes and sorts by creation, not rerun time', async () => {
    expect(
      await check(
        githubFor([
          run({ id: 98, created_at: iso(421), conclusion: 'failure' }),
          run(),
          run({ id: 102, event: 'workflow_dispatch' }),
          run({ id: 103, head_branch: 'feature' }),
        ])
      )
    ).toMatchObject({ ok: true });
    expect(
      await check(githubFor([run({ event: 'workflow_dispatch' })]))
    ).toMatchObject({ ok: false });
  });

  it.each(['queued', 'in_progress', 'waiting'])(
    'bounds a %s run and still requires an earlier heartbeat',
    async status => {
      const pending = run({ id: 101, status, conclusion: null });
      const jobs = { 101: [], 100: [job()] };
      expect(
        await check(githubFor([pending, run({ created_at: iso(360) })], jobs))
      ).toMatchObject({ ok: true, reason: expect.stringContaining('pending') });
      expect(
        await check(githubFor([pending, run({ created_at: iso(421) })], jobs))
      ).toMatchObject({ ok: false });
      expect(await check(githubFor([pending], jobs))).toMatchObject({
        ok: false,
      });
      expect(
        await check(githubFor([{ ...pending, created_at: iso(61) }], jobs))
      ).toMatchObject({
        ok: false,
        reason: expect.stringContaining('over 1 hour'),
      });
      expect(
        await check(
          githubFor(
            [
              { ...pending, created_at: iso(60) },
              run({ created_at: iso(360) }),
            ],
            jobs
          )
        )
      ).toMatchObject({ ok: true });
    }
  );

  it.each(['bad-date', iso(-1)])(
    'rejects an invalid or future run timestamp: %s',
    async created_at => {
      expect(await check(githubFor([run({ created_at })]))).toMatchObject({
        ok: false,
        reason: 'Synthetic canary evidence unavailable',
      });
    }
  );

  it('fails closed on incomplete jobs, invalid context, and malformed run responses', async () => {
    const github = githubFor([run()]);
    github.rest
      .mockResolvedValueOnce({
        status: 200,
        json: () => ({ workflow_runs: [run()] }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: () => ({ jobs: [job()], total_count: 2 }),
      });
    expect(await check(github)).toMatchObject({ ok: false });
    github.rest.mockResolvedValue({ status: 200, json: () => ({}) });
    expect(await check(github)).toMatchObject({ ok: false });
    expect(
      await checkSyntheticCanary({ github, repo: 'invalid', now: NOW })
    ).toMatchObject({ ok: false });
    expect(await check(githubFor([run({ run_attempt: null })]))).toMatchObject({
      ok: false,
    });
  });

  it.each([403, 404, 500])(
    'alarms on unreadable evidence (HTTP %s)',
    async status => {
      const github = { rest: vi.fn(async () => ({ status })) };
      expect(await check(github)).toMatchObject({
        ok: false,
        reason: 'Synthetic canary evidence unavailable',
      });
    }
  );

  it.each([null, [], 'invalid'])(
    'rejects a malformed API body (%s)',
    async body => {
      const github = {
        rest: vi.fn(async () => ({ status: 200, json: () => body })),
      };
      expect(await check(github)).toMatchObject({
        ok: false,
        reason: 'Synthetic canary evidence unavailable',
      });
    }
  );

  it('never copies raw API errors into the alert', async () => {
    const github = {
      rest: vi.fn().mockRejectedValue(new Error('sensitive response body')),
    };
    expect(JSON.stringify(await check(github))).not.toContain(
      'sensitive response body'
    );
  });

  it.each([true, false])(
    'publishes status, evidence URL and timestamp before returning a failing exit (%s)',
    async healthy => {
      const dir = mkdtempSync(join(tmpdir(), 'synthetic-deadman-'));
      vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const env = {
          GITHUB_REPOSITORY: repo,
          GITHUB_OUTPUT: join(dir, 'output'),
          GITHUB_STEP_SUMMARY: join(dir, 'summary'),
        };
        expect(
          await main({
            github: githubFor(healthy ? [run()] : []),
            env,
            now: NOW,
          })
        ).toBe(healthy ? 0 : 1);
        expect(readFileSync(env.GITHUB_OUTPUT, 'utf8')).toContain(
          `test_status=${healthy ? 'passed' : 'failed'}\n`
        );
        expect(readFileSync(env.GITHUB_OUTPUT, 'utf8')).toContain(
          'run_url=https://github.com/JovieInc/Jovie/actions/'
        );
        expect(readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8')).toContain(
          new Date(NOW).toISOString()
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  );

  it('uses the existing GitHub credential without requiring new configuration', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(createGitHubClient).mockReturnValue(
      /** @type {ReturnType<typeof createGitHubClient>} */ (
        /** @type {unknown} */ (githubFor([run()]))
      )
    );
    expect(await main({ env: { GH_TOKEN: 'test-credential' }, now: NOW })).toBe(
      0
    );
    expect(createGitHubClient).toHaveBeenCalledWith({
      token: 'test-credential',
    });
    expect(await main({ env: {}, now: NOW })).toBe(0);
  });
});

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
