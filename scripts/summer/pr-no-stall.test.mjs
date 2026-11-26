import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AGENT_BRANCH_RE,
  classifyOpenPr,
  emptyHeadBump,
  inventoryOpenPrs,
  isSafeBranchName,
  parseArgs,
  requiredChecksSettledGreen,
  SCHEMA,
} from './pr-no-stall.mjs';

const NOW = Date.parse('2026-11-20T20:00:00Z');

const GREEN_ROLLUP = [
  { name: 'PR Ready', status: 'COMPLETED', conclusion: 'SUCCESS' },
  { name: 'Source Validation', status: 'COMPLETED', conclusion: 'SUCCESS' },
];

const FAIL_ROLLUP = [
  { name: 'PR Ready', status: 'COMPLETED', conclusion: 'FAILURE' },
];

describe('pr-no-stall classifier', () => {
  it('exports a stable receipt schema', () => {
    assert.equal(SCHEMA, 'jovie-summer-pr-no-stall/v1');
  });

  it('recognizes cursor/ and sibling agent prefixes the old harness missed', () => {
    assert.equal(
      AGENT_BRANCH_RE.test('cursor/summer-no-stall-watchdog-9c4a'),
      true
    );
    assert.equal(
      AGENT_BRANCH_RE.test('glm/golden-path-copy-waitlist-claim'),
      true
    );
    assert.equal(AGENT_BRANCH_RE.test('screenshots/auto-update'), false);
  });

  it('requires settled-green checks for admission-deadlock even when BLOCKED', () => {
    const row = classifyOpenPr(
      {
        number: 25075,
        title: 'retire seer',
        isDraft: false,
        mergeable: 'MERGEABLE',
        mergeStateStatus: 'BLOCKED',
        headRefName: 'chore/retire-seer-controller-review',
        updatedAt: '2026-11-11T20:00:00Z',
        labels: [{ name: 'lane-fix-red' }],
        statusCheckRollup: GREEN_ROLLUP,
      },
      { nowMs: NOW, idleHours: 6 }
    );
    assert.equal(row.class, 'admission-deadlock');
    assert.equal(row.action, 'empty-head-bump');
  });

  it('does not bump BLOCKED heads with failing required checks', () => {
    const row = classifyOpenPr(
      {
        number: 99,
        isDraft: false,
        mergeable: 'MERGEABLE',
        mergeStateStatus: 'BLOCKED',
        headRefName: 'cursor/failing-head',
        updatedAt: '2026-11-11T20:00:00Z',
        labels: ['lane-fix-red'],
        statusCheckRollup: FAIL_ROLLUP,
      },
      { nowMs: NOW }
    );
    assert.notEqual(row.class, 'admission-deadlock');
  });

  it('skips cross-repository / fork PRs', () => {
    const row = classifyOpenPr(
      {
        number: 3,
        isDraft: false,
        mergeable: 'MERGEABLE',
        mergeStateStatus: 'BLOCKED',
        headRefName: 'cursor/fork-branch',
        updatedAt: '2026-11-11T20:00:00Z',
        labels: ['lane-fix-red'],
        statusCheckRollup: GREEN_ROLLUP,
        isCrossRepository: true,
      },
      { nowMs: NOW }
    );
    assert.equal(row.class, 'cross-repo');
    assert.equal(row.action, 'none');
  });

  it('does not reclaim stop-labeled PRs (Tim)', () => {
    const row = classifyOpenPr(
      {
        number: 1,
        isDraft: false,
        mergeable: 'MERGEABLE',
        headRefName: 'cursor/x',
        updatedAt: '2026-11-11T20:00:00Z',
        labels: ['lane-fix-red', 'hold'],
        statusCheckRollup: GREEN_ROLLUP,
      },
      { nowMs: NOW }
    );
    assert.equal(row.class, 'tim-or-hold');
  });

  it('flags draft-green stale for auto-ready', () => {
    const row = classifyOpenPr(
      {
        number: 25698,
        isDraft: true,
        mergeable: 'MERGEABLE',
        headRefName: 'chloe/jov-12405-connector-docs',
        updatedAt: '2026-11-19T03:00:00Z',
        labels: ['lane-fix-green', 'lane-fix-stale'],
      },
      { nowMs: NOW }
    );
    assert.equal(row.class, 'draft-green-stale');
  });

  it('inventories counts by class', () => {
    const report = inventoryOpenPrs(
      [
        {
          number: 1,
          isDraft: false,
          mergeable: 'MERGEABLE',
          mergeStateStatus: 'BLOCKED',
          headRefName: 'cursor/a',
          updatedAt: '2026-11-11T20:00:00Z',
          labels: ['lane-fix-red'],
          statusCheckRollup: GREEN_ROLLUP,
        },
        {
          number: 2,
          isDraft: true,
          mergeable: 'MERGEABLE',
          headRefName: 'codex/b',
          updatedAt: '2026-11-19T03:00:00Z',
          labels: ['lane-fix-green'],
        },
      ],
      { nowMs: NOW }
    );
    assert.equal(report.byClass['admission-deadlock'], 1);
    assert.equal(report.byClass['draft-green-stale'], 1);
  });

  it('rejects unsafe branch names', () => {
    assert.equal(isSafeBranchName('cursor/ok-branch'), true);
    assert.equal(isSafeBranchName('evil$(reboot)'), false);
    assert.equal(isSafeBranchName('main'), false);
    assert.equal(requiredChecksSettledGreen({ statusCheckRollup: [] }), false);
  });

  it('treats StatusContext.state FAILURE/ERROR/PENDING as not green', () => {
    assert.equal(
      requiredChecksSettledGreen({
        statusCheckRollup: [
          ...GREEN_ROLLUP,
          {
            __typename: 'StatusContext',
            context: 'Fork PR Gate',
            state: 'SUCCESS',
          },
        ],
      }),
      true
    );
    assert.equal(
      requiredChecksSettledGreen({
        statusCheckRollup: [
          {
            __typename: 'StatusContext',
            context: 'ci/travis',
            state: 'FAILURE',
          },
        ],
      }),
      false
    );
    assert.equal(
      requiredChecksSettledGreen({
        statusCheckRollup: [
          { __typename: 'StatusContext', context: 'ci', state: 'PENDING' },
        ],
      }),
      false
    );
    assert.equal(
      requiredChecksSettledGreen({
        statusCheckRollup: [
          { __typename: 'StatusContext', context: 'ci', state: 'ERROR' },
        ],
      }),
      false
    );
  });

  it('inventory-only main exits 0 when deadlocks are present', async () => {
    const { main } = await import('./pr-no-stall.mjs');
    const code = main(['--json'], {
      listPrs: () => [
        {
          number: 1,
          isDraft: false,
          mergeable: 'MERGEABLE',
          mergeStateStatus: 'BLOCKED',
          headRefName: 'cursor/deadlock',
          updatedAt: '2026-11-11T20:00:00Z',
          labels: ['lane-fix-red'],
          statusCheckRollup: GREEN_ROLLUP,
        },
      ],
      nowMs: NOW,
    });
    assert.equal(code, 0);
  });

  it('apply exits non-zero when any empty-head bump fails', async () => {
    const { main } = await import('./pr-no-stall.mjs');
    const run = (cmd, args) => {
      if (cmd === 'git' && args[0] === 'push') {
        return { status: 1, stdout: '', stderr: 'push rejected' };
      }
      return { status: 0, stdout: '', stderr: '' };
    };
    const code = main(['--apply', '--json', '--limit', '1'], {
      run,
      nowMs: NOW,
      listPrs: () => [
        {
          number: 7,
          isDraft: false,
          mergeable: 'MERGEABLE',
          mergeStateStatus: 'BLOCKED',
          headRefName: 'cursor/bump-fail',
          updatedAt: '2026-11-11T20:00:00Z',
          labels: ['lane-fix-red'],
          statusCheckRollup: GREEN_ROLLUP,
        },
      ],
    });
    assert.equal(code, 1);
  });

  it('emptyHeadBump uses git argv arrays and refuses shell-meta branches', () => {
    const calls = [];
    const run = (cmd, args) => {
      calls.push([cmd, ...args]);
      return { status: 0, stdout: '', stderr: '' };
    };
    const refused = emptyHeadBump({ number: 1, branch: 'evil`id`' }, { run });
    assert.equal(refused.ok, false);
    assert.equal(calls.length, 0);

    const ok = emptyHeadBump(
      { number: 2, branch: 'cursor/safe-branch' },
      { run }
    );
    assert.equal(ok.ok, true);
    assert.equal(calls[0][0], 'git');
    assert.deepEqual(calls[0].slice(1), [
      'fetch',
      'origin',
      'cursor/safe-branch',
    ]);
    assert.equal(
      calls.every(c => c[0] === 'git'),
      true
    );
  });

  it('parses CLI flags', () => {
    assert.deepEqual(
      parseArgs(['--apply', '--limit', '3', '--idle-hours=12', '--json']),
      {
        apply: true,
        limit: 3,
        idleHours: 12,
        json: true,
        help: false,
      }
    );
  });
});

