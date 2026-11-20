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
const { marker, supersededIncidents } = await import('../main-red-eject.mjs');
const {
  applyFailingHeadEpisode,
  decideFailingHead,
  ejectHoldSha,
  failingHeadComment,
  failingRequiredChecks,
} = await import('../main-red-eject-failing-head.mjs');

const MERGE_GROUP_SHA = 'mgdeadbeef01';
const PR_HEAD_SHA = 'prcafe012345';

const run = (id, name, conclusion) => ({ id, name, conclusion });
const queue = (
  state,
  sha = MERGE_GROUP_SHA,
  dwellMin = 10,
  headRefOid = PR_HEAD_SHA
) => ({
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
              pullRequest: {
                number: 23966,
                headRefOid: headRefOid ?? null,
                labels: { nodes: [] },
              },
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
    const body = failingHeadComment({ headRefOid: 'abc' }, [
      'PR Ready',
      'Migration Guard',
    ]);
    expect(body).toContain('`PR Ready`');
    expect(body).toContain('`Migration Guard`');
    expect(body).toContain('will not re-enter the queue');
    expect(body).toContain('lane-fix-red');
    expect(body).not.toContain('re-admits it when checks pass');
  });

  it('does not claim lane-fix-red when label apply failed', () => {
    const body = failingHeadComment({ headRefOid: 'abc' }, ['PR Ready'], {
      labeled: false,
    });
    expect(body).toContain('JOV-6620');
    expect(body).toContain('repair-label apply failed');
    expect(body).not.toContain('`lane-fix-red` keeps');
  });

  it('holds on PR headRefOid, never the merge-group synthetic sha', () => {
    expect(
      ejectHoldSha({ sha: MERGE_GROUP_SHA, headRefOid: PR_HEAD_SHA })
    ).toBe(PR_HEAD_SHA);
    expect(ejectHoldSha({ sha: MERGE_GROUP_SHA })).toBe(null);
  });

  it('undoes lane-fix-red when eject-hold status write fails', async () => {
    const ghCalls = [];
    const gh = async args => {
      const line = args.join(' ');
      ghCalls.push(line);
      // Path is repos/.../statuses/<sha>, not a bare statuses/<sha> argv.
      if (line.includes(`statuses/${PR_HEAD_SHA}`)) {
        throw new Error(
          'gh api -X POST: HTTP 403: Resource not accessible by integration'
        );
      }
    };
    const out = await applyFailingHeadEpisode({
      gh,
      repo: 'JovieInc/Jovie',
      head: { number: 23966, sha: MERGE_GROUP_SHA, headRefOid: PR_HEAD_SHA },
      failing: ['PR Ready'],
    });
    expect(out).toEqual({ labeled: false, held: false });
    expect(ghCalls.some(c => c.includes('labels[]=lane-fix-red'))).toBe(true);
    expect(
      ghCalls.some(c => c.includes('DELETE') && c.includes('lane-fix-red'))
    ).toBe(true);
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

  it('dequeues, labels lane-fix-red, stamps eject-hold on PR tip, comments, and never enqueues or dispatches', async () => {
    wire({ checks: [run(1, 'PR Ready', 'failure')], sha: MERGE_GROUP_SHA });
    routes['issues/23966/labels'] = {};
    routes[`statuses/${PR_HEAD_SHA}`] = {};
    const out = await stuckHead({ doApply: true });
    expect(out).toMatchObject({ failingHead: true, dequeued: true });
    expect(dequeuePullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ number: 23966 })
    );
    const posted = writes();
    expect(posted).toHaveLength(3);
    expect(posted.some(c => c.includes('issues/23966/labels'))).toBe(true);
    expect(posted.some(c => c.includes('labels[]=lane-fix-red'))).toBe(true);
    // Sentry HIGH: status must hit PR headRefOid, not merge-group headCommit.
    expect(posted.some(c => c.includes(`statuses/${PR_HEAD_SHA}`))).toBe(true);
    expect(posted.some(c => c.includes(`statuses/${MERGE_GROUP_SHA}`))).toBe(
      false
    );
    expect(
      posted.some(c => c.includes('jovie-merge-group-eject-hold/v1'))
    ).toBe(true);
    expect(posted.some(c => c.includes('issues/23966/comments'))).toBe(true);
    expect(posted.find(c => c.includes('comments'))).toContain('PR Ready');
    expect(
      calls.some(c => c.includes('check-runs') && c.includes(MERGE_GROUP_SHA))
    ).toBe(true);
    expect(
      calls.some(c => /workflow run|enqueuePullRequest|jump/i.test(c))
    ).toBe(false);
  });

  it('leaves the head when main is not green', async () => {
    wire({
      checks: [run(1, 'PR Ready', 'failure')],
      main: 'failure',
      sha: MERGE_GROUP_SHA,
    });
    const out = await stuckHead({ doApply: true });
    expect(out).toMatchObject({ failingHead: true, dequeue: false });
    expect(dequeuePullRequest).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });

  it('leaves a head with no failed required check, without reading main CI', async () => {
    wire({ checks: [run(1, 'PR Ready', 'in_progress')], sha: MERGE_GROUP_SHA });
    await stuckHead({ doApply: true });
    expect(dequeuePullRequest).not.toHaveBeenCalled();
    expect(calls.some(c => c.includes('event=push'))).toBe(false);
  });

  it('does nothing in dry mode', async () => {
    wire({ checks: [run(1, 'PR Ready', 'failure')], sha: MERGE_GROUP_SHA });
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
      'api graphql': queue('AWAITING_CHECKS', MERGE_GROUP_SHA, 60),
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
  it('gates Main Red Eject before checkout and the app-token mint', () => {
    const t = wf('main-red-eject.yml');
    const gate = t.indexOf('  gate:');
    const eject = t.indexOf('  eject:');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(eject);
    expect(t.slice(gate, eject)).not.toContain('create-github-app-token');
    expect(t.slice(gate, eject)).toContain('GH_TOKEN: ${{ github.token }}');
    expect(t).toContain("needs.gate.outputs.active == 'true'");
    expect(t).toContain('queue-read-failed'); // fails open
  });

  it('grants statuses:write so GITHUB_TOKEN failover can stamp eject holds', () => {
    const t = wf('main-red-eject.yml');
    const ejectPerms = t.slice(t.indexOf('  eject:'), t.indexOf('  land:'));
    expect(ejectPerms).toContain('statuses: write');
    expect(ejectPerms).toContain('GH_FALLBACK_TOKEN: ${{ github.token }}');
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
