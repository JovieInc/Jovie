// Red main with nothing to revert (2026-11-10, JOV-8737): a test expired by the clock
// on an unchanged main and failed every merge group from 20:11Z to 04:13Z. plan()
// returned `none` ("failures-do-not-share-a-signature", job 130279777690) or an alert
// nobody acted on. Both shapes now page and file a remediation intake.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = [];
let routes = [];
vi.mock('../../../packages/api-client/gh.ts', () => ({
  runGh: vi.fn(async args => {
    const line = args.join(' ');
    calls.push(line);
    const hit = routes.find(([k]) => line.includes(k));
    if (!hit) throw new Error(`unrouted gh call: ${line}`);
    const body = typeof hit[1] === 'function' ? hit[1](line) : hit[1];
    return {
      code: 0,
      stdout: typeof body === 'string' ? body : JSON.stringify(body),
      stderr: '',
    };
  }),
}));

const eject = await import('../../main-red-eject.mjs');
const { apply } = eject;
/** plan() returns a union of result shapes; these cases read the decided one. @returns {Promise<any>} */
const plan = options => eject.plan(options);
const { detectUnattributedRed, groupPr, INTAKE_LABEL, remediationIntake } =
  await import('../main-red-eject.mjs');

const NOW = Date.parse('2026-11-11T02:00:00Z');
const group = (id, pr, conclusion = 'failure') => ({
  id,
  conclusion,
  created_at: '2026-11-10T21:00:00Z',
  head_sha: `sha${id}`,
  head_branch: `gh-readonly-queue/main/pr-${pr}-abc${id}`,
});
// Newest first: five groups of five PRs, all red, then the last green one.
const RUNS = [
  group(906, 24811),
  group(905, 24805),
  group(904, 24801),
  group(903, 24795),
  group(902, 24790),
  group(901, 24780, 'success'),
];
const TIME_BOMB =
  ' FAIL  |workspace-scripts| lib/__tests__/production-release-supersession.test.mjs > review deadline\n';
const posts = () => calls.filter(c => c.includes('-X POST'));
const world = ({ log, intakes = [] }) => [
  [
    'runs?event=merge_group&status=completed&per_page=100&page=1',
    { workflow_runs: RUNS },
  ],
  ['runs?event=merge_group&status=completed', { workflow_runs: [] }],
  [
    '/jobs?per_page=100',
    { jobs: [{ id: 1, name: 'ci-fast (remaining)', conclusion: 'failure' }] },
  ],
  ['/actions/jobs/1/logs', log],
  // Unchanged main: every commit's own merge group was green.
  [
    'commits?sha=main',
    [1, 2, 3].map(n => ({
      sha: `main${n}`,
      commit: {
        message: `feat: change ${n} (#${24700 + n})`,
        committer: { date: '2026-11-10T19:00:00Z' },
      },
      author: { login: 'jovie-bot' },
    })),
  ],
  [
    'runs?event=merge_group&head_sha=',
    {
      workflow_runs: [
        {
          id: 1,
          status: 'completed',
          conclusion: 'success',
          created_at: '2026-11-10T19:00:00Z',
          head_branch: 'x',
        },
      ],
    },
  ],
  ['pulls?state=open', []],
  [`issues?state=open&labels=main-health-incident`, []],
  [`issues?state=open&labels=${INTAKE_LABEL}`, intakes],
  [
    '-X POST repos/JovieInc/Jovie/issues',
    line => ({ number: line.includes(`labels[]=${INTAKE_LABEL}`) ? 902 : 901 }),
  ],
];

beforeEach(() => {
  calls.length = 0;
  routes = [];
});