describe('open PR listing (JOV-13876)', () => {
  /** Fake gh: 130 open PRs; records every call. */
  function fakeGh(calls) {
    const prs = Array.from({ length: 130 }, (_, i) => ({
      number: i + 1,
      isDraft: i % 2 === 1,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'BLOCKED',
      headRefName: `cursor/pr-${i + 1}`,
      updatedAt: '2026-11-11T20:00:00Z',
      labels: [{ name: 'lane-fix-red' }],
    }));
    return (cmd, args) => {
      calls.push([cmd, ...args]);
      if (args[0] === 'pr' && args[1] === 'list') {
        const limit = Number(args[args.indexOf('--limit') + 1]);
        return {
          status: 0,
          stdout: JSON.stringify(prs.slice(0, limit)),
          stderr: '',
        };
      }
      if (args[0] === 'pr' && args[1] === 'view') {
        return {
          status: 0,
          stdout: JSON.stringify({ statusCheckRollup: GREEN_ROLLUP }),
          stderr: '',
        };
      }
      return { status: 0, stdout: '', stderr: '' };
    };
  }

  it('sees every open PR, not the first 100, and keeps the list call light', async () => {
    const { main } = await import('./pr-no-stall.mjs');
    const calls = [];
    const out = [];
    const write = process.stdout.write;
    process.stdout.write = chunk => (out.push(String(chunk)), true);
    try {
      assert.equal(main(['--json'], { run: fakeGh(calls), nowMs: NOW }), 0);
    } finally {
      process.stdout.write = write;
    }
    const report = JSON.parse(out.join(''));
    assert.equal(report.openCount, 130);
    const list = calls.find(c => c[1] === 'pr' && c[2] === 'list');
    assert.ok(
      !list.join(' ').includes('statusCheckRollup'),
      'list call must not ask for check rollups'
    );
    // Idle ready PRs get their rollup one at a time, capped to the token budget.
    assert.equal(report.byClass['admission-deadlock'], 6);
    assert.equal(report.rollupSkipped, 59);
    assert.equal(calls.filter(c => c[2] === 'view').length, 6);
  });

  it('a failed rollup read fails closed for that PR only', async () => {
    const { listOpenPrs } = await import('./pr-no-stall-list.mjs');
    const calls = [];
    const base = fakeGh(calls);
    const run = (cmd, args) =>
      args[1] === 'view' && args[2] === '1'
        ? { status: 1, stdout: '', stderr: 'HTTP 504' }
        : base(cmd, args);
    const gh = runner => args => {
      const done = runner('gh', args);
      if (done.status !== 0) throw new Error(done.stderr);
      return JSON.parse(done.stdout);
    };
    const { prs, rollupErrors } = listOpenPrs(gh(run), {
      idleHours: 6,
      nowMs: NOW,
    });
    assert.equal(prs.length, 130);
    assert.equal(rollupErrors, 1);
    assert.equal(prs[0].statusCheckRollup, undefined);
    assert.equal(requiredChecksSettledGreen(prs[0]), false);
    assert.equal(requiredChecksSettledGreen(prs[2]), true);
    // Fresh heads are not read at all.
    const fresh = listOpenPrs(gh(fakeGh([])), { idleHours: 1000, nowMs: NOW });
    assert.equal(fresh.rollupSkipped, 0);
    assert.equal(fresh.prs.filter(pr => pr.statusCheckRollup).length, 0);
  });
});
