import { describe, expect, it, vi } from 'vitest';
import type {
  JudgeScore,
  RouteJudges,
  StageJudge,
} from '../design-ci-judge-dispatch';
import { loadFactoryBrief } from './brief';
import { dryProviders, fixtureTransport, liveProviders } from './providers';
import { fixtureCaptures } from './render-measurer';
import {
  auditVisualAdmission,
  buildVisualGateReceipts,
  liveVisualJudges,
  runVisualReview,
  sameFamilyFinding,
  type VisualReviewOutcome,
} from './visual-review';

const PRODUCER = 'anthropic/claude-opus-5.5';
const DIGEST = `sha256:${'c'.repeat(64)}`;
const captures = fixtureCaptures('/solutions/founders', {
  cls: 0,
  lcpMs: 1200,
});
const request = {
  pageId: 'solutions-founders',
  captures,
  producerModel: PRODUCER,
};

function stage(id: string | null, score: number | null): StageJudge {
  return {
    id,
    run: vi.fn(
      async (): Promise<JudgeScore> => ({
        judge: id ?? 'none',
        score,
        verdict:
          score === null ? 'insufficient' : score < 0.4 ? 'fail' : 'pass',
        reason: score === null ? 'judge-error' : null,
        notes: score !== null && score < 0.4 ? 'competing-hero' : '',
      })
    ),
  };
}

const judges = (cheap: number | null, flagship: number | null = 0.9) =>
  ({
    cheap: stage('openai/gpt-5.6-luna', cheap),
    flagship: stage('zai/glm-5.3', flagship),
  }) satisfies RouteJudges;

function admit(review: VisualReviewOutcome, candidateDigest = DIGEST) {
  return auditVisualAdmission({
    candidateDigest,
    generatorModelId: PRODUCER,
    receipts: buildVisualGateReceipts({
      candidateDigest: DIGEST,
      captures,
      review,
      producerModel: PRODUCER,
    }),
  }).map(finding => finding.code);
}

describe('runVisualReview', () => {
  it('passes when a cross-family judge passes every viewport', async () => {
    const pair = judges(0.9);
    const review = await runVisualReview(request, pair);

    expect(review).toMatchObject({
      status: 'reviewed',
      verdict: 'pass',
      judgeModel: 'openai/gpt-5.6-luna',
      score: 0.9,
    });
    expect(pair.cheap.run).toHaveBeenCalledTimes(2);
    expect(pair.flagship.run).not.toHaveBeenCalled();
    expect(admit(review)).toEqual([]);
  });

  it('escalates a borderline score to the flagship, which decides', async () => {
    const review = await runVisualReview(request, judges(0.5, 0.2));

    expect(review).toMatchObject({
      status: 'reviewed',
      verdict: 'fail',
      judgeModel: 'zai/glm-5.3',
    });
    expect(admit(review)).toEqual(['failed-taste-gate']);
  });

  it('names the flagship when only one viewport escalated to it', async () => {
    const cheap = stage('openai/gpt-5.6-luna', 0.9);
    let calls = 0;
    cheap.run = vi.fn(async () => ({
      judge: 'openai/gpt-5.6-luna',
      score: calls++ === 0 ? 0.5 : 0.9,
      verdict: 'pass' as const,
      reason: null,
      notes: '',
    }));
    const review = await runVisualReview(request, {
      cheap,
      flagship: stage('zai/glm-5.3', 0.8),
    });

    expect(review).toMatchObject({
      status: 'reviewed',
      verdict: 'pass',
      judgeModel: 'zai/glm-5.3',
      score: 0.8,
    });
  });

  it('rejects a judge from the producer family before judging', async () => {
    const pair = {
      cheap: stage('anthropic/claude-sonnet-5', 0.99),
      flagship: stage('openai/gpt-5.6-sol', 0.99),
    };
    const review = await runVisualReview(request, pair);

    expect(review).toMatchObject({ status: 'reviewed', verdict: 'fail' });
    expect(pair.cheap.run).not.toHaveBeenCalled();
    const receipt = buildVisualGateReceipts({
      candidateDigest: DIGEST,
      captures,
      review,
      producerModel: PRODUCER,
    }).find(r => r.gateId === 'visual-review');
    expect(receipt?.findings).toHaveLength(1);
    expect(admit(review)).toEqual(['failed-taste-gate']);
  });

  it('is credentials-unavailable with no judge, no screenshots or no verdict', async () => {
    await expect(
      runVisualReview(request, {
        cheap: stage(null, null),
        flagship: stage(null, null),
      })
    ).resolves.toMatchObject({ status: 'credentials-unavailable' });
    await expect(
      runVisualReview({ ...request, captures: [] }, judges(0.9))
    ).resolves.toMatchObject({
      status: 'credentials-unavailable',
      reason: 'no rendered screenshots to review',
    });
    await expect(runVisualReview(request, judges(null))).resolves.toEqual({
      status: 'credentials-unavailable',
      reason: 'visual review at 390 undecided: judge-error',
    });
  });
});

