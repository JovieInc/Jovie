import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  MAX_CANCELS,
  main,
  parseLsRemote,
  planDeadRunCancels,
} from '../../merge-group-dead-run-sweep.mjs';

const { load } = createRequire(import.meta.url)('js-yaml');
const REPO = 'JovieInc/Jovie';
const sha = digit => digit.repeat(40);
const branch = (pr, digit) => `gh-readonly-queue/main/pr-${pr}-${sha(digit)}`;
const ref = name => `refs/heads/${name}`;
const run = (id, headBranch, overrides = {}) => ({
  id,
  name: 'CI',
  event: 'merge_group',
  status: 'in_progress',
  head_branch: headBranch,
  head_sha: headBranch.slice(-40),
  ...overrides,
});

describe('planDeadRunCancels', () => {
  const LIVE = branch('101', '1');
  const LANDED = branch('102', '2');
  const RUNS = [
    run(1, LIVE), // live group: keep
    run(2, LIVE, { name: 'Company Guards', status: 'queued' }), // live: keep
    run(3, LANDED), // ref gone but its SHA is on main: keep
    run(4, branch('103', '3')), // dead CI run: cancel
    run(5, branch('103', '3'), {
      name: 'Private Data Guard',
      status: 'queued',
    }),
    run(6, branch('104', '4'), { name: 'PR Size Guard', status: 'pending' }),
    run(7, branch('105', '5'), { status: 'completed' }), // finished: keep
    run(8, branch('106', '6'), { event: 'push' }), // not a merge group: keep
    run(9, `gh-readonly-queue/release/pr-107-${sha('7')}`), // other base: keep
    run(10, 'feature/x'), // not a queue ref: keep
    run(4, branch('103', '3')), // duplicate page entry: once
    run(11, branch('108', '8'), { status: 'waiting' }), // unknown status: keep
  ];

  it('cancels unfinished runs of every workflow whose queue ref is gone', () => {
    const plan = planDeadRunCancels({
      runs: RUNS,
      liveRefs: [ref(LIVE)],
      mainShas: [sha('2')],
    });
    expect(plan.cancel).toEqual([
      { id: 4, branch: branch('103', '3'), workflow: 'CI' },
      { id: 5, branch: branch('103', '3'), workflow: 'Private Data Guard' },
      { id: 6, branch: branch('104', '4'), workflow: 'PR Size Guard' },
    ]);
    expect(plan.live).toBe(2);
    expect(plan.landed).toBe(1);
  });

  it('never cancels a run whose ref git still lists', () => {
    const plan = planDeadRunCancels({
      runs: RUNS,
      liveRefs: RUNS.map(r => ref(String(r.head_branch))),
      mainShas: [],
    });
    expect(plan.cancel).toEqual([]);
  });

  it('matches the live ref exactly, not by PR number prefix', () => {
    const plan = planDeadRunCancels({
      runs: [run(1, branch('2054', '1'))],
      liveRefs: [ref(branch('20546', '1'))],
      mainShas: [],
    });
    expect(plan.cancel.map(c => c.id)).toEqual([1]);
  });

  it('caps the cancels per sweep', () => {
    const many = Array.from({ length: MAX_CANCELS + 5 }, (_, i) =>
      run(i + 1, branch(String(1000 + i), 'a'))
    );
    const plan = planDeadRunCancels({ runs: many, liveRefs: [], mainShas: [] });
    expect(plan.cancel).toHaveLength(MAX_CANCELS);
  });
});

describe('parseLsRemote', () => {
  it('keeps ref names and drops noise', () => {
    expect(
      parseLsRemote(
        `${sha('f')}\trefs/heads/${branch('1', '1')}\n\nwarning: x\n`
      )
    ).toEqual([ref(branch('1', '1'))]);
  });
});

