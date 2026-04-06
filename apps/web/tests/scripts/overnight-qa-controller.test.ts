import { describe, expect, it } from 'vitest';
import { buildDefaultRunState } from '../../scripts/overnight-qa/ledger';
import type { OvernightIssue } from '../../scripts/overnight-qa/types';
import {
  buildFixBranchName,
  determineStopReason,
  selectQueuedIssues,
} from '../../scripts/overnight-qa-controller';

function createIssue(overrides: Partial<OvernightIssue> = {}): OvernightIssue {
  return {
    key: 'creator|app-admin|http-500',
    suiteId: 'breadth-route-qa',
    source: 'route-qa',
    surface: 'creator',
    path: '/app/admin',
    summary: 'Admin route returned HTTP 500',
    signature: 'HTTP 500',
    evidencePaths: [],
    discoveredAt: '2026-04-05T01:00:00Z',
    priority: 10,
    verificationSteps: [],
    failureContext: 'HTTP 500',
    routeFilter: '/app/admin',
    testFile: null,
    ...overrides,
  };
}

describe('overnight-qa controller helpers', () => {
  it('builds deterministic fix branch names', () => {
    const branch = buildFixBranchName(
      createIssue({
        surface: 'admin',
        path: '/app/admin',
        signature: '500',
      }),
      7
    );

    expect(branch).toBe('itstimwhite/overnight-qa-007-admin-app-admin-500');
  });

  it('filters merged and parked issues from a resumed queue', () => {
    const mergedIssue = createIssue({ key: 'merged|issue', path: '/app/a' });
    const parkedIssue = createIssue({ key: 'parked|issue', path: '/app/b' });
    const queuedIssue = createIssue({ key: 'queued|issue', path: '/app/c' });
    const state = {
      ...buildDefaultRunState('2026-04-05T01-00-00Z'),
      issueHistory: {
        [mergedIssue.key]: {
          status: 'merged' as const,
          updatedAt: '2026-04-05T01:10:00Z',
        },
        [parkedIssue.key]: {
          status: 'parked' as const,
          updatedAt: '2026-04-05T01:20:00Z',
        },
      },
    };

    expect(
      selectQueuedIssues([mergedIssue, parkedIssue, queuedIssue], state)
    ).toEqual([queuedIssue]);
  });

  it('reports the first active stop reason in guardrail order', () => {
    expect(
      determineStopReason({
        ...buildDefaultRunState('2026-04-05T01-00-00Z'),
        mergedFixCount: 5,
        consecutiveCiFailures: 2,
        consecutiveUnfixableIssues: 3,
      })
    ).toBe('Merged fix cap of 5 reached.');

    expect(
      determineStopReason({
        ...buildDefaultRunState('2026-04-05T01-00-00Z'),
        consecutiveCiFailures: 2,
      })
    ).toBe('Hit 2 consecutive CI or deploy failures.');

    expect(
      determineStopReason({
        ...buildDefaultRunState('2026-04-05T01-00-00Z'),
        consecutiveUnfixableIssues: 3,
      })
    ).toBe('Hit 3 consecutive unfixable issues.');

    expect(
      determineStopReason(buildDefaultRunState('2026-04-05T01-00-00Z'))
    ).toBeNull();
  });
});