describe('visual taste admission', () => {
  it('blocks admission when the visual-review receipt is missing', () => {
    expect(
      admit({ status: 'credentials-unavailable', reason: 'no judge' })
    ).toEqual(['missing-taste-gate']);
  });

  it('blocks a receipt bound to a different candidate digest', async () => {
    const review = await runVisualReview(request, judges(0.9));

    expect(admit(review, `sha256:${'d'.repeat(64)}`)).toEqual([
      'stale-gate-receipt',
      'stale-gate-receipt',
    ]);
  });

  it('fails a same-family reviewer even if it reports a pass', () => {
    const receipts = buildVisualGateReceipts({
      candidateDigest: DIGEST,
      captures,
      review: {
        status: 'reviewed',
        judgeModel: 'anthropic/claude-sonnet-5',
        verdict: 'pass',
        score: 1,
        findings: [],
        judges: [],
      },
      producerModel: PRODUCER,
    });

    expect(receipts.find(r => r.gateId === 'visual-review')).toMatchObject({
      verdict: 'fail',
      reviewerModelId: 'anthropic/claude-sonnet-5',
    });
    expect(sameFamilyFinding('openai/gpt-5.6-luna', PRODUCER)).toBeNull();
    expect(sameFamilyFinding('anthropic/x', '')).toBeNull();
  });

  it('fails responsive-accessibility on a missing viewport or DOM finding', async () => {
    const [mobile] = captures;
    const receipts = buildVisualGateReceipts({
      candidateDigest: DIGEST,
      captures: [
        {
          ...mobile!,
          domFindings: [
            { kind: 'clipped-heading', message: 'h2', elements: [] },
          ],
        },
      ],
      review: { status: 'credentials-unavailable', reason: 'x' },
      producerModel: PRODUCER,
    });

    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      gateId: 'responsive-accessibility',
      verdict: 'fail',
    });
    expect(receipts[0]?.findings.join(' ')).toMatch(/1440.*clipped-heading/s);
  });
});

describe('liveVisualJudges', () => {
  it('seats no judge when nothing is reachable', async () => {
    const loader = vi.fn();
    const pair = await liveVisualJudges(null, PRODUCER, loader);

    expect(pair.cheap.id).toBeNull();
    expect(loader).not.toHaveBeenCalled();
    await expect(pair.cheap.run({} as never)).rejects.toThrow(/no reachable/);
  });

  it.each([
    [PRODUCER, 'openai/gpt-5.6-luna'],
    ['openai/gpt-5.6-sol', 'anthropic/claude-sonnet-5'],
  ])(
    'never seats the %s producer family as an escalation judge',
    async (producer, cheap) => {
      const pair = await liveVisualJudges(
        fixtureTransport(),
        producer,
        async () => ({
          evaluateArt: vi.fn(),
          subscriptionVisionTransport: () => vi.fn(),
        })
      );

      expect(pair.cheap.id).toBe(cheap);
      expect(pair.flagship.id).toBeNull();
      await expect(
        runVisualReview(
          { ...request, producerModel: producer },
          { ...pair, cheap: stage(pair.cheap.id, 0.5) }
        )
      ).resolves.toMatchObject({
        status: 'credentials-unavailable',
        reason: 'visual review at 390 undecided: credentials-unavailable',
      });
      await expect(
        runVisualReview(
          { ...request, producerModel: producer },
          { ...pair, cheap: stage(pair.cheap.id, 0.9) }
        )
      ).resolves.toMatchObject({ status: 'reviewed', verdict: 'pass' });
    }
  );
});

describe('providers.reviewVisual', () => {
  const brief = loadFactoryBrief('solutions', 'founders');

  it('dry runs review with a fixture judge outside the producer family', async () => {
    await expect(
      dryProviders(brief).reviewVisual({
        ...request,
        producerModel: `fixture:${PRODUCER}`,
      })
    ).resolves.toMatchObject({
      status: 'reviewed',
      judgeModel: 'fixture:openai/gpt-5.6-luna',
      verdict: 'pass',
    });
  });

  it('live runs report credentials-unavailable with no transport', async () => {
    await expect(liveProviders(null).reviewVisual(request)).resolves.toEqual({
      status: 'credentials-unavailable',
      reason: 'no cross-family vision judge is reachable from this machine',
    });
  });
});
