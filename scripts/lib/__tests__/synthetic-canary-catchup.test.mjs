import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createGitHubClient } from '../../../packages/api-client/github.ts';
import { SOURCE_GUARDS } from '../../ci-fast-lanes.mjs';
import {
  CANARY_WORKFLOW,
  CONFIRM_ATTEMPTS,
  catchup,
  DISPATCH_REF,
  decideCatchup,
  dispatchCatchup,
  latestCanaryScheduledRun,
  main,
} from '../../synthetic-canary-catchup.mjs';

vi.mock('../../../packages/api-client/github.ts', () => ({
  createGitHubClient: vi.fn(),
}));

const NOW = Date.parse('2026-11-16T16:53:00Z');
const iso = minutes => new Date(NOW - minutes * 60_000).toISOString();
const repo = 'JovieInc/Jovie';
const scheduledPath = `/repos/${repo}/actions/workflows/${CANARY_WORKFLOW}/runs?branch=main&event=schedule&per_page=10`;
const dispatchPath = `/repos/${repo}/actions/workflows/${CANARY_WORKFLOW}/dispatches`;
const scheduledRun = (overrides = {}) => ({
  id: 100,
  run_attempt: 1,
  event: 'schedule',
  head_branch: 'main',
  created_at: iso(30),
  status: 'completed',
  conclusion: 'success',
  display_title: 'Production Synthetic Monitoring (17 */6 * * *)',
  ...overrides,
});
const dailyRun = (overrides = {}) =>
  scheduledRun({
    id: 101,
    display_title: 'Production Synthetic Monitoring (47 7 * * *)',
    ...overrides,
  });
const dispatchRun = (overrides = {}) => ({
  id: 200,
  run_attempt: 1,
  event: 'workflow_dispatch',
  head_branch: 'main',
  created_at: iso(10),
  status: 'completed',
  conclusion: 'success',
  display_title: 'Production Synthetic Monitoring (workflow_dispatch)',
  ...overrides,
});

/**
 * Fake reader: GET schedule list, GET dispatch list (optionally only after N
 * reads, to model the runs-index lag behind a fresh dispatch), POST dispatch.
 */
/**
 * dispatchedAfter (1-based): the dispatch-ledger read index from which the
 * rows appear. 1 = the decideCatchup idempotency read sees prior dispatches;
 * 2 = rows appear only on the post-dispatch confirmation reads; Infinity
 * (default) = never, i.e. the dispatch ledger is empty.
 */
/** @typedef {{status: number, headers?: unknown}} FakeResponse */

/** @param {{scheduled?: Array<Record<string, unknown>>,
 * dispatched?: Array<Record<string, unknown>>, dispatchedAfter?: number,
 * post?: FakeResponse, scheduleBody?: unknown}} [options] */
function reader({
  scheduled = [],
  dispatched = [],
  dispatchedAfter = Infinity,
  post = { status: 204 },
} = {}) {
  let dispatchReads = 0;
  const instance = {
    calls: [],
    rest: vi.fn(async (method, path, body) => {
      instance.calls.push({ method, path, body });
      if (method === 'POST') {
        return {
          status: post.status,
          headers: post.headers,
          json: () => ({}),
        };
      }
      if (path.includes('event=workflow_dispatch')) {
        dispatchReads += 1;
        const rows = dispatchReads >= dispatchedAfter ? dispatched : [];
        return { status: 200, json: () => ({ workflow_runs: rows }) };
      }
      return { status: 200, json: () => ({ workflow_runs: scheduled }) };
    }),
  };
  return instance;
}
const posted = github => github.calls.find(call => call.method === 'POST');
const noOpSleep = async () => {};

