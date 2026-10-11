import { describe, expect, it } from 'vitest';

import {
  backtestRecommendation,
  buildDemandMap,
  clusterKeyFor,
  demandSignalIdentity,
  isSyntheticKind,
  normalizeDemandSignal,
  type RawDemandObservation,
  recommendAll,
  recommendForCluster,
} from '@/lib/demand';

function observation(
  overrides: Partial<RawDemandObservation> = {}
): RawDemandObservation {
  return {
    observedAt: '2026-10-01T12:00:00.000Z',
    surface: 'cli',
    request: 'Can Jovie send SMS campaigns to fans?',
    capability: 'sms-campaigns',
    job: 'notify-fans-about-release',
    provenance: { kind: 'external-customer', sourceKey: 'acct-1' },
    supported: false,
    icpAdjacent: true,
    ...overrides,
  };
}

describe('normalizeDemandSignal', () => {
  it('normalizes request text and entity names', () => {
    const signal = normalizeDemandSignal(
      observation({
        request: '  Can   Jovie SEND sms? ',
        entity: { kind: 'artist', name: '  The  MIDNIGHT ' },
      })
    );
    expect(signal.normalizedRequest).toBe('can jovie send sms?');
    expect(signal.entity?.name).toBe('the midnight');
    expect(signal.capability).toBe('sms-campaigns');
  });

  it('produces a stable dedupe identity across repeated identical requests', () => {
    const a = normalizeDemandSignal(observation());
    const b = normalizeDemandSignal(
      observation({ observedAt: '2026-10-02T00:00:00.000Z' })
    );
    expect(a.id).toBe(b.id);
    expect(demandSignalIdentity(observation())).toBe(a.id);
  });

  it('distinct provenance sources produce distinct identities', () => {
    const a = demandSignalIdentity(observation());
    const b = demandSignalIdentity(
      observation({
        provenance: { kind: 'external-customer', sourceKey: 'acct-2' },
      })
    );
    expect(a).not.toBe(b);
  });
});

describe('buildDemandMap', () => {
  it('collapses repeated requests from one automated source into one unit of demand', () => {
    const fleet = Array.from({ length: 50 }, (_, i) =>
      normalizeDemandSignal(
        observation({
          observedAt: `2026-10-01T00:${String(i % 60).padStart(2, '0')}:00.000Z`,
          provenance: { kind: 'internal-fleet', sourceKey: 'fleet-worker-7' },
          request: 'Can Jovie send SMS campaigns to fans?',
        })
      )
    );
    const [cluster] = buildDemandMap(fleet);
    expect(cluster.signalIds).toHaveLength(1);
    expect(cluster.syntheticSources).toBe(1);
    expect(cluster.independentSources).toBe(0);
    expect(cluster.disposition).toBe('noise');
  });

  it('synthetic/fleet traffic can never reach investigate or build dispositions', () => {
    const synthetic = ['internal-fleet', 'internal-synthetic'] as const;
    for (const kind of synthetic) {
      const signals = Array.from({ length: 8 }, (_, i) =>
        normalizeDemandSignal(
          observation({
            request: `request variant ${i} for capability`,
            provenance: { kind, sourceKey: `bot-${i}` },
          })
        )
      );
      const [cluster] = buildDemandMap(signals);
      expect(cluster.independentSources).toBe(0);
      expect(cluster.disposition).toBe('noise');
    }
  });

  it('clusters by entity × capability × job and counts independent demand', () => {
    const entity = { kind: 'artist' as const, name: 'the midnight' };
    const signals = [
      normalizeDemandSignal(
        observation({
          entity,
          provenance: { kind: 'external-customer', sourceKey: 'acct-1' },
        })
      ),
      normalizeDemandSignal(
        observation({
          entity,
          provenance: { kind: 'external-organic', sourceKey: 'anon-ip-9' },
          request: 'Different wording, same job',
          observedAt: '2026-10-02T12:00:00.000Z',
        })
      ),
      normalizeDemandSignal(
        observation({
          entity,
          provenance: { kind: 'internal-fleet', sourceKey: 'fleet-1' },
          request: 'Fleet copy of the same request',
        })
      ),
    ];
    const [cluster] = buildDemandMap(signals);
    expect(cluster.key).toBe(clusterKeyFor(signals[0]));
    expect(cluster.key).toContain('artist:the midnight');
    expect(cluster.independentSources).toBe(2);
    expect(cluster.customerSources).toBe(1);
    expect(cluster.syntheticSources).toBe(1);
    expect(cluster.firstSeenAt).toBe('2026-10-01T12:00:00.000Z');
    expect(cluster.lastSeenAt).toBe('2026-10-02T12:00:00.000Z');
  });

  it('scores independent customer demand above founder-only or unknown demand', () => {
    const customer = buildDemandMap([
      normalizeDemandSignal(
        observation({
          provenance: { kind: 'external-customer', sourceKey: 'a' },
        })
      ),
      normalizeDemandSignal(
        observation({
          request: 'v2',
          provenance: { kind: 'external-customer', sourceKey: 'b' },
        })
      ),
    ])[0];
    const founder = buildDemandMap([
      normalizeDemandSignal(
        observation({ provenance: { kind: 'founder', sourceKey: 'tim' } })
      ),
    ])[0];
    const unknown = buildDemandMap([
      normalizeDemandSignal(
        observation({ provenance: { kind: 'unknown', sourceKey: '?' } })
      ),
    ])[0];
    expect(customer.strategicScore).toBeGreaterThan(founder.strategicScore);
    expect(founder.strategicScore).toBeGreaterThan(unknown.strategicScore);
    expect(unknown.disposition).toBe('noise'); // unknown is not independent demand
    expect(founder.disposition).toBe('observe'); // founder taste stays evidence
  });

  it('promotes strong, unsupported, ICP-adjacent customer demand to build candidacy', () => {
    const signals = Array.from({ length: 2 }, (_, i) =>
      normalizeDemandSignal(
        observation({
          request: `variant ${i}`,
          provenance: { kind: 'external-customer', sourceKey: `acct-${i}` },
        })
      )
    );
    const [cluster] = buildDemandMap(signals);
    expect(cluster.disposition).toBe('build-when-capacity');
    expect(cluster.strategicScore).toBeGreaterThanOrEqual(60);
  });

  it('escalates very high customer demand to urgent-candidate', () => {
    const signals = Array.from({ length: 6 }, (_, i) =>
      normalizeDemandSignal(
        observation({
          request: `variant ${i}`,
          provenance: { kind: 'external-customer', sourceKey: `acct-${i}` },
        })
      )
    );
    const [cluster] = buildDemandMap(signals);
    expect(cluster.disposition).toBe('urgent-candidate');
  });

  it('routes human-gated capabilities to human-escalation regardless of score', () => {
    const signals = Array.from({ length: 6 }, (_, i) =>
      normalizeDemandSignal(
        observation({
          request: `paid shout variant ${i}`,
          requiresHumanGate: true,
          provenance: { kind: 'external-customer', sourceKey: `acct-${i}` },
        })
      )
    );
    const [cluster] = buildDemandMap(signals);
    expect(cluster.disposition).toBe('human-escalation');
  });

  it('weak single-source demand lands on observe or investigate, not build', () => {
    const [cluster] = buildDemandMap([normalizeDemandSignal(observation())]);
    expect(['observe', 'investigate']).toContain(cluster.disposition);
  });
});

