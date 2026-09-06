import { describe, expect, it } from 'vitest';
import {
  type CapacitySource,
  computeQualifiedTodoBufferTarget,
  DEFAULT_SYMPHONY_WORKFLOW_CAPACITY,
  GOVERNOR_BUFFER_SCHEMA,
  GOVERNOR_BUFFER_VERSION,
  type GovernorBufferIssue,
  GovernorCapacityError,
  officialSymphonyCapacity,
  planQualifiedTodoBuffer,
  qualifyIssueForTodoBuffer,
  rankTodoBufferCandidate,
} from '../agent/lib/governor-buffer';

function issue(
  identifier: string,
  overrides: Partial<GovernorBufferIssue> = {}
): GovernorBufferIssue {
  return {
    id: identifier.toLowerCase().replace(/-/g, '_'),
    identifier,
    team: 'JOV',
    state: 'Backlog',
    labels: [],
    assignee: null,
    ...overrides,
  };
}

function capacity(
  value: number,
  source = 'env:SYMPHONY_WORKFLOW_CAPACITY'
): CapacitySource {
  return {
    kind: 'symphony-workflow',
    value,
    source,
    observedAt: '2026-09-06T16:00:00.000Z',
  };
}

describe('Governor qualified Todo buffer', () => {
  it('reads the official capacity from the workflow environment, defaulting to 30', () => {
    const result = officialSymphonyCapacity({});
    expect(result.value).toBe(DEFAULT_SYMPHONY_WORKFLOW_CAPACITY);
    expect(result.source).toBe('env:SYMPHONY_UI_PILOT_CAPACITY');
  });

  it('prefers SYMPHONY_WORKFLOW_CAPACITY when both are set', () => {
    const result = officialSymphonyCapacity({
      SYMPHONY_WORKFLOW_CAPACITY: '25',
      SYMPHONY_UI_PILOT_CAPACITY: '40',
    });
    expect(result.value).toBe(25);
    expect(result.source).toBe('env:SYMPHONY_WORKFLOW_CAPACITY');
  });

  it('fails closed on a non-integer or out-of-bounds capacity value', () => {
    expect(() =>
      officialSymphonyCapacity({ SYMPHONY_WORKFLOW_CAPACITY: 'abc' })
    ).toThrow(GovernorCapacityError);
    expect(() =>
      officialSymphonyCapacity({ SYMPHONY_WORKFLOW_CAPACITY: '0' })
    ).toThrow(GovernorCapacityError);
  });

  it('computes a 2x target from the configured capacity', () => {
    expect(computeQualifiedTodoBufferTarget(30)).toBe(60);
    expect(computeQualifiedTodoBufferTarget(1)).toBe(2);
  });

  it('rejects non-positive capacity for the target', () => {
    expect(() => computeQualifiedTodoBufferTarget(0)).toThrow(
      GovernorCapacityError
    );
    expect(() => computeQualifiedTodoBufferTarget(-1)).toThrow(
      GovernorCapacityError
    );
  });

  it('qualifies only JOV issues that are unassigned and not in excluded states', () => {
    expect(qualifyIssueForTodoBuffer(issue('JOV-1001')).qualified).toBe(true);

    const nonJov = issue('FOO-1001', { team: 'FOO' });
    expect(qualifyIssueForTodoBuffer(nonJov).reason).toBe('team-not-jov');

    const inProgress = issue('JOV-1002', { state: 'In Progress' });
    expect(qualifyIssueForTodoBuffer(inProgress).reason).toContain('state');

    const assigned = issue('JOV-1003', { assignee: 'tim' });
    expect(qualifyIssueForTodoBuffer(assigned).reason).toBe('assigned-to-lane');

    const excluded = issue('JOV-1004', { labels: ['taste'] });
    expect(qualifyIssueForTodoBuffer(excluded).reason).toContain('excluded');

    const blocked = issue('JOV-1005');
    expect(
      qualifyIssueForTodoBuffer(blocked, new Set(['JOV-1005'])).reason
    ).toBe('blocked-by-open-pr-or-file-ownership');
  });

  it('ranks candidates by the priority order from JOV-5597', () => {
    const p0 = issue('JOV-2001', { labels: ['P0'] });
    const ci = issue('JOV-2002', { labels: ['ci-remediation'] });
    const shipping = issue('JOV-2003', { labels: ['founder-shipping'] });
    const design = issue('JOV-2004', { labels: ['ui-invariant'] });
    const backlog = issue('JOV-2005');

    expect(rankTodoBufferCandidate(p0).score).toBeGreaterThan(
      rankTodoBufferCandidate(ci).score
    );
    expect(rankTodoBufferCandidate(ci).score).toBeGreaterThan(
      rankTodoBufferCandidate(shipping).score
    );
    expect(rankTodoBufferCandidate(shipping).score).toBeGreaterThan(
      rankTodoBufferCandidate(design).score
    );
    expect(rankTodoBufferCandidate(design).score).toBeGreaterThan(
      rankTodoBufferCandidate(backlog).score
    );
    expect(rankTodoBufferCandidate(backlog).score).toBe(0);
  });

  it('plans promotions to fill the shortage up to the 2x target', () => {
    const issues = [
      issue('JOV-3001', { labels: ['P0'] }),
      issue('JOV-3002', { labels: ['ci-remediation'] }),
      issue('JOV-3003', { labels: ['founder-shipping'] }),
      issue('JOV-3004'),
      issue('JOV-3005'),
    ];
    const receipt = planQualifiedTodoBuffer({
      issues,
      qualifiedTodoCount: 58,
      capacity: capacity(30),
    });

    expect(receipt.schema).toBe(GOVERNOR_BUFFER_SCHEMA);
    expect(receipt.version).toBe(GOVERNOR_BUFFER_VERSION);
    expect(receipt.target).toBe(60);
    expect(receipt.shortage).toBe(2);
    expect(receipt.promotions.map(p => p.identifier)).toEqual([
      'JOV-3001',
      'JOV-3002',
    ]);
    expect(receipt.promotions[0].reason).toBe('P0 production urgency');
    expect(receipt.exceptions).toEqual([]);
  });

  it('reports no promotions when the buffer is already satisfied', () => {
    const receipt = planQualifiedTodoBuffer({
      issues: [issue('JOV-4001', { labels: ['P0'] })],
      qualifiedTodoCount: 60,
      capacity: capacity(30),
    });

    expect(receipt.shortage).toBe(0);
    expect(receipt.promotions).toEqual([]);
    expect(receipt.rejections).toEqual([
      {
        issueId: 'jov_4001',
        identifier: 'JOV-4001',
        reason: 'ranked-below-buffer-cutoff',
      },
    ]);
  });

  it('reports a genuine shortage when fewer candidates exist than needed', () => {
    const receipt = planQualifiedTodoBuffer({
      issues: [issue('JOV-5001')],
      qualifiedTodoCount: 50,
      capacity: capacity(30),
    });

    expect(receipt.shortage).toBe(10);
    expect(receipt.promotions).toHaveLength(1);
    expect(receipt.exceptions).toEqual([
      'insufficient-qualified-candidates: need 9 more to reach target 60',
    ]);
  });

  it('rejects unqualified candidates with deterministic reasons', () => {
    const issues = [
      issue('JOV-6001', { team: 'OTHER' }),
      issue('JOV-6002', { state: 'Done' }),
      issue('JOV-6003', { assignee: 'someone' }),
      issue('JOV-6004', { labels: ['no-symphony'] }),
    ];
    const receipt = planQualifiedTodoBuffer({
      issues,
      qualifiedTodoCount: 0,
      capacity: capacity(1),
    });

    expect(receipt.promotions).toEqual([]);
    expect(receipt.exceptions).toEqual([
      'insufficient-qualified-candidates: need 2 more to reach target 2',
    ]);
    const reasons = receipt.rejections.map(r => r.reason);
    expect(reasons).toContain('team-not-jov');
    expect(reasons).toContain('state-done');
    expect(reasons).toContain('assigned-to-lane');
    expect(reasons).toContain('excluded-label-no-symphony');
  });

  it('uses identifier ordering as a tie-breaker at equal priority', () => {
    const issues = [issue('JOV-7002'), issue('JOV-7001'), issue('JOV-7003')];
    const receipt = planQualifiedTodoBuffer({
      issues,
      qualifiedTodoCount: 58,
      capacity: capacity(30),
    });

    expect(receipt.promotions.map(p => p.identifier)).toEqual([
      'JOV-7001',
      'JOV-7002',
    ]);
  });
});
