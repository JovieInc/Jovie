import { describe, expect, it } from 'vitest';
import {
  CAPS,
  createWritePacer,
  ghApi,
  isBackfillRun,
  pruneDeletions,
  selectBackfillRuns,
  WRITE_SPACING_MS,
} from '../ci-timing-github.mjs';

describe('ghApi CLI adapter', () => {
  it('passes the resolved endpoint to gh api', async () => {
    const seen = [];
    const run = async args => {
      seen.push(args);
      return { code: 0, stdout: '{"ok":true}', stderr: '', deferred: false };
    };
    const out = await ghApi(
      { owner: 'JovieInc', repo: 'Jovie' },
      'GET',
      '/repos/{owner}/{repo}/actions/runs/5001/attempts/1/jobs?per_page=100',
      undefined,
      { run, pacer: async () => {} }
    );
    expect(out).toEqual({ ok: true });
    expect(seen[0][0]).toBe('api');
    expect(seen[0][1]).toBe(
      '/repos/JovieInc/Jovie/actions/runs/5001/attempts/1/jobs?per_page=100'
    );
  });

  it('paces writes (method != GET) through the injected pacer', async () => {
    const paced = [];
    const run = async args => {
      seen.push(args);
      return { code: 0, stdout: '{"sha":"x"}', stderr: '', deferred: false };
    };
    const seen = [];
    await ghApi(
      { owner: 'JovieInc', repo: 'Jovie' },
      'POST',
      '/repos/{owner}/{repo}/git/blobs',
      { content: 'x', encoding: 'utf-8' },
      {
        run,
        pacer: async () => {
          paced.push(1);
        },
      }
    );
    expect(paced).toHaveLength(1);
    expect(seen[0]).toContain('-X');
    expect(seen[0]).toContain('POST');
    expect(seen[0]).toContain('/repos/JovieInc/Jovie/git/blobs');
  });
});

describe('createWritePacer', () => {
  it('waits out the write spacing between consecutive writes, bounded', async () => {
    let clock = 1000;
    const sleeps = [];
    const pace = createWritePacer({
      now: () => clock,
      sleep: async ms => {
        sleeps.push(ms);
        clock += ms;
      },
    });
    await pace(); // first write: no wait
    expect(sleeps).toEqual([]);
    await pace(); // second write inside the window: wait one interval
    expect(sleeps).toEqual([WRITE_SPACING_MS]);
    await pace(); // consecutive writes stay spaced one interval apart
    expect(sleeps).toEqual([WRITE_SPACING_MS, WRITE_SPACING_MS]);
  });
});

describe('pruneDeletions', () => {
  const blob = (path, sha = 'b1') => ({ path, type: 'blob', sha });

  it('deletes only stale data/YYYY-MM-DD/ blobs via null-SHA entries', () => {
    const tree = {
      tree: [
        blob('data/2026-09-01/run-1-a1.ndjson'),
        blob('data/2026-11-10/run-2-a1.ndjson'), // fresh: at the cutoff day
        blob('data/2026-10-31-extra/run-3-a1.ndjson'), // not a day dir
        blob('data/nodate/run-4.ndjson'),
        blob('README.md'),
        { path: 'data/2026-09-01', type: 'tree' },
      ],
    };
    const deletions = pruneDeletions(tree, {
      cutoffMs: Date.parse('2026-11-10T00:00:00Z'),
    });
    expect(deletions).toEqual([
      { path: 'data/2026-09-01/run-1-a1.ndjson', sha: null },
    ]);
  });

  it('caps deletions and never prunes a truncated listing', () => {
    const tree = {
      tree: Array.from({ length: CAPS.maxPruneDeletes + 5 }, (_, i) =>
        blob(`data/2026-09-01/run-${i}-a1.ndjson`)
      ),
    };
    const limits = { cutoffMs: Date.parse('2026-11-10T00:00:00Z') };
    expect(pruneDeletions(tree, limits)).toHaveLength(CAPS.maxPruneDeletes);
    expect(pruneDeletions({ ...tree, truncated: true }, limits)).toBeNull();
    expect(pruneDeletions(null, limits)).toBeNull();
  });
});

describe('backfill run selection', () => {
  const listed = attrs => ({
    id: attrs.id,
    run_attempt: 1,
    name: attrs.name,
    path: `.github/workflows/${attrs.name.toLowerCase()}.yml`,
    event: attrs.event ?? 'pull_request',
    status: 'completed',
    created_at: attrs.created_at,
    updated_at: attrs.updated_at ?? attrs.created_at,
    conclusion: 'success',
  });
  const WINDOW_START = Date.parse('2026-11-10T12:00:00Z');

  it('filters to CI / Source Validation BEFORE the run cap, trigger first', () => {
    const trigger = listed({
      id: 1,
      name: 'CI',
      created_at: '2026-11-10T12:05:00Z',
    });
    const noise = Array.from({ length: 25 }, (_, i) =>
      listed({
        id: 100 + i,
        name: 'Shipping SLO',
        created_at: '2026-11-10T12:08:00Z',
      })
    );
    const ci = Array.from({ length: 25 }, (_, i) =>
      listed({
        id: 200 + i,
        name: 'Source Validation',
        created_at: '2026-11-10T12:09:00Z',
      })
    );
    expect(isBackfillRun(trigger)).toBe(true);
    expect(isBackfillRun(noise[0])).toBe(false);
    const selected = selectBackfillRuns({
      triggerRun: trigger,
      listedRuns: [...noise, ...ci],
      windowStartMs: WINDOW_START,
    });
    expect(selected).toHaveLength(CAPS.maxBackfillRuns);
    expect(selected[0].id).toBe(1); // triggering run reserved first
    expect(selected.every(run => isBackfillRun(run))).toBe(true);
  });

  it('admits a long-running run finished inside the window via updated_at', () => {
    const longRunning = listed({
      id: 7,
      name: 'CI',
      created_at: '2026-11-10T10:00:00Z', // created before the window
      updated_at: '2026-11-10T12:10:00Z', // finished inside it
    });
    const stale = listed({
      id: 8,
      name: 'CI',
      created_at: '2026-11-10T09:00:00Z',
      updated_at: '2026-11-10T11:00:00Z', // finished before the window
    });
    const selected = selectBackfillRuns({
      triggerRun: null,
      listedRuns: [longRunning, stale],
      windowStartMs: WINDOW_START,
    });
    expect(selected.map(run => run.id)).toEqual([7]);
  });

  it('keys by (run_id, run_attempt) so a rerun cannot displace the trigger', () => {
    const trigger = listed({
      id: 1,
      name: 'CI',
      created_at: '2026-11-10T12:05:00Z',
    });
    const sameRunNewAttempt = { ...trigger, run_attempt: 2 };
    const selected = selectBackfillRuns({
      triggerRun: trigger,
      listedRuns: [sameRunNewAttempt],
      windowStartMs: WINDOW_START,
    });
    expect(selected).toHaveLength(2);
    expect(selected[0].run_attempt).toBe(1);
    expect(selected[1].run_attempt).toBe(2);
  });
});
