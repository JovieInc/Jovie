import { describe, expect, it } from 'vitest';
import type {
  ChannelPackagingRules,
  ExperimentOutcome,
} from '@/lib/services/packaging-intelligence/channel-rules';
import {
  applyExperimentOutcome,
  CONFIDENCE_THRESHOLD,
  MIN_SAMPLE_SIZE,
  resolvePackagingPriors,
} from '@/lib/services/packaging-intelligence/channel-rules';
import {
  getNichePriors,
  PACKAGING_NICHE_PRIORS,
  packagingNicheSchema,
} from '@/lib/services/packaging-intelligence/types';

const BASE_OUTCOME: ExperimentOutcome = {
  experimentId: 'exp-001',
  channelId: 'channel-abc',
  topic: null,
  dimension: 'face',
  variantA: { hasFace: false },
  variantB: { hasFace: true },
  winner: 'B',
  liftPercent: 18,
  sampleSize: 500,
  confidence: 0.95,
  recordedAt: '2026-07-01T00:00:00.000Z',
};

describe('PACKAGING_NICHE_PRIORS', () => {
  it('includes textEffect and titleLengthBias for every niche', () => {
    for (const niche of packagingNicheSchema.options) {
      const prior = PACKAGING_NICHE_PRIORS[niche];
      expect(prior.source).toBe('1of10');
      expect(['helps', 'hurts', 'neutral']).toContain(prior.textEffect);
      expect(['short', 'medium', 'long']).toContain(prior.titleLengthBias);
    }
  });

  it('gaming: face hurts + text hurts (busy thumbnails) + short titles', () => {
    const p = getNichePriors('gaming');
    expect(p.faceEffect).toBe('hurts');
    expect(p.textEffect).toBe('hurts');
    expect(p.titleLengthBias).toBe('short');
  });

  it('education: face neutral + text helps + medium titles', () => {
    const p = getNichePriors('education');
    expect(p.faceEffect).toBe('neutral');
    expect(p.textEffect).toBe('helps');
    expect(p.titleLengthBias).toBe('medium');
  });

  it('finance: face neutral + text helps + long titles', () => {
    const p = getNichePriors('finance');
    expect(p.faceEffect).toBe('neutral');
    expect(p.textEffect).toBe('helps');
    expect(p.titleLengthBias).toBe('long');
  });
});

describe('applyExperimentOutcome', () => {
  it('creates a new channel rule from a single experiment', () => {
    const result = applyExperimentOutcome(null, BASE_OUTCOME);

    expect(result.channelId).toBe('channel-abc');
    expect(result.topic).toBeNull();
    expect(result.dimensions.face).toMatchObject({
      liftDirection: 'positive',
      liftPercent: 18,
      confidence: 0.95,
      sampleSize: 500,
    });
    expect(result.dimensions.face?.provenance).toHaveLength(1);
    expect(result.dimensions.face?.provenance[0]).toMatchObject({
      experimentId: 'exp-001',
      outcome: 'win',
      recordedAt: '2026-07-01T00:00:00.000Z',
    });
  });

  it('records outcome as loss when variant A wins', () => {
    const outcome: ExperimentOutcome = {
      ...BASE_OUTCOME,
      winner: 'A',
      liftPercent: -12,
    };
    const result = applyExperimentOutcome(null, outcome);
    expect(result.dimensions.face?.provenance[0]?.outcome).toBe('loss');
    expect(result.dimensions.face?.liftDirection).toBe('negative');
  });

  it('records outcome as inconclusive when winner is inconclusive', () => {
    const outcome: ExperimentOutcome = {
      ...BASE_OUTCOME,
      winner: 'inconclusive',
      liftPercent: 0,
    };
    const result = applyExperimentOutcome(null, outcome);
    expect(result.dimensions.face?.provenance[0]?.outcome).toBe('inconclusive');
    expect(result.dimensions.face?.liftDirection).toBe('neutral');
  });

  it('weighted-averages lift and confidence across experiments', () => {
    // Experiment 1: 18% lift, n=500, conf=0.95
    const first = applyExperimentOutcome(null, BASE_OUTCOME);

    // Experiment 2: 6% lift, n=100, conf=0.70
    const second = applyExperimentOutcome(first, {
      ...BASE_OUTCOME,
      experimentId: 'exp-002',
      liftPercent: 6,
      sampleSize: 100,
      confidence: 0.7,
      recordedAt: '2026-07-05T00:00:00.000Z',
    });

    const rule = second.dimensions.face!;
    // Weighted lift: (18*500 + 6*100) / 600 = (9000+600)/600 = 16
    expect(rule.liftPercent).toBeCloseTo(16, 4);
    // Weighted confidence: (0.95*500 + 0.70*100) / 600 ≈ 0.9083
    expect(rule.confidence).toBeCloseTo((0.95 * 500 + 0.7 * 100) / 600, 4);
    expect(rule.sampleSize).toBe(600);
    expect(rule.provenance).toHaveLength(2);
  });

  it('preserves existing dimensions when adding a new one', () => {
    const withFace = applyExperimentOutcome(null, BASE_OUTCOME);
    const withBoth = applyExperimentOutcome(withFace, {
      ...BASE_OUTCOME,
      experimentId: 'exp-text-001',
      dimension: 'text',
      variantA: { hasText: false },
      variantB: { hasText: true },
      liftPercent: 9,
    });

    expect(withBoth.dimensions.face).toBeDefined();
    expect(withBoth.dimensions.text).toBeDefined();
    expect(withBoth.dimensions.text?.liftPercent).toBe(9);
  });

  it('preserves createdAt and updates updatedAt', () => {
    const first = applyExperimentOutcome(null, {
      ...BASE_OUTCOME,
      recordedAt: '2026-06-01T00:00:00.000Z',
    });
    expect(first.createdAt).toBe('2026-06-01T00:00:00.000Z');

    const second = applyExperimentOutcome(first, {
      ...BASE_OUTCOME,
      experimentId: 'exp-002',
      recordedAt: '2026-07-01T00:00:00.000Z',
    });
    expect(second.createdAt).toBe('2026-06-01T00:00:00.000Z');
    expect(second.updatedAt).toBe('2026-07-01T00:00:00.000Z');
  });
});