describe('recommendForCluster', () => {
  it('always returns a recommendation and a non-empty countercase', () => {
    const clusters = buildDemandMap([
      normalizeDemandSignal(observation()),
      normalizeDemandSignal(
        observation({
          request: 'x',
          provenance: { kind: 'internal-synthetic', sourceKey: 'sim' },
        })
      ),
    ]);
    for (const rec of recommendAll(clusters)) {
      expect(rec.action.length).toBeGreaterThan(0);
      expect(rec.rationale.length).toBeGreaterThan(0);
      expect(rec.countercase.length).toBeGreaterThan(0);
      expect(rec.gates.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('countercase calls out anecdotal single-source demand', () => {
    const [cluster] = buildDemandMap([normalizeDemandSignal(observation())]);
    const rec = recommendForCluster(cluster);
    expect(rec.countercase).toContain('single independent source');
  });

  it('human-escalation recommendations carry the JOV-7415 gate note first', () => {
    const [cluster] = buildDemandMap([
      normalizeDemandSignal(observation({ requiresHumanGate: true })),
    ]);
    const rec = recommendForCluster(cluster);
    expect(rec.disposition).toBe('human-escalation');
    expect(rec.gates[0]).toContain('JOV-7415');
  });
});

describe('backtestRecommendation', () => {
  const cluster = buildDemandMap([
    normalizeDemandSignal(observation()),
    normalizeDemandSignal(
      observation({
        request: 'v2',
        provenance: { kind: 'external-customer', sourceKey: 'acct-2' },
      })
    ),
  ])[0];

  it('is inconclusive with no downstream evidence', () => {
    const result = backtestRecommendation(cluster, { clusterKey: cluster.key });
    expect(result.verdict).toBe('inconclusive');
    expect(result.realizedStrength).toBe(0);
  });

  it('validates recommendations backed by real downstream usage and revenue', () => {
    const result = backtestRecommendation(cluster, {
      clusterKey: cluster.key,
      usageCount: 40,
      repeatUsageCount: 10,
      claimCount: 4,
      activationCount: 2,
      retentionCount: 2,
      revenueCents: 5000,
      graphExpansionCount: 3,
    });
    expect(result.verdict).toBe('validated');
    expect(result.realizedStrength).toBeGreaterThanOrEqual(0.5);
  });

  it('marks recommendations with negligible downstream evidence as missed', () => {
    const result = backtestRecommendation(cluster, {
      clusterKey: cluster.key,
      usageCount: 1,
    });
    expect(result.verdict).toBe('missed');
    expect(result.explanation).toContain('recalibrate');
  });
});

describe('isSyntheticKind', () => {
  it('flags fleet and synthetic provenance', () => {
    expect(isSyntheticKind('internal-fleet')).toBe(true);
    expect(isSyntheticKind('internal-synthetic')).toBe(true);
    expect(isSyntheticKind('external-customer')).toBe(false);
  });
});