describe('main', () => {
  const DEAD = branch('201', '1');
  const LIVE = branch('202', '2');
  const env = {
    READ_TOKEN: 'app-read-token',
    CANCEL_TOKEN: 'github-token',
    REPOSITORY: REPO,
  };

  /** @param {{ runs?: any, refs?: string[] | null, commits?: any, cancelOk?: boolean }} [opts] */
  function fakeIo({
    runs = { workflow_runs: [run(1, DEAD), run(2, LIVE)] },
    refs = [ref(LIVE)],
    commits = [{ sha: sha('9') }],
    cancelOk = true,
  } = {}) {
    const calls = [];
    return {
      calls,
      read(path) {
        calls.push(`GET ${path}`);
        return path.includes('/commits?') ? commits : runs;
      },
      liveRefs() {
        calls.push('ls-remote');
        return refs;
      },
      cancel(id) {
        calls.push(`CANCEL ${id}`);
        return cancelOk;
      },
    };
  }
  const quiet = () => {};

  it('reads runs, then refs, then main, then cancels only the dead run', () => {
    const io = fakeIo();
    expect(main(env, io, quiet)).toEqual({ cancelled: [1] });
    const list = status =>
      `GET repos/${REPO}/actions/runs?event=merge_group&status=${status}&per_page=100&page=1`;
    expect(io.calls).toEqual([
      list('queued'),
      list('pending'),
      list('in_progress'),
      'ls-remote',
      `GET repos/${REPO}/commits?sha=main&per_page=100`,
      'CANCEL 1',
    ]);
  });

  it('pages a full listing', () => {
    const full = {
      workflow_runs: Array.from({ length: 100 }, (_, i) => run(i + 10, LIVE)),
    };
    const io = fakeIo({ runs: full });
    main(env, io, quiet);
    expect(io.calls.filter(c => c.includes('status=queued'))).toHaveLength(5);
  });

  it.each([
    ['the run listing', { runs: null }],
    ['the live refs', { refs: null }],
    ['recent main', { commits: { message: 'API rate limit exceeded' } }],
  ])('cancels nothing when %s cannot be read', (_, opts) => {
    const io = fakeIo(opts);
    const warnings = [];
    expect(main(env, io, (level, m) => warnings.push(`${level}:${m}`))).toEqual(
      { cancelled: [] }
    );
    expect(io.calls.some(c => c.startsWith('CANCEL'))).toBe(false);
    expect(warnings.some(w => w.startsWith('warning:'))).toBe(true);
  });

  it('makes no call without a read token', () => {
    const io = fakeIo();
    expect(main({ ...env, READ_TOKEN: '' }, io, quiet)).toEqual({
      cancelled: [],
    });
    expect(io.calls).toEqual([]);
  });

  it('reports a failed cancel without counting it', () => {
    const io = fakeIo({ cancelOk: false });
    expect(main(env, io, quiet)).toEqual({ cancelled: [] });
  });
});

describe('Merge Group Dead Run Sweep workflow', () => {
  const source = readFileSync(
    new URL(
      '../../../.github/workflows/merge-group-dead-run-sweep.yml',
      import.meta.url
    ),
    'utf8'
  );
  const workflow = load(source);
  const job = workflow.jobs.sweep;

  it('wakes on every dequeue and coalesces a storm without cancelling', () => {
    expect(workflow.on.pull_request_target.types).toEqual(['dequeued']);
    expect(workflow.permissions).toEqual({});
    expect(workflow.concurrency['cancel-in-progress']).toBe(false);
    expect(job['timeout-minutes']).toBeLessThanOrEqual(3);
    expect(job.permissions).toEqual({ actions: 'write', contents: 'read' });
  });

  it('reads on the Jovie Bot token and cancels on GITHUB_TOKEN', () => {
    const mint = job.steps.find(s => s.id === 'app-token');
    expect(mint.uses).toMatch(
      /^actions\/create-github-app-token@[0-9a-f]{40}$/
    );
    expect(mint['continue-on-error']).toBeUndefined();
    expect(mint.with['permission-actions']).toBe('read');
    expect(mint.with['permission-contents']).toBe('read');
    const sweep = job.steps.find(s => s.run?.includes('dead-run-sweep.mjs'));
    expect(sweep.env.READ_TOKEN).toBe('${{ steps.app-token.outputs.token }}');
    expect(sweep.env.CANCEL_TOKEN).toBe('${{ github.token }}');
    expect(sweep.run).not.toMatch(/\bsleep\b|\bwhile\b|\buntil\b/);
  });

  it('runs trusted main code only', () => {
    const checkout = job.steps.find(s =>
      s.uses?.startsWith('actions/checkout')
    );
    expect(checkout.with.ref).toBe('main');
    expect(checkout.with['persist-credentials']).toBe(false);
    expect(checkout.with['sparse-checkout']).toContain(
      'scripts/merge-group-dead-run-sweep.mjs'
    );
  });
});
