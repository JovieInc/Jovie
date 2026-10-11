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
  planValueReservoir,
  qualifyIssueForTodoBuffer,
  type ReservoirCandidate,
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

const reservoirRequirements =
  'route:symphony,provider:openai,model:codex,cli:codex,harness:eve,tool:linear'.split(
    ','
  ) as ReservoirCandidate['executionRequirements'];

function reservoirCandidate(
  id: string,
  overrides: Partial<ReservoirCandidate> = {}
): ReservoirCandidate {
  return {
    id,
    objective: `Resolve ${id}`,
    valueHypothesis: `Certified ${id} creates durable value`,
    workClass: 'code',
    executionRequirements: reservoirRequirements,
    sourceRefs: [`linear://${id}`],
    dedupeKey: `gap:${id}`,
    estimatedCapacityUnits: 10,
    completionMinutes: 30,
    maxParallelism: 1,
    dependencies: [],
    freshUntil: '2026-10-01T00:00:00.000Z',
    reversibility: 'reversible',
    riskTier: 'low',
    authority: 'automation',
    privacy: 'internal',
    artifactUri: `gbrain://evidence/${id}`,
    provenanceRefs: [`linear://${id}`],
    certificationPredicate: 'artifact-reviewed',
    stopConditions: ['certified'],
    lowValueEvidence: ['duplicate-or-no-new-evidence'],
    tier: 1,
    marginalValue: 0.8,
    confidence: 0.8,
    completionProbability: 0.9,
    generatorId: 'evidence-gap-adapter',
    persistence: 'job',
    ...overrides,
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

  it('fills an imminent cross-route reservoir without duplicates or weakened safety floors', () => {
    const workClasses =
      'code,eval,research,acquisition-outbound,seo-aeo,documentation,reliability,certification'.split(
        ','
      ) as ReservoirCandidate['workClass'][];
    const candidates = workClasses.map((workClass, index) =>
      reservoirCandidate(workClass, {
        workClass,
        tier: Math.min(index + 1, 6) as ReservoirCandidate['tier'],
      })
    );
    candidates.push(
      reservoirCandidate('duplicate-wording', { dedupeKey: 'gap:code' }),
      reservoirCandidate('too-long', { completionMinutes: 120 }),
      reservoirCandidate('partial', {
        completionMinutes: 120,
        partialDurableValue: {
          usefulAfterMinutes: 15,
          capacityUnits: 5,
        },
      }),
      reservoirCandidate('unsafe', { riskTier: 'critical' })
    );
    const horizon = {
      id: 'imminent-grant',
      unavailableAt: '2026-09-29T21:00:00.000Z',
      availableCapacityUnits: 80,
      throughputUnitsPerHour: 100,
      headroomUnits: 0,
      existingQualifiedWorkUnits: 0,
      activeDedupeKeys: new Set(),
      resolvedDependencies: new Set(),
      executionCapabilities: new Set(reservoirRequirements),
      maxRiskTier: 'medium',
      allowedAuthorities: ['automation'] as const,
      allowedPrivacy: ['internal'] as const,
    };
    const receipt = planValueReservoir({
      candidates,
      horizon,
      observedAt: '2026-09-29T20:00:00.000Z',
    });

    expect(receipt.coverage.projectedUnusedCapacityUnits).toBe(0);
    expect(
      Object.fromEntries(
        receipt.rejections.map(item => [item.candidateId, item.reason])
      )
    ).toMatchObject({
      'duplicate-wording': 'duplicate',
      'too-long': 'incompatible-route',
      unsafe: 'unsafe-authority',
    });
    expect(
      receipt.eligible.find(item => item.candidate.id === 'partial')
        ?.completionMode
    ).toBe('partial-durable');
  });
});
