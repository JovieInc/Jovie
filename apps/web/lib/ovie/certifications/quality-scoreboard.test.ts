import { describe, expect, it } from 'vitest';
import { memoryCertificationBackend } from './fixtures';
import {
  isQualityOutcomeReceipt,
  projectQualityScoreboard,
  QUALITY_OUTCOME_RECEIPT_SCHEMA,
  type QualityEvidenceLink,
  type QualityOutcomeReceipt,
  type QualityOutcomeReceiptKind,
} from './quality-scoreboard';
import {
  parseQualityScoreboardLedger,
  QualityScoreboardPersistenceError,
  readQualityScoreboardLedger,
  recordQualityOutcomeReceipt,
} from './quality-scoreboard-ledger';

const GENERATED_AT = '2026-10-10T00:00:00.000Z';
const WINDOW_START = '2026-10-01T00:00:00.000Z';
const SHA = 'a'.repeat(40);

function evidence(ref: string, observedAt: string): QualityEvidenceLink {
  return { ref, observedAt };
}

function base<K extends QualityOutcomeReceiptKind>(
  id: string,
  kind: K,
  occurredAt: string,
  producer: QualityOutcomeReceipt['authority']['producer']
) {
  return {
    schema: QUALITY_OUTCOME_RECEIPT_SCHEMA,
    id,
    kind,
    product: 'jov' as const,
    affectedSurface: 'production-release',
    occurredAt,
    authority: {
      producer,
      receipt: evidence(`receipt://authority/${id}`, occurredAt),
    },
  };
}

function deployment(id: string, observedAt: string) {
  return {
    commitSha: SHA,
    deploymentId: `deployment-${id}`,
    deployed: evidence(`deploy://${id}`, observedAt),
    retest: evidence(`retest://${id}`, observedAt),
  };
}

function receipts(): QualityOutcomeReceipt[] {
  return [
    {
      ...base(
        'escape-before-learning',
        'quality_escape',
        '2026-10-02T02:00:00.000Z',
        'founder'
      ),
      failureClass: 'silent-production-staleness',
      consequential: true,
      discoveredBy: 'founder',
      certificationEvidence: evidence(
        'certification://release/001',
        '2026-10-02T00:30:00.000Z'
      ),
      missedDetector: 'production-freshness',
      timeline: {
        failure: evidence('runtime://failure/001', '2026-10-02T01:00:00.000Z'),
        autonomousDetection: null,
        externalDiscovery: evidence(
          'founder://discovery/001',
          '2026-10-02T01:30:00.000Z'
        ),
        classification: evidence(
          'classifier://failure/001',
          '2026-10-02T02:00:00.000Z'
        ),
        remediation: null,
      },
    },
    {
      ...base(
        'learn-staleness',
        'learning_event',
        '2026-10-03T00:00:00.000Z',
        'learning_compiler'
      ),
      failureClass: 'silent-production-staleness',
      artifact: {
        kind: 'executable',
        ref: 'github://JovieInc/Jovie/production-freshness-guard',
      },
      evidence: evidence(
        'learning://silent-production-staleness',
        '2026-10-03T00:00:00.000Z'
      ),
      guardrail: {
        evaluations: 10,
        falsePositives: 2,
        unnecessaryBlocks: 1,
        evidence: evidence(
          'guardrail://production-freshness/replay',
          '2026-10-09T00:00:00.000Z'
        ),
      },
      siblingPreventions: [
        {
          surface: 'ovie-production',
          evidence: evidence(
            'runtime://prevention/ovie-production',
            '2026-10-08T00:00:00.000Z'
          ),
        },
      ],
    },
    {
      ...base(
        'repeat-escape',
        'quality_escape',
        '2026-10-04T04:35:00.000Z',
        'user'
      ),
      failureClass: 'silent-production-staleness',
      consequential: true,
      discoveredBy: 'user',
      certificationEvidence: evidence(
        'certification://release/002',
        '2026-10-04T03:30:00.000Z'
      ),
      missedDetector: 'production-freshness',
      timeline: {
        failure: evidence('runtime://failure/002', '2026-10-04T04:00:00.000Z'),
        autonomousDetection: evidence(
          'runtime://detection/002',
          '2026-10-04T04:05:00.000Z'
        ),
        externalDiscovery: evidence(
          'user://discovery/002',
          '2026-10-04T04:10:00.000Z'
        ),
        classification: evidence(
          'classifier://failure/002',
          '2026-10-04T04:15:00.000Z'
        ),
        remediation: evidence(
          'repair://failure/002',
          '2026-10-04T04:35:00.000Z'
        ),
      },
    },
    {
      ...base(
        'founder-rescue',
        'founder_rescue',
        '2026-10-05T00:00:00.000Z',
        'founder'
      ),
      failureClass: 'silent-production-staleness',
      rescueKind: 'repeat_explanation',
      linkedFailureReceiptId: 'repeat-escape',
      evidence: evidence(
        'founder://rescue/repeat-escape',
        '2026-10-05T00:00:00.000Z'
      ),
    },
    {
      ...base(
        'autonomous-resolution',
        'autonomous_resolution',
        '2026-10-06T06:30:00.000Z',
        'runtime'
      ),
      affectedSurface: 'public-profile',
      failureClass: 'silent-production-staleness',
      consequential: true,
      founderIntervention: false,
      detector: 'production-freshness',
      timeline: {
        failure: evidence('runtime://failure/003', '2026-10-06T06:00:00.000Z'),
        autonomousDetection: evidence(
          'runtime://detection/003',
          '2026-10-06T06:05:00.000Z'
        ),
        externalDiscovery: null,
        classification: evidence(
          'classifier://failure/003',
          '2026-10-06T06:10:00.000Z'
        ),
        remediation: evidence(
          'repair://failure/003',
          '2026-10-06T06:30:00.000Z'
        ),
      },
      deployment: deployment('003', '2026-10-06T06:30:00.000Z'),
    },
    {
      ...base(
        'verified-improvement',
        'verified_improvement',
        '2026-10-07T00:00:00.000Z',
        'certification'
      ),
      affectedSurface: 'public-profile',
      customerOutcome: 'Visitors reach a usable profile without stale content.',
      desiredDirection: 'increase',
      before: {
        value: 72,
        unit: 'fresh_profiles_percent',
        evidence: evidence(
          'analytics://profiles/before',
          '2026-10-01T00:00:00.000Z'
        ),
      },
      after: {
        value: 99,
        unit: 'fresh_profiles_percent',
        evidence: evidence(
          'analytics://profiles/after',
          '2026-10-07T00:00:00.000Z'
        ),
      },
      deployment: deployment('improvement', '2026-10-07T00:00:00.000Z'),
    },
    {
      ...base(
        'exposure',
        'exposure',
        '2026-10-08T00:00:00.000Z',
        'release_controller'
      ),
      releases: 10,
      usageEvents: 1000,
      evidence: evidence(
        'release://window/2026-10-01--2026-10-10',
        '2026-10-08T00:00:00.000Z'
      ),
    },
    {
      ...base(
        'activity',
        'engineering_activity',
        '2026-10-09T00:00:00.000Z',
        'engineering_system'
      ),
      pullRequests: 20,
      issues: 12,
      ciRuns: 45,
      merges: 18,
      evidence: evidence(
        'github://JovieInc/Jovie/activity/2026-10-01--2026-10-10',
        '2026-10-09T00:00:00.000Z'
      ),
    },
  ];
}

