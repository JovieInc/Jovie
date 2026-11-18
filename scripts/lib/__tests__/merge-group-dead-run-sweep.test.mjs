import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  coreQuotaDefersCancels,
  MAX_CANCELS,
  MIN_CORE_REMAINING,
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

  const HEALTHY_QUOTA = {
    resources: { core: { remaining: 5000, limit: 5000 } },
  };

  /** @param {{ runs?: any, refs?: string[] | null, commits?: any, cancelOk?: boolean, quota?: any }} [opts] */
  function fakeIo({
    runs = { workflow_runs: [run(1, DEAD), run(2, LIVE)] },
    refs = [ref(LIVE)],
    commits = [{ sha: sha('9') }],
    cancelOk = true,
    quota = HEALTHY_QUOTA,
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
      actionsCoreQuota() {
        calls.push('quota-probe');
        return quota;
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
      'quota-probe',
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

  it('defers the cancel loop when the core bucket cannot cover it plus the reserve', () => {
    const io = fakeIo({
      quota: { resources: { core: { remaining: 2, limit: 5000 } } },
    });
    const notices = [];
    expect(main(env, io, (level, m) => notices.push(`${level}:${m}`))).toEqual({
      cancelled: [],
    });
    expect(io.calls).toContain('quota-probe');
    expect(io.calls.some(c => c.startsWith('CANCEL'))).toBe(false);
    expect(notices.some(n => n.includes('github-quota-deferred'))).toBe(true);
  });

  it('cancels at the exact boundary and defers one call below it', () => {
    // One dead run: remaining = 1 + MIN_CORE_REMAINING proceeds.
    const enough = fakeIo({
      quota: {
        resources: { core: { remaining: 1 + MIN_CORE_REMAINING, limit: 5000 } },
      },
    });
    expect(main(env, enough, quiet)).toEqual({ cancelled: [1] });
    const short = fakeIo({
      quota: {
        resources: { core: { remaining: MIN_CORE_REMAINING, limit: 5000 } },
      },
    });
    expect(main(env, short, quiet)).toEqual({ cancelled: [] });
    expect(short.calls.some(c => c.startsWith('CANCEL'))).toBe(false);
  });

  it('cancels nothing when the quota probe itself fails', () => {
    const io = fakeIo({ quota: null });
    expect(main(env, io, quiet)).toEqual({ cancelled: [] });
    expect(io.calls.some(c => c.startsWith('CANCEL'))).toBe(false);
  });

  it('never probes when nothing is dead', () => {
    const io = fakeIo({
      runs: { workflow_runs: [run(2, LIVE)] },
    });
    expect(main(env, io, quiet)).toEqual({ cancelled: [] });
    expect(io.calls).not.toContain('quota-probe');
  });
});

describe('coreQuotaDefersCancels', () => {
  it('defers on an unreadable probe, at the floor, and not above it', () => {
    expect(coreQuotaDefersCancels(null, 1)).toBe(true);
    expect(coreQuotaDefersCancels({}, 1)).toBe(true);
    const quota = remaining => ({ resources: { core: { remaining } } });
    expect(coreQuotaDefersCancels(quota(MIN_CORE_REMAINING), 1)).toBe(true);
    expect(coreQuotaDefersCancels(quota(1 + MIN_CORE_REMAINING), 1)).toBe(
      false
    );
    expect(coreQuotaDefersCancels(quota(0), 100)).toBe(true);
    expect(coreQuotaDefersCancels(quota(5000), 100)).toBe(false);
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
