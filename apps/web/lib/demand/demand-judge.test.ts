import { describe, expect, it, vi } from 'vitest';

import {
  buildDemandMap,
  judgeAll,
  judgeCluster,
  normalizeDemandSignal,
  type RawDemandObservation,
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

function customerCluster(count: number) {
  return buildDemandMap(
    Array.from({ length: count }, (_, i) =>
      normalizeDemandSignal(
        observation({
          request: `variant ${i}`,
          provenance: { kind: 'external-customer', sourceKey: `acct-${i}` },
        })
      )
    )
  )[0];
}

describe('judgeCluster', () => {
  it('is reproducible: same evidence and context yields the same judgment', () => {
    const cluster = customerCluster(3);
    const context = { jobImportance: 0.8, revenueProximity: 0.6 };
    const a = judgeCluster(cluster, context);
    const b = judgeCluster(cluster, context);
    expect(a).toEqual(b);
    expect(a.judgedScore).toBe(b.judgedScore);
  });

  it('exposes per-dimension evidence rather than an opaque score', () => {
    const judgment = judgeCluster(customerCluster(3), {
      jobImportance: 0.8,
      implementationCost: 0.4,
    });
    const dimensions = judgment.evidence.map(e => e.dimension);
    expect(dimensions).toEqual(
      expect.arrayContaining([
        'signal-quality',
        'icp-relevance',
        'job-importance',
        'implementation-cost',
      ])
    );
    const sum = judgment.evidence.reduce((acc, e) => acc + e.contribution, 0);
    expect(judgment.judgedScore).toBe(sum);
    expect(judgment.recommendation.rationale).toBeTruthy();
    expect(judgment.countercase.length).toBeGreaterThan(0);
  });

  it('weak synthetic volume does not outrank small independent demand', () => {
    const synthetic = buildDemandMap(
      Array.from({ length: 40 }, (_, i) =>
        normalizeDemandSignal(
          observation({
            request: `fleet variant ${i}`,
            provenance: { kind: 'internal-fleet', sourceKey: `bot-${i}` },
          })
        )
      )
    )[0];
    const real = customerCluster(2);
    const context = {
      jobImportance: 1,
      graphLeverage: 1,
      revenueProximity: 1,
      primitiveReuse: 1,
      assetCompounding: 1,
    };
    const syntheticJudgment = judgeCluster(synthetic, context);
    const realJudgment = judgeCluster(real, context);
    expect(syntheticJudgment.disposition).toBe('noise');
    expect(['build-when-capacity', 'urgent-candidate']).toContain(
      realJudgment.disposition
    );
  });

  it('runs prior-art research only for consequential dispositions', () => {
    const researcher = vi.fn(() => ({
      status: 'researched' as const,
      closestAnalogue: 'FanCRM blast tools',
      outcome: 'persisted' as const,
      summary: 'Analogue persisted as a niche feature.',
      jovieDifference: 'Jovie owns the fan graph, not just messaging.',
    }));

    const weak = judgeCluster(customerCluster(1), {}, researcher);
    expect(weak.priorArt.status).not.toBe('researched');
    expect(researcher).not.toHaveBeenCalled();

    const strong = judgeCluster(customerCluster(6), {}, researcher);
    expect(researcher).toHaveBeenCalledTimes(1);
    expect(strong.priorArt.status).toBe('researched');
    expect(strong.priorArt.jovieDifference).toContain('Jovie');
  });

  it('marks prior art unavailable when a consequential call has no researcher', () => {
    const judgment = judgeCluster(customerCluster(6));
    expect(judgment.priorArt.status).toBe('unavailable');
  });

  it('does not run prior art for routine weak signals', () => {
    const synthetic = buildDemandMap([
      normalizeDemandSignal(
        observation({
          provenance: { kind: 'internal-synthetic', sourceKey: 'sim' },
        })
      ),
    ])[0];
    const judgment = judgeCluster(synthetic, { jobImportance: 1 });
    expect(judgment.priorArt.status).toBe('not-required');
    expect(judgment.disposition).toBe('noise');
  });

  it('caps dispositions at investigate when the cone gate is RED', () => {
    const judgment = judgeCluster(customerCluster(6), { gateStatus: 'red' });
    expect(judgment.disposition).toBe('investigate');
    expect(judgment.overrideReasons.join(' ')).toContain('RED');
  });

  it('escalates ambiguous high-value tradeoffs to human review', () => {
    const judgment = judgeCluster(customerCluster(6), {
      implementationCost: 0.9,
      fragmentationRisk: 0.5,
    });
    expect(judgment.disposition).toBe('human-escalation');
    expect(judgment.overrideReasons.join(' ')).toContain('ambiguous');
  });

  it('escalates when the closest analogue failed', () => {
    const judgment = judgeCluster(customerCluster(6), {}, () => ({
      status: 'researched' as const,
      closestAnalogue: 'Generic fan-blast SaaS',
      outcome: 'failed' as const,
      summary: 'Churned after artists saw no fan-graph lift.',
      jovieDifference: 'Jovie demand maps to owned fan graph nodes.',
    }));
    expect(judgment.disposition).toBe('human-escalation');
    expect(judgment.countercase).toContain('analogue failed');
  });

  it('keeps human-gated capabilities escalated even under a RED cone', () => {
    const cluster = buildDemandMap([
      normalizeDemandSignal(observation({ requiresHumanGate: true })),
    ])[0];
    const judgment = judgeCluster(cluster, { gateStatus: 'red' });
    expect(judgment.disposition).toBe('human-escalation');
  });

  it('reports confidence tiers from evidence quality', () => {
    expect(judgeCluster(customerCluster(6)).confidence).toBe('high');
    expect(judgeCluster(customerCluster(1)).confidence).toBe('medium');
    const synthetic = buildDemandMap([
      normalizeDemandSignal(
        observation({
          provenance: { kind: 'internal-synthetic', sourceKey: 'sim' },
        })
      ),
    ])[0];
    expect(judgeCluster(synthetic).confidence).toBe('low');
  });
});

describe('judgeAll', () => {
  it('judges every cluster with per-cluster context', () => {
    const clusters = buildDemandMap([
      normalizeDemandSignal(observation()),
      normalizeDemandSignal(
        observation({
          request: 'other',
          capability: 'merch-drops',
          provenance: { kind: 'internal-fleet', sourceKey: 'f' },
        })
      ),
    ]);
    const judgments = judgeAll(clusters, {
      contextFor: () => ({ jobImportance: 0.5 }),
    });
    expect(judgments).toHaveLength(clusters.length);
    for (const j of judgments) {
      expect(j.evidence.length).toBeGreaterThan(0);
      expect(j.disposition).toBeTruthy();
    }
  });
});
