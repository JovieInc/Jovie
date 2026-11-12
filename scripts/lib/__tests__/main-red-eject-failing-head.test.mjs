import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = [];
let routes = {};
vi.mock('../../../packages/api-client/gh.ts', () => ({
  runGh: vi.fn(async args => {
    const line = args.join(' ');
    calls.push(line);
    const hit = Object.entries(routes).find(([k]) => line.includes(k));
    if (!hit) throw new Error(`unrouted gh call: ${line}`);
    return { code: 0, stdout: JSON.stringify(hit[1]), stderr: '' };
  }),
}));
const dequeuePullRequest = vi.fn(async () => ({ ok: true }));
vi.mock('../../merge-queue-backend.mjs', () => ({ dequeuePullRequest }));

const { stuckHead } = await import('../../main-red-eject.mjs');
const {
  decideFailingHead,
  failingHeadComment,
  failingRequiredChecks,
  marker,
  supersededIncidents,
} = await import('../main-red-eject.mjs');

const run = (id, name, conclusion) => ({ id, name, conclusion });
const queue = (state, sha = 'abc123', dwellMin = 10) => ({
  data: {
    repository: {
      mergeQueue: {
        entries: {
          nodes: [
            {
              position: 1,
              state,
              enqueuedAt: new Date(
                Date.now() - dwellMin * 60_000
              ).toISOString(),
              headCommit: sha ? { oid: sha } : null,
              pullRequest: { number: 23966, labels: { nodes: [] } },
            },
          ],
        },
      },
    },
  },
});
const mainCi = conclusion => ({
  workflow_runs: [{ status: 'completed', conclusion }],
});
const writes = () => calls.filter(c => /-X POST|workflow run/.test(c));

beforeEach(() => {
  calls.length = 0;
  dequeuePullRequest.mockClear();
  routes = {};
});

describe('failingRequiredChecks', () => {
  it('names required checks whose latest run failed, ignoring others and old reruns', () => {
    expect(
      failingRequiredChecks([
        run(1, 'PR Ready', 'failure'),
        run(2, 'PR Ready', 'success'),
        run(3, 'Migration Guard', 'failure'),
        run(4, 'ci-fast (structural web)', 'failure'),
        run(5, 'Knip (dead code)', 'failure'),
        run(6, 'Fork PR Gate', 'success'),
        run(7, 'ci-fast (typecheck)', 'in_progress'),
      ])
    ).toEqual(['Migration Guard', 'ci-fast (structural web)']);
  });
});

describe('decideFailingHead', () => {
  const head = { number: 1, position: 1, state: 'AWAITING_CHECKS' };
  it('dequeues only for a failed required check with green main', () => {
    expect(
      decideFailingHead({ head, failing: ['PR Ready'], mainGreen: true })
        .dequeue
    ).toBe(true);
    expect(
      decideFailingHead({ head, failing: ['PR Ready'], mainGreen: false })
    ).toEqual({ dequeue: false, reason: 'main-not-green' });
    expect(
      decideFailingHead({ head, failing: [], mainGreen: true }).dequeue
    ).toBe(false);
    expect(
      decideFailingHead({ head: null, failing: ['x'], mainGreen: true }).dequeue
    ).toBe(false);
  });
  it('names every failing check in the comment', () => {
    const body = failingHeadComment({ sha: 'abc' }, [
      'PR Ready',
      'Migration Guard',
    ]);
    expect(body).toContain('`PR Ready`');
    expect(body).toContain('`Migration Guard`');
  });
});

describe('stuckHead failing-head pass', () => {
  const wire = ({
    state = 'AWAITING_CHECKS',
    checks,
    main = 'success',
    sha,
  }) => {
    routes = {
      'api graphql': queue(state, sha),
      'check-runs': { check_runs: checks },
      'branch=main&event=push': mainCi(main),
      'issues/23966/comments': {},
    };
  };

  it('dequeues, comments with the failing checks, and never enqueues or dispatches', async () => {
    wire({ checks: [run(1, 'PR Ready', 'failure')], sha: 'abc123' });
    const out = await stuckHead({ doApply: true });
    expect(out).toMatchObject({ failingHead: true, dequeued: true });
    expect(dequeuePullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ number: 23966 })
    );
    const posted = writes();
    expect(posted).toHaveLength(1);
    expect(posted[0]).toContain('issues/23966/comments');
    expect(posted[0]).toContain('PR Ready');
    expect(
      calls.some(c => /workflow run|enqueuePullRequest|jump/i.test(c))
    ).toBe(false);
  });

  it('leaves the head when main is not green', async () => {
    wire({
      checks: [run(1, 'PR Ready', 'failure')],
      main: 'failure',
      sha: 'abc123',
    });
    const out = await stuckHead({ doApply: true });
    expect(out).toMatchObject({ failingHead: true, dequeue: false });
    expect(dequeuePullRequest).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });

  it('leaves a head with no failed required check, without reading main CI', async () => {
    wire({ checks: [run(1, 'PR Ready', 'in_progress')], sha: 'abc123' });
    await stuckHead({ doApply: true });
    expect(dequeuePullRequest).not.toHaveBeenCalled();
    expect(calls.some(c => c.includes('event=push'))).toBe(false);
  });

  it('does nothing in dry mode', async () => {
    wire({ checks: [run(1, 'PR Ready', 'failure')], sha: 'abc123' });
    const out = await stuckHead({ doApply: false });
    expect(out).toMatchObject({ dequeue: true });
    expect(dequeuePullRequest).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });

  it('skips the check read while the head has no merge-group commit yet', async () => {
    wire({ checks: [], sha: null });
    await stuckHead({ doApply: true });
    expect(calls.some(c => c.includes('check-runs'))).toBe(false);
  });
});