describe('resolvePackagingPriors', () => {
  const entertainmentPriors = getNichePriors('entertainment');

  it('returns global priors unchanged when channelRules is null', () => {
    expect(resolvePackagingPriors(null, entertainmentPriors)).toEqual(
      entertainmentPriors
    );
  });

  it('returns global priors when sample size is below threshold', () => {
    const rules: ChannelPackagingRules = {
      channelId: 'channel-abc',
      topic: null,
      dimensions: {
        face: {
          liftDirection: 'negative',
          liftPercent: -20,
          confidence: 0.95,
          sampleSize: MIN_SAMPLE_SIZE - 1, // below threshold
          provenance: [],
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      },
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    };

    const resolved = resolvePackagingPriors(rules, entertainmentPriors);
    // Should still use global prior (helps) not channel rule (negative → hurts)
    expect(resolved.faceEffect).toBe(entertainmentPriors.faceEffect);
    expect(resolved.source).toBe('1of10');
  });

  it('returns global priors when confidence is below threshold', () => {
    const rules: ChannelPackagingRules = {
      channelId: 'channel-abc',
      topic: null,
      dimensions: {
        face: {
          liftDirection: 'negative',
          liftPercent: -20,
          confidence: CONFIDENCE_THRESHOLD - 0.01, // below threshold
          sampleSize: MIN_SAMPLE_SIZE + 500,
          provenance: [],
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      },
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    };

    const resolved = resolvePackagingPriors(rules, entertainmentPriors);
    expect(resolved.source).toBe('1of10');
  });

  it('overrides face prior when channel rule meets confidence + sample threshold', () => {
    const rules: ChannelPackagingRules = {
      channelId: 'channel-abc',
      topic: null,
      dimensions: {
        face: {
          liftDirection: 'negative',
          liftPercent: -15,
          confidence: CONFIDENCE_THRESHOLD,
          sampleSize: MIN_SAMPLE_SIZE,
          provenance: [],
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      },
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    };

    const globalPriors = getNichePriors('lifestyle_vlog'); // faceEffect: helps
    const resolved = resolvePackagingPriors(rules, globalPriors);

    // Observed data overrides the prior
    expect(resolved.faceEffect).toBe('hurts');
    expect(resolved.source).toBe('observed');
    // Unaffected dimensions stay at global prior
    expect(resolved.textEffect).toBe(globalPriors.textEffect);
    expect(resolved.titleLengthBias).toBe(globalPriors.titleLengthBias);
  });

  it('overrides text and titleLength priors independently', () => {
    const rules: ChannelPackagingRules = {
      channelId: 'channel-abc',
      topic: 'tutorials',
      dimensions: {
        text: {
          liftDirection: 'positive',
          liftPercent: 22,
          confidence: 0.92,
          sampleSize: 300,
          provenance: [],
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
        titleLength: {
          liftDirection: 'negative',
          liftPercent: -8,
          confidence: 0.85,
          sampleSize: 200,
          provenance: [],
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      },
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    };

    const globalPriors = getNichePriors('gaming');
    // gaming global: textEffect=hurts, titleLengthBias=short
    const resolved = resolvePackagingPriors(rules, globalPriors);

    expect(resolved.textEffect).toBe('helps'); // overridden: positive lift
    expect(resolved.titleLengthBias).toBe('short'); // overridden: negative lift → short
    expect(resolved.source).toBe('observed');
    // face not in channel rules → falls through to global
    expect(resolved.faceEffect).toBe(globalPriors.faceEffect);
  });

  it('round-trip: applyExperimentOutcome then resolvePackagingPriors produces observed source', () => {
    const outcome: ExperimentOutcome = {
      ...BASE_OUTCOME,
      sampleSize: MIN_SAMPLE_SIZE,
      confidence: CONFIDENCE_THRESHOLD,
      liftPercent: 10,
      winner: 'B',
    };
    const channelRules = applyExperimentOutcome(null, outcome);
    const globalPriors = getNichePriors('entertainment');
    const resolved = resolvePackagingPriors(channelRules, globalPriors);

    expect(resolved.source).toBe('observed');
    expect(resolved.faceEffect).toBe('helps'); // positive lift → helps
  });
});
