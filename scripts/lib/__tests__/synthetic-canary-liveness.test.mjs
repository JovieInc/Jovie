import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createGitHubClient } from '../../../packages/api-client/github.ts';
import {
  checkSyntheticCanary,
  main,
} from '../../synthetic-canary-liveness.mjs';
import {
  check,
  githubFor,
  installSplitSuiteHooks,
  iso,
  job,
  NOW,
  repo,
  run,
} from './synthetic-canary-liveness.fixtures.mjs';
// Collected by this file's vitest command; not a second test entry.
import './synthetic-canary-liveness.cases.mjs';

vi.mock('../../../packages/api-client/github.ts', () => ({
  createGitHubClient: vi.fn(),
}));
installSplitSuiteHooks();
describe('synthetic canary dead-man', () => {
  it('uses the scheduled main job for this attempt, through the shared polling client', async () => {
    const github = githubFor([run({ run_attempt: 2 })]);
    expect(await check(github)).toMatchObject({ ok: true });
    expect(github.rest).toHaveBeenNthCalledWith(
      1,
      'GET',
      `/repos/${repo}/actions/workflows/synthetic-monitoring.yml/runs?branch=main&per_page=10`,
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
      missedSlot: true,
    });
    expect(
      await check(githubFor([run({ created_at: iso(421) })]))
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining('7 hours'),
      missedSlot: true,
    });
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

  it('ignores off-branch successes, counts a dispatched canary, and sorts by creation, not rerun time', async () => {
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
    // A dispatched canary runs the identical probes (the job admits
    // workflow_dispatch), so it is a heartbeat — the 2026-10-29 18:16Z
    // manual dispatch would otherwise have left the dead-man blind.
    expect(
      await check(githubFor([run({ event: 'workflow_dispatch' })]))
    ).toMatchObject({ ok: true, missedSlot: false });
  });

  it('excludes a very late daily cron run (2026-10-30 shape) from the heartbeat', async () => {
    const lateDaily = run({
      id: 104,
      created_at: iso(230), // 47 7 cron landed 6h47m late
      display_title: 'Production Synthetic Monitoring (47 7 * * *)',
    });
    const jobs = {
      104: [
        {
          name: 'Production Synthetic Tests',
          status: 'completed',
          conclusion: 'skipped',
        },
        {
          name: 'Web AI Health (Daily)',
          status: 'completed',
          conclusion: 'success',
        },
      ],
    };
    expect(
      await check(githubFor([lateDaily, run({ created_at: iso(451) })], jobs))
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining('7 hours'),
      missedSlot: true,
    });
  });

  it('does not mark a missed slot while a fresh canary run is still in flight', async () => {
    const pending = run({ id: 101, status: 'queued', conclusion: null });
    const result = await check(githubFor([pending], { 101: [] }));
    expect(result).toMatchObject({ ok: false });
    expect(result.missedSlot).toBe(false);
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
      ).toMatchObject({
        ok: false,
        // A run in flight recovers the stale slot; never re-dispatch on top.
        missedSlot: false,
      });
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
    await main({ github: off, env: { GITHUB_REPOSITORY: repo }, now: NOW });
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