describe('stale queue-head-stuck alerts', () => {
  const alert = (number, key) => ({
    number,
    body: `${marker({ key })}\nstuck`,
  });
  it('picks only other heads in the same alert family', () => {
    const found = [
      alert(1, 'queue-head-stuck:100'),
      alert(2, 'queue-head-stuck:23966'),
      alert(3, 'eject:abc'),
      { number: 4, body: 'no marker' },
    ];
    expect(supersededIncidents(found, 'queue-head-stuck:23966')).toEqual([
      found[0],
    ]);
    expect(supersededIncidents(found, 'eject:abc')).toEqual([]);
  });

  it('closes older heads alerts when a new head alerts, and keeps its own', async () => {
    routes = {
      'api graphql': queue('AWAITING_CHECKS', 'abc123', 60),
      'check-runs': { check_runs: [] },
      'labels=main-health-incident': [
        alert(24100, 'queue-head-stuck:24099'),
        alert(24200, 'queue-head-stuck:23966'),
        alert(24300, 'eject:abc'),
      ],
      '-X PATCH': {},
      '-X POST': {},
    };
    await stuckHead({ doApply: true });
    const closes = calls.filter(c => c.includes('-X PATCH'));
    expect(closes).toHaveLength(1);
    expect(closes[0]).toContain('issues/24100');
    expect(closes[0]).toContain('state=closed');
    // The current head's own alert gets a comment, not a duplicate issue.
    expect(calls.some(c => c.includes('issues/24200/comments'))).toBe(true);
    expect(calls.some(c => c.includes('title=queue head'))).toBe(false);
  });
});

describe('wake fan-out wiring (2026-10-31 installation 112037986 exhaustion)', () => {
  const wf = n =>
    readFileSync(
      new URL(`../../../.github/workflows/${n}`, import.meta.url),
      'utf8'
    );
  it('gates Main Red Eject before the ejector and reads on the Jovie Bot read token', () => {
    const t = wf('main-red-eject.yml');
    const gate = t.indexOf('  gate:');
    const eject = t.indexOf('  eject:');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(eject);
    // 2026-11-12: the gate's reads moved off the shared ~1,000 REST/h job
    // GITHUB_TOKEN bucket onto the Jovie Bot installation's own quota (the
    // 2026-10-13 Lane Fix Relay split; the shared bucket ran dry within 45
    // minutes while Linear Sync deferred behind it). The mint is read-only
    // and the gate still fails open through the github.token failover.
    expect(t.slice(gate, eject)).toContain('create-github-app-token');
    expect(t.slice(gate, eject)).toContain('permission-checks: read');
    expect(t.slice(gate, eject)).toContain(
      'GH_TOKEN: ${{ steps.read-token.outputs.token || github.token }}'
    );
    expect(t).toContain("needs.gate.outputs.active == 'true'");
    expect(t).toContain('queue-read-failed'); // fails open
  });
  it.each([
    ['dependabot-pin-sync.yml', "branches: ['dependabot/npm_and_yarn/**']"],
    [
      'auto-ready-agent-drafts.yml',
      "branches-ignore: [main, 'gh-readonly-queue/**']",
    ],
    ['fleet-rules-evidence.yml', "branches-ignore: ['gh-readonly-queue/**']"],
    ['lane-fix-relay.yml', "branches-ignore: ['gh-readonly-queue/**']"],
  ])('%s filters wakes by head branch', (file, line) => {
    expect(wf(file)).toContain(line);
  });
  it('leaves the green-enroll jump workflow untouched', () => {
    expect(wf('merge-queue-green-enroll.yml')).not.toContain('branches-ignore');
  });
});