describe('detectUnattributedRed', () => {
  const row = (id, pr, conclusion = 'failure') => ({
    id,
    conclusion,
    branch: `gh-readonly-queue/main/pr-${pr}-x`,
  });
  it('needs the newest three decided groups red on three different PRs', () => {
    expect(groupPr('gh-readonly-queue/main/pr-24811-abc')).toBe(24811);
    expect(groupPr('main')).toBeNull();
    expect(
      detectUnattributedRed([
        row(3, 30),
        row(2, 20),
        row(9, 9, 'cancelled'),
        row(1, 10),
      ])
    ).toEqual({
      triggered: true,
      groups: [3, 2, 1],
      prs: [30, 20, 10],
    });
  });
  it('leaves one PR failing its own groups, and a streak broken by a green group, alone', () => {
    expect(
      detectUnattributedRed([row(3, 10), row(2, 10), row(1, 10)]).triggered
    ).toBe(false);
    expect(
      detectUnattributedRed([
        row(4, 40),
        row(3, 30),
        row(2, 20, 'success'),
        row(1, 10),
      ]).triggered
    ).toBe(false);
  });
  it('counts PRs in the newest three only: one PR failing three times is its own problem', () => {
    expect(
      detectUnattributedRed([
        row(5, 10),
        row(4, 10),
        row(3, 10),
        row(2, 20),
        row(1, 30),
      ]).triggered
    ).toBe(false);
  });
  it('leaves three PRs that each failed their own readable test alone', () => {
    const own = (id, pr, test) => ({
      ...row(id, pr),
      signature: [`test:${test}`],
    });
    expect(
      detectUnattributedRed([
        own(3, 30, 'a.test.ts'),
        own(2, 20, 'b.test.ts'),
        own(1, 10, 'c.test.ts'),
      ]).triggered
    ).toBe(false);
    // One readable failure in the window is enough to stand down.
    expect(
      detectUnattributedRed([row(3, 30), own(2, 20, 'b.test.ts'), row(1, 10)])
        .triggered
    ).toBe(false);
    // Generic tokens (a bare exit code) are not a readable failure.
    expect(
      detectUnattributedRed([
        { ...row(3, 30), signature: ['gate:Structural Contract'] },
        row(2, 20),
        row(1, 10),
      ]).triggered
    ).toBe(true);
  });
});

describe('remediationIntake', () => {
  it('is an issue scripts/lanes/pr_events.py convert_intake can read and route', () => {
    const intake = remediationIntake({
      repo: 'JovieInc/Jovie',
      check: 'test:lib/__tests__/production-release-supersession.test.mjs',
      reason: 'no-culprit',
      groups: [906, 905],
      day: '2026-11-11',
    });
    // The exact pattern convert_intake matches; a non-hex fingerprint is skipped there forever.
    const python = readFileSync(
      new URL('../../lanes/pr_events.py', import.meta.url),
      'utf8'
    );
    expect(python).toContain(
      '<!-- symphony-remediation fingerprint=([0-9a-f]+) -->'
    );
    expect(intake.body).toMatch(
      /<!-- symphony-remediation fingerprint=([0-9a-f]+) -->$/
    );
    expect(intake.fingerprint).toMatch(/^[0-9a-f]{20}$/);
    expect(intake.title.length).toBeLessThanOrEqual(80);
    expect(intake.body).toContain('Workstream: `ws:ci`');
    expect(intake.body).toContain('actions/runs/906');
    expect(intake.body).toContain('Never skip, weaken or quarantine');
    // Same check, same intake; no check, one per UTC day.
    const again = remediationIntake({
      repo: 'x/y',
      check: 'test:lib/__tests__/production-release-supersession.test.mjs',
      reason: 'no-culprit',
      groups: [1],
      day: '2026-11-12',
    });
    expect(again.fingerprint).toBe(intake.fingerprint);
    const mixed = day =>
      remediationIntake({ repo: 'x/y', reason: 'mixed', groups: [1], day })
        .fingerprint;
    expect(mixed('2026-11-11')).toBe(mixed('2026-11-11'));
    expect(mixed('2026-11-11')).not.toBe(mixed('2026-11-12'));
  });
});