describe('projectQualityScoreboard', () => {
  it('fails closed when the authoritative ledger is disconnected', () => {
    const result = projectQualityScoreboard({
      receipts: null,
      generatedAt: GENERATED_AT,
      windowStart: WINDOW_START,
    });

    expect(result.source).toEqual({ status: 'disconnected', receiptCount: 0 });
    expect(result.productOutcomes.headline.qualityEscapes.value).toBeNull();
    expect(result.productOutcomes.normalizedRates.releases).toBeNull();
    expect(result.engineeringActivity.pullRequests.value).toBeNull();
  });

  it('exposes four evidence-linked outcome views and learning effectiveness', () => {
    const result = projectQualityScoreboard({
      receipts: receipts(),
      generatedAt: GENERATED_AT,
      windowStart: WINDOW_START,
    });
    const views = result.productOutcomes.views;

    expect(views.verifiedImprovements).toHaveLength(1);
    expect(views.verifiedImprovements[0]).toMatchObject({
      before: { evidence: { ref: 'analytics://profiles/before' } },
      after: { evidence: { ref: 'analytics://profiles/after' } },
      deployment: {
        deployed: { ref: 'deploy://improvement' },
        retest: { ref: 'retest://improvement' },
      },
    });
    expect(
      views.qualityEscapes.map(receipt => receipt.repeatOfLearnedClass)
    ).toEqual([true, false]);
    expect(views.autonomousResolutions).toHaveLength(1);
    expect(views.autonomousResolutions[0]?.deployment.retest.ref).toBe(
      'retest://003'
    );
    expect(views.founderRescues[0]).toMatchObject({
      failureClass: 'silent-production-staleness',
      affectedSurface: 'production-release',
      repeatOfLearnedClass: true,
    });

    expect(result.learning.repeatEscapeRateByFailureClass).toEqual([
      expect.objectContaining({
        failureClass: 'silent-production-staleness',
        escapes: 2,
        repeatEscapes: 1,
        rate: { value: 50, sampleSize: 2 },
      }),
    ]);
    expect(result.learning.consequentialFailuresDetectedAutonomously).toEqual({
      value: 66.7,
      sampleSize: 3,
    });
    expect(result.learning.timing.failureToAutonomousDetectionMinutes).toEqual({
      value: 5,
      sampleSize: 2,
    });
    expect(result.learning.executableArtifactRate).toEqual({
      value: 100,
      sampleSize: 1,
    });
    expect(result.learning.guardrailBurden).toEqual({
      evaluations: 10,
      falsePositiveRate: { value: 20, sampleSize: 10 },
      unnecessaryBlockRate: { value: 10, sampleSize: 10 },
    });
    expect(result.learning.siblingSurfacePreventions).toEqual([
      expect.objectContaining({
        failureClass: 'silent-production-staleness',
        surface: 'ovie-production',
      }),
    ]);
  });

  it('normalizes escapes and founder rescues while isolating activity diagnostics', () => {
    const result = projectQualityScoreboard({
      receipts: receipts(),
      generatedAt: GENERATED_AT,
      windowStart: WINDOW_START,
    });

    expect(result.productOutcomes.normalizedRates).toMatchObject({
      releases: 10,
      usageEvents: 1000,
      qualityEscapesPer100Releases: { value: 20, sampleSize: 10 },
      qualityEscapesPer1000UsageEvents: { value: 2, sampleSize: 1000 },
      founderRescuesPer100Releases: { value: 10, sampleSize: 10 },
      founderRescuesPer1000UsageEvents: { value: 1, sampleSize: 1000 },
    });
    expect(result.engineeringActivity).toMatchObject({
      role: 'diagnostic_only',
      pullRequests: { value: 20 },
      issues: { value: 12 },
      ciRuns: { value: 45 },
      merges: { value: 18 },
    });
    expect(result.productOutcomes.headline.verifiedImprovements).toEqual({
      value: 1,
      sampleSize: 8,
    });
  });

  it('rejects malformed authority, evidence, and duplicate receipts', () => {
    const invalidAuthority = {
      ...receipts()[0],
      authority: {
        producer: 'engineering_system',
        receipt: evidence('receipt://wrong', '2026-10-02T02:00:00.000Z'),
      },
    };
    expect(isQualityOutcomeReceipt(invalidAuthority)).toBe(false);

    const duplicate = receipts()[0];
    expect(() =>
      projectQualityScoreboard({
        receipts: duplicate ? [duplicate, duplicate] : [],
        generatedAt: GENERATED_AT,
        windowStart: WINDOW_START,
      })
    ).toThrow(/ids must be unique/u);
  });
});