describe('synthetic canary catch-up', () => {
  it('mirrors the dead-man filter: newest scheduled main canary, daily runs skipped', () => {
    const last = latestCanaryScheduledRun(
      [dailyRun({ created_at: iso(5) }), scheduledRun({ created_at: iso(30) })],
      NOW
    );
    expect(last).toMatchObject({ age: 30 });
    expect(latestCanaryScheduledRun([dailyRun()], NOW)).toBeNull();
  });

  it('fails closed on invalid scheduled evidence', () => {
    expect(() =>
      latestCanaryScheduledRun([scheduledRun({ created_at: 'bad-date' })], NOW)
    ).toThrow('invalid-run');
    expect(() =>
      latestCanaryScheduledRun([scheduledRun({ created_at: iso(-1) })], NOW)
    ).toThrow('invalid-run');
    expect(() =>
      latestCanaryScheduledRun([scheduledRun({ id: null })], NOW)
    ).toThrow('invalid-run');
  });

  it('no-ops while the schedule is healthy and after a catch-up for the gap', async () => {
    const healthy = reader({ scheduled: [scheduledRun()] });
    expect(await decideCatchup(healthy, repo, NOW)).toMatchObject({
      action: 'canary-schedule-healthy',
    });
    expect(healthy.calls.map(call => call.path)).toEqual([scheduledPath]);

    const caught = reader({
      scheduled: [scheduledRun({ created_at: iso(421) })],
      dispatched: [dispatchRun({ created_at: iso(400) })],
      dispatchedAfter: 1,
    });
    expect(await decideCatchup(caught, repo, NOW)).toMatchObject({
      action: 'catch-up-already-issued',
    });
    expect(posted(caught)).toBeUndefined();
  });

  it('dispatches exactly once per gap and only counts main-branch dispatches', async () => {
    const github = reader({
      scheduled: [scheduledRun({ created_at: iso(421) })],
      dispatched: [
        dispatchRun({ id: 201, head_branch: 'feature', created_at: iso(5) }),
      ],
      dispatchedAfter: 1,
    });
    expect(await decideCatchup(github, repo, NOW)).toMatchObject({
      action: 'dispatch',
    });
    expect(posted(github)).toBeUndefined();
  });

  it('ignores malformed timestamps in the dispatch ledger rather than failing', async () => {
    const github = reader({
      scheduled: [scheduledRun({ created_at: iso(421) })],
      dispatched: [dispatchRun({ created_at: 'bad-date' })],
      dispatchedAfter: 1,
    });
    expect(await decideCatchup(github, repo, NOW)).toMatchObject({
      action: 'dispatch',
    });
  });

  it('dispatches on a missed slot, confirming via the runs ledger', async () => {
    const github = reader({
      scheduled: [scheduledRun({ created_at: iso(421) })],
      dispatched: [dispatchRun({ created_at: new Date(NOW).toISOString() })],
      dispatchedAfter: 2,
    });
    const result = await catchup({
      github,
      env: { GITHUB_REPOSITORY: repo },
      now: NOW,
      sleep: noOpSleep,
    });
    expect(result).toMatchObject({
      action: 'dispatch',
      confirmed: true,
      exitCode: 0,
    });
    expect(posted(github)).toMatchObject({
      path: dispatchPath,
      body: { ref: DISPATCH_REF },
    });
  });

  it('dispatches at exactly the 7-hour boundary and not one minute before', async () => {
    for (const [age, expected] of [
      [419, 'canary-schedule-healthy'],
      [420, 'canary-schedule-healthy'],
      [421, 'dispatch'],
    ]) {
      const github = reader({
        scheduled: [scheduledRun({ created_at: iso(age) })],
      });
      expect(await decideCatchup(github, repo, NOW)).toMatchObject({
        action: expected,
      });
    }
  });

  it('treats an unconfirmable dispatch as a failure so a later check re-evaluates', async () => {
    const github = reader({
      scheduled: [scheduledRun({ created_at: iso(421) })],
      dispatched: [],
    });
    const result = await catchup({
      github,
      env: { GITHUB_REPOSITORY: repo },
      now: NOW,
      sleep: noOpSleep,
    });
    expect(result).toMatchObject({ confirmed: false, exitCode: 1 });
    // 2 evidence GETs + 1 dispatch POST + 5 confirmation GETs.
    expect(github.rest).toHaveBeenCalledTimes(3 + CONFIRM_ATTEMPTS);
  });

  it.each([
    [403, { 'x-ratelimit-remaining': '0' }, 75],
    [429, {}, 75],
    [502, {}, 75],
  ])(
    'defers a quota or transient dispatch refusal (HTTP %s) with exit %i',
    async (status, headers, expected) => {
      const github = reader({
        scheduled: [scheduledRun({ created_at: iso(421) })],
        post: { status, headers },
      });
      const result = await catchup({
        github,
        env: { GITHUB_REPOSITORY: repo },
        now: NOW,
        sleep: noOpSleep,
      });
      expect(result).toMatchObject({ deferred: true, exitCode: expected });
    }
  );

  it('fails loudly on a bare 403, which is a permission answer, not a deferral', async () => {
    const github = reader({
      scheduled: [scheduledRun({ created_at: iso(421) })],
      post: { status: 403 },
    });
    expect(
      await catchup({
        github,
        env: { GITHUB_REPOSITORY: repo },
        now: NOW,
        sleep: noOpSleep,
      })
    ).toMatchObject({ action: 'dispatch-failed', exitCode: 1 });
  });

  it.each([403, 500])(
    'defers on unreadable evidence with quota evidence (HTTP %s)',
    async status => {
      const github = reader({
        scheduled: [scheduledRun({ created_at: iso(421) })],
      });
      github.rest.mockImplementation(async (_method, path) =>
        path.includes('event=workflow_dispatch')
          ? {
              status,
              headers: { 'x-ratelimit-remaining': '0' },
              json: () => ({}),
            }
          : {
              status: 200,
              json: () => ({
                workflow_runs: [scheduledRun({ created_at: iso(421) })],
              }),
            }
      );
      expect(
        await catchup({
          github,
          env: { GITHUB_REPOSITORY: repo },
          now: NOW,
          sleep: noOpSleep,
        })
      ).toMatchObject({ action: 'catch-up-error', exitCode: 75 });
    }
  );

  it('never dispatches on empty, malformed, or future-dated evidence', async () => {
    for (const scheduled of [[], 'invalid', null]) {
      const github = reader({
        scheduled: [scheduledRun({ created_at: iso(421) })],
      });
      github.rest.mockImplementation(async (_method, path) =>
        path.includes('event=workflow_dispatch')
          ? { status: 200, json: () => ({ workflow_runs: [] }) }
          : { status: 200, json: () => ({ workflow_runs: scheduled }) }
      );
      const result = await catchup({
        github,
        env: { GITHUB_REPOSITORY: repo },
        now: NOW,
        sleep: noOpSleep,
      });
      expect(result.exitCode).toBe(1);
      expect(posted(github)).toBeUndefined();
    }
  });

  it('rejects an invalid context without dispatching', async () => {
    expect(
      await catchup({
        github: reader(),
        env: { GITHUB_REPOSITORY: 'not a repo' },
        now: NOW,
        sleep: noOpSleep,
      })
    ).toMatchObject({ action: 'catch-up-error', exitCode: 1 });
    expect(
      await catchup({
        github: reader(),
        env: { GITHUB_REPOSITORY: repo },
        now: Number.NaN,
        sleep: noOpSleep,
      })
    ).toMatchObject({ action: 'catch-up-error', exitCode: 1 });
  });

  it('dispatchCatchup returns a plain deferral verdict without polling on refusal', async () => {
    const github = reader({ post: { status: 429 } });
    expect(
      await dispatchCatchup(github, repo, { now: NOW, sleep: noOpSleep })
    ).toMatchObject({ dispatched: false, deferred: true });
    expect(github.rest).toHaveBeenCalledTimes(1);
  });
});

