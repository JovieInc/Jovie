import { describe, expect, it } from 'vitest';
import {
  compareRatchetCounts,
  detectChangedFileOverlap,
  detectIssueOverlap,
  fastTrackPolicy,
  isAutonomousBranch,
  parseMergeQueueTimeline,
  preQueueFreshnessDecision,
  requiredStatusDecision,
} from '../merge-queue-guard.mjs';

const greenStatuses = [
  { name: 'PR Ready', conclusion: 'SUCCESS' },
  { name: 'Migration Guard', conclusion: 'SUCCESS' },
  { name: 'Fork PR Gate', state: 'SUCCESS' },
];

describe('merge queue pre-queue freshness', () => {
  it('waits for CI after a stale head is rebased and pushed', () => {
    const decision = preQueueFreshnessDecision({
      behindBy: 4,
      rebaseAttempted: true,
      rebaseOk: true,
      pushedRebasedHead: true,
      requiredStatuses: greenStatuses,
    });

    expect(decision.action).toBe('wait_for_ci');
    expect(decision.reason).toContain('required checks must rerun');
  });

  it('blocks known conflicts before the merge label can be applied', () => {
    const decision = preQueueFreshnessDecision({
      behindBy: 2,
      rebaseAttempted: true,
      rebaseOk: false,
      requiredStatuses: greenStatuses,
    });

    expect(decision.action).toBe('block_conflict');
  });

  it('enqueues only when the head is fresh and required statuses are green', () => {
    expect(requiredStatusDecision(greenStatuses).ok).toBe(true);
    expect(
      preQueueFreshnessDecision({
        behindBy: 0,
        requiredStatuses: greenStatuses,
      }).action
    ).toBe('enqueue');

    const waiting = preQueueFreshnessDecision({
      behindBy: 0,
      requiredStatuses: [
        ...greenStatuses.slice(0, 2),
        { name: 'Fork PR Gate', state: 'PENDING' },
      ],
    });
    expect(waiting.action).toBe('wait_for_ci');
    expect(waiting.reason).toContain('Fork PR Gate');
  });
});

describe('autonomous dispatch overlap', () => {
  it('does not classify generic human branches as autonomous blockers', () => {
    expect(isAutonomousBranch('tim/manual-copy-fix')).toBe(false);
    expect(isAutonomousBranch('tim/jov-123-generated-fix')).toBe(true);
  });

  it('blocks two autonomous PRs touching the same hot file', () => {
    const result = detectChangedFileOverlap(
      ['apps/web/tests/unit/design-system/arbitrary-values.baseline.json'],
      [
        {
          number: 11263,
          title: 'converge artists page arbitraries',
          headRefName: 'tim/jov-ds-drift-artists-page',
          changedFiles: [
            'apps/web/tests/unit/design-system/arbitrary-values.baseline.json',
          ],
        },
      ]
    );

    expect(result.blocked).toBe(true);
    expect(result.blockers[0].reason).toContain('ratchet/baseline counter');
  });

  it('blocks issue dispatch when file hints overlap an open subsystem PR', () => {
    const result = detectIssueOverlap(
      {
        title: 'Fix release-to-revenue approval route',
        body: 'Touches apps/web/lib/release-to-revenue/distribution-drafts.ts',
      },
      [
        {
          number: 11236,
          title: 'release-to-revenue drafts',
          headRefName: 'codex/t_ee82b9c8/20260620070815',
          changedFiles: [
            'apps/web/lib/release-to-revenue/distribution-drafts.ts',
          ],
        },
      ]
    );

    expect(result.blocked).toBe(true);
    expect(result.blockers[0].number).toBe(11236);
  });
});

describe('ratchet comparison', () => {
  it('allows decreases against the current base without requiring a shared counter edit', () => {
    const result = compareRatchetCounts(
      { arbitraryValues: 5037, bareTextWhite: 230 },
      { arbitraryValues: 5050, bareTextWhite: 238 }
    );

    expect(result.ok).toBe(true);
    expect(result.improvements.map(item => item.key)).toEqual([
      'arbitraryValues',
      'bareTextWhite',
    ]);
  });

  it('fails monotonic regressions against the current base', () => {
    const result = compareRatchetCounts(
      { arbitraryValues: 5051 },
      { arbitraryValues: 5050 }
    );

    expect(result.ok).toBe(false);
    expect(result.regressions).toEqual([
      { key: 'arbitraryValues', current: 5051, base: 5050 },
    ]);
  });
});

describe('fast-track policy', () => {
  it('removes fast-track from ordinary generated PRs', () => {
    const policy = fastTrackPolicy({
      headRefName: 'codex/jov-123-normal-work',
      labels: [{ name: 'fast' }],
      title: 'Fix dashboard copy',
    });

    expect(policy.removeFast).toBe(true);
    expect(policy.allowed).toBe(false);
  });

  it('permits fast-track only for explicit hotfix classification', () => {
    const policy = fastTrackPolicy({
      headRefName: 'codex/jov-123-prod-fix',
      labels: [{ name: 'fast' }, { name: 'hotfix' }],
      title: 'Hotfix production login incident',
    });

    expect(policy.removeFast).toBe(false);
    expect(policy.allowed).toBe(true);
  });
});

describe('merge queue telemetry parser', () => {
  it('records queued duration, evictions, requeues, staleness, and speculative reruns', () => {
    const metrics = parseMergeQueueTimeline([
      {
        event: 'labeled',
        label: { name: 'merge-queue' },
        created_at: '2026-06-20T01:00:00Z',
      },
      {
        event: 'commented',
        body: '<!-- merge-queue-telemetry {"event":"enqueue","branchStalenessCommits":3,"speculativeRerun":true} -->',
        created_at: '2026-06-20T01:00:02Z',
      },
      {
        event: 'commented',
        body: "Merge Conflict Detected — This PR has state 'BLOCKED'",
        created_at: '2026-06-20T01:30:00Z',
      },
      {
        event: 'unlabeled',
        label: { name: 'merge-queue' },
        actor: { login: 'graphite-app[bot]' },
        created_at: '2026-06-20T01:31:00Z',
      },
      {
        event: 'labeled',
        label: { name: 'merge-queue' },
        created_at: '2026-06-20T02:00:00Z',
      },
      {
        event: 'commented',
        body: 'CI failed after Graphite speculative rerun',
        created_at: '2026-06-20T02:10:00Z',
      },
      {
        event: 'merged',
        created_at: '2026-06-20T02:30:00Z',
      },
    ]);

    expect(metrics.queuedToMergedSeconds).toBe(5400);
    expect(metrics.requeueCount).toBe(1);
    expect(metrics.conflictEvictions).toBe(1);
    expect(metrics.ciEvictions).toBe(1);
    expect(metrics.branchStalenessAtEnqueue).toBe(3);
    expect(metrics.speculativeReruns).toBe(1);
  });
});