describe('quality scoreboard ledger', () => {
  it('distinguishes a missing ledger and persists immutable idempotent receipts', async () => {
    const backend = memoryCertificationBackend();
    const receipt = receipts()[0];
    if (!receipt) throw new Error('fixture receipt missing');

    await expect(readQualityScoreboardLedger(backend)).resolves.toBeNull();
    await expect(
      recordQualityOutcomeReceipt({
        backend,
        receipt,
        recordedAt: GENERATED_AT,
      })
    ).resolves.toEqual({ status: 'recorded' });
    await expect(
      recordQualityOutcomeReceipt({
        backend,
        receipt,
        recordedAt: GENERATED_AT,
      })
    ).resolves.toEqual({ status: 'replayed' });
    await expect(readQualityScoreboardLedger(backend)).resolves.toMatchObject({
      receipts: { [receipt.id]: receipt },
    });

    await expect(
      recordQualityOutcomeReceipt({
        backend,
        receipt: { ...receipt, affectedSurface: 'different-surface' },
        recordedAt: GENERATED_AT,
      })
    ).rejects.toThrow(/immutable/u);
  });

  it('rejects a founder rescue until its failure receipt is stored', async () => {
    const backend = memoryCertificationBackend();
    const rescue = receipts().find(
      receipt => receipt.kind === 'founder_rescue'
    );
    const failure = receipts().find(receipt => receipt.id === 'repeat-escape');
    if (!rescue || !failure) throw new Error('fixture receipt missing');

    await expect(
      recordQualityOutcomeReceipt({
        backend,
        receipt: rescue,
        recordedAt: GENERATED_AT,
      })
    ).rejects.toThrow(/exact failure receipt/u);

    await recordQualityOutcomeReceipt({
      backend,
      receipt: failure,
      recordedAt: GENERATED_AT,
    });
    await expect(
      recordQualityOutcomeReceipt({
        backend,
        receipt: rescue,
        recordedAt: GENERATED_AT,
      })
    ).resolves.toEqual({ status: 'recorded' });
  });

  it('fails closed on malformed persisted receipts', () => {
    expect(() =>
      parseQualityScoreboardLedger({
        schemaVersion: 1,
        contract: 'jovie.quality-scoreboard-ledger/v1',
        receipts: { broken: { id: 'broken' } },
        updatedAt: GENERATED_AT,
      })
    ).toThrow(QualityScoreboardPersistenceError);
  });
});