describe('catch-up receipts and exit wiring', () => {
  it('logs a JSON receipt and step summary for a no-op', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'synthetic-catchup-'));
    const summaryFile = join(dir, 'summary');
    writeFileSync(summaryFile, '');
    const github = reader({ scheduled: [scheduledRun()] });
    const log = [];
    vi.spyOn(console, 'log').mockImplementation(line => log.push(line));
    try {
      expect(
        await main({
          github,
          env: { GITHUB_REPOSITORY: repo, GITHUB_STEP_SUMMARY: summaryFile },
          now: NOW,
          sleep: noOpSleep,
        })
      ).toBe(0);
      expect(JSON.parse(log[0])).toMatchObject({
        action: 'canary-schedule-healthy',
        exitCode: 0,
      });
      expect(readFileSync(summaryFile, 'utf8')).toContain(
        'JOV-6813 catch-up: canary-schedule-healthy'
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('publishes a warning with the quota marker on a deferral', async () => {
    const warnings = [];
    vi.spyOn(console, 'warn').mockImplementation(line => warnings.push(line));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const github = reader({
      scheduled: [scheduledRun({ created_at: iso(421) })],
      post: { status: 403, headers: { 'x-ratelimit-remaining': '0' } },
    });
    expect(
      await main({
        github,
        env: { GITHUB_REPOSITORY: repo },
        now: NOW,
        sleep: noOpSleep,
      })
    ).toBe(75);
    expect(warnings.join('\n')).toContain('github-quota-deferred');
    expect(warnings.join('\n')).toContain(
      '::warning title=Synthetic canary catch-up deferred::'
    );
  });

  it('publishes an error annotation on a failing verdict', async () => {
    const errors = [];
    vi.spyOn(console, 'error').mockImplementation(line => errors.push(line));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(
      await main({
        github: reader(),
        env: { GITHUB_REPOSITORY: repo },
        now: NOW,
        sleep: noOpSleep,
      })
    ).toBe(1);
    expect(errors.join('\n')).toContain('::error::');
  });

  it('uses the existing GitHub credential without requiring new configuration', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(createGitHubClient).mockReturnValue(
      /** @type {ReturnType<typeof createGitHubClient>} */ (
        /** @type {unknown} */ (reader({ scheduled: [scheduledRun()] }))
      )
    );
    expect(
      await catchup({
        env: { GH_TOKEN: 'test-credential' },
        now: NOW,
        sleep: noOpSleep,
      })
    ).toMatchObject({ action: 'canary-schedule-healthy' });
    expect(createGitHubClient).toHaveBeenCalledWith({
      token: 'test-credential',
    });
  });

  it('defaults to the real timer sleep and still confirms on the first poll', async () => {
    vi.useFakeTimers();
    try {
      const github = reader({
        scheduled: [scheduledRun({ created_at: iso(421) })],
        dispatched: [dispatchRun({ created_at: new Date(NOW).toISOString() })],
        dispatchedAfter: 1,
      });
      const pending = dispatchCatchup(github, repo, { now: NOW });
      await vi.advanceTimersByTimeAsync(CONFIRM_DELAY_MS);
      expect(await pending).toMatchObject({ confirmed: true, deferred: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('is wired into the synthetic-canary-liveness guard with coverage', () => {
    const guard = SOURCE_GUARDS.find(
      item => item.id === 'synthetic-canary-liveness'
    );
    expect(guard?.command).toContain(
      'lib/__tests__/synthetic-canary-catchup.test.mjs'
    );
    expect(guard?.command).toContain(
      '--coverage.include=synthetic-canary-catchup.mjs'
    );
    for (const file of [
      'scripts/synthetic-canary-catchup.mjs',
      'scripts/lib/__tests__/synthetic-canary-catchup.test.mjs',
    ]) {
      expect(guard?.inputs.test(file)).toBe(true);
    }
  });
});