describe('plan + apply on a red main with nothing to revert', () => {
  it('unreadable signatures on five PRs in a row: incident and intake instead of none', async () => {
    routes = world({ log: 'Error: Process completed with exit code 1.\n' });
    const p = await plan({ mode: 'apply', now: NOW });
    expect(p.decision).toEqual({
      action: 'remediate',
      reason: 'failures-do-not-share-a-signature',
    });
    expect(p.unattributed.prs).toEqual([24811, 24805, 24801, 24795, 24790]);
    const done = await apply(p);
    expect(done).toMatchObject({
      applied: false,
      incident: 901,
      intake: { issue: 902, created: true },
    });
    expect(posts()).toHaveLength(2);
    expect(posts()[0]).toContain('labels[]=main-health-incident');
    expect(posts()[1]).toContain(`labels[]=${INTAKE_LABEL}`);
    expect(posts()[1]).toContain('#24811, #24805');
  });

  it('a dry plan decides the same and files nothing', async () => {
    routes = world({ log: 'exit 1\n' });
    const p = await plan({ mode: 'dry', now: NOW });
    expect(p.decision.action).toBe('dry-remediate');
    expect(await apply(p)).toMatchObject({ applied: false });
    expect(posts()).toHaveLength(0);
  });

  it('a shared failing test no main commit introduced: alert plus intake, once', async () => {
    routes = world({ log: TIME_BOMB });
    const p = await plan({ mode: 'apply', now: NOW });
    expect(p.check).toBe(
      'test:lib/__tests__/production-release-supersession.test.mjs'
    );
    expect(p.culprit).toBeNull();
    expect(p.decision).toEqual({ action: 'alert', reason: 'no-culprit' });
    const done = await apply(p);
    expect(done.intake).toMatchObject({ issue: 902, created: true });
    expect(posts()).toHaveLength(2);

    // The next failed group wakes the ejector again: the open intake is found, not refiled.
    calls.length = 0;
    const body = remediationIntake({
      repo: 'JovieInc/Jovie',
      check: p.check,
      reason: 'no-culprit',
      groups: p.trigger.groups,
      day: '2026-11-11',
    }).body;
    routes = world({ log: TIME_BOMB, intakes: [{ number: 902, body }] });
    const again = await apply(await plan({ mode: 'apply', now: NOW }));
    expect(again.intake).toEqual({
      fingerprint: done.intake.fingerprint,
      issue: 902,
      created: false,
    });
    expect(
      posts().filter(c => c.includes(`labels[]=${INTAKE_LABEL}`))
    ).toHaveLength(0);
  });

  it('a failed intake filing is reported, never thrown', async () => {
    routes = world({ log: TIME_BOMB }).filter(
      ([k]) => !k.includes(INTAKE_LABEL)
    );
    const done = await apply(await plan({ mode: 'apply', now: NOW }));
    expect(done.intake.error).toContain('unrouted gh call');
  });
});

describe('workflow gate', () => {
  const wf = readFileSync(
    new URL('../../../.github/workflows/main-red-eject.yml', import.meta.url),
    'utf8'
  );
  it('reads the newest merge groups on a Main Health wake before the empty-queue exit', () => {
    expect(wf.indexOf('emit true red-groups')).toBeGreaterThan(0);
    expect(wf.indexOf('emit true red-groups')).toBeLessThan(
      wf.indexOf('emit false empty-queue')
    );
    expect(wf).toMatch(/actions: read/);
    expect(wf).toContain(
      `contains(fromJSON('["red-groups","group-read-failed"]'), needs.gate.outputs.reason)`
    );
    expect(wf).not.toMatch(/^\s*schedule:/m);
  });

  it('still attributes and ejects when the Main Health revert opener fails (Seer review on #25020)', () => {
    const step = name => {
      const start = wf.indexOf(`- name: ${name}`);
      expect(start).toBeGreaterThan(0);
      const next = wf.indexOf('\n      - ', start + 1);
      return wf.slice(start, next === -1 ? undefined : next);
    };
    expect(step('Revert the culprit Main Health named (revert first)')).toMatch(
      /\n\s+id: revert-first\n/
    );
    // Without an explicit status function the ejector's `if` is implicitly
    // success() and a failed revert opener would skip it on the very wake
    // meant to eject the culprit.
    expect(step('Attribute and eject the culprit')).toContain(
      "(success() || steps.revert-first.outcome == 'failure')"
    );
  });
});
