import { describe, expect, it } from 'vitest';
import {
  applySweep,
  latestVerdicts,
  planSweep,
  REFILE_MS,
  readMainRuns,
  workflowFile,
} from '../outcome-sweep.mjs';

const NOW = Date.parse('2026-11-22T10:00:00Z');
const run = (id, file, conclusion, extra = {}) => ({
  id,
  path: `.github/workflows/${file}@refs/heads/main`,
  conclusion,
  head_branch: 'main',
  event: 'schedule',
  created_at: new Date(NOW - id * 60_000).toISOString(),
  html_url: `https://github.com/o/r/actions/runs/${id}`,
  head_sha: 'abcdef1234',
  ...extra,
});

describe('latestVerdicts', () => {
  it('takes the newest conclusive main run per swept workflow', () => {
    const runs = [
      run(3, 'a.yml', 'success'),
      run(1, 'a.yml', 'cancelled'),
      run(2, 'b.yml', 'skipped'),
      run(4, 'b.yml', 'timed_out'),
      run(5, 'c.yml', 'failure'),
      run(6, 'a.yml', 'failure', { event: 'pull_request' }),
    ];
    const verdicts = latestVerdicts(runs, ['a.yml', 'b.yml']);
    expect(verdicts.get('a.yml')?.run.id).toBe(3);
    expect(verdicts.get('a.yml')?.verdict).toBe('green');
    expect(verdicts.get('b.yml')?.verdict).toBe('red');
    expect(verdicts.has('c.yml')).toBe(false);
  });

  it('reads the file from a run path', () => {
    expect(workflowFile('.github/workflows/x.yml@refs/heads/main')).toBe(
      'x.yml'
    );
  });
});

describe('planSweep', () => {
  const verdicts = entries => new Map(entries);

  it('files a new red and resolves the first green after it', () => {
    const red = planSweep({
      verdicts: verdicts([
        ['a.yml', { verdict: 'red', run: run(1, 'a.yml', 'failure') }],
      ]),
      state: {},
      nowMs: NOW,
    });
    expect(red.decisions.map(d => d.action)).toEqual(['red']);
    const green = planSweep({
      verdicts: verdicts([
        ['a.yml', { verdict: 'green', run: run(2, 'a.yml', 'success') }],
      ]),
      state: red.next,
      nowMs: NOW + 1000,
    });
    expect(green.decisions.map(d => d.action)).toEqual(['green']);
    expect(green.next['a.yml'].state).toBe('green');
  });

  it('does not refile a steady red inside the refile window, then refiles', () => {
    const state = { 'a.yml': { state: 'red', at: NOW, runId: 1 } };
    const v = verdicts([
      ['a.yml', { verdict: 'red', run: run(2, 'a.yml', 'failure') }],
    ]);
    expect(
      planSweep({ verdicts: v, state, nowMs: NOW + 60_000 }).decisions
    ).toEqual([]);
    expect(
      planSweep({ verdicts: v, state, nowMs: NOW + REFILE_MS }).decisions.map(
        d => d.action
      )
    ).toEqual(['red']);
  });

  it('skips a run it already handled and stays quiet on steady green', () => {
    const state = {
      'a.yml': { state: 'red', at: 0, runId: 1 },
      'b.yml': { state: 'green', at: 0, runId: 7 },
    };
    const v = verdicts([
      ['a.yml', { verdict: 'red', run: run(1, 'a.yml', 'failure') }],
      ['b.yml', { verdict: 'green', run: run(8, 'b.yml', 'success') }],
    ]);
    expect(planSweep({ verdicts: v, state, nowMs: NOW }).decisions).toEqual([]);
  });

  it('treats lost state as red so a green resolves a stranded issue', () => {
    const v = verdicts([
      ['a.yml', { verdict: 'green', run: run(1, 'a.yml', 'success') }],
    ]);
    expect(
      planSweep({ verdicts: v, state: null, nowMs: NOW }).decisions.map(
        d => d.action
      )
    ).toEqual(['green']);
  });
});

describe('readMainRuns', () => {
  it('pages until the window is covered and stops on an unreadable page', async () => {
    const urls = [];
    const page = n =>
      Array.from({ length: 100 }, (_, i) =>
        run(n * 100 + i, 'a.yml', 'success', {
          created_at: new Date(
            NOW - (n - 1) * 20 * 60_000 - i * 1000
          ).toISOString(),
        })
      );
    const fetchImpl = async url => {
      urls.push(url);
      const n = Number(new URL(url).searchParams.get('page'));
      return new Response(JSON.stringify({ workflow_runs: page(n) }), {
        status: 200,
      });
    };
    const read = await readMainRuns({
      repo: 'o/r',
      token: 't',
      fetchImpl,
      nowMs: NOW,
    });
    expect(read.ok).toBe(true);
    expect(urls.length).toBe(3);
    const denied = await readMainRuns({
      repo: 'o/r',
      token: '',
      fetchImpl: async () => new Response('{}', { status: 500 }),
      nowMs: NOW,
    });
    expect(denied.ok).toBe(false);
  });
});

describe('applySweep', () => {
  it('keeps the previous record when filing fails so the next bucket retries', async () => {
    const fetchImpl = async () => new Response('{}', { status: 500 });
    const previous = { 'a.yml': { state: 'green', at: 0, runId: 1 } };
    const state = await applySweep({
      decisions: [
        { file: 'a.yml', action: 'red', run: run(2, 'a.yml', 'failure') },
      ],
      next: { 'a.yml': { state: 'red', at: NOW, runId: 2 } },
      previous,
      apiKey: '',
      fetchImpl,
    });
    expect(state['a.yml']).toEqual(previous['a.yml']);
  });
});
