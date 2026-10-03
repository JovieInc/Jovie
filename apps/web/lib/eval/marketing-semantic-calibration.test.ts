import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  type MarketingSemanticReviewInput,
  reviewMarketingSemantics,
} from '@/data/marketing/semanticReview';
import { SYNTHETIC_JEV_SEMANTIC_FIXTURES } from '@/tests/fixtures/marketing/jev-semantic-fixtures';
import {
  type MarketingSemanticCalibrationCase,
  parseMarketingSemanticCalibrationReport,
  readMarketingSemanticCalibrationReport,
  runMarketingSemanticCalibration,
  serializeMarketingSemanticCalibrationReport,
  validateMarketingCalibrationCorpus,
  writeMarketingSemanticCalibrationReport,
} from './marketing-semantic-calibration';

const generatedAt = '2026-09-20T12:00:00.000Z';

type Fixture = (typeof SYNTHETIC_JEV_SEMANTIC_FIXTURES)[number];

function makeCase(
  fixture: Fixture,
  overrides: Partial<MarketingSemanticCalibrationCase> = {}
): MarketingSemanticCalibrationCase {
  return {
    id: fixture.id,
    caseId: fixture.id,
    pageFamily:
      fixture.split === 'development' ? 'pricing' : 'onboarding-error',
    split: fixture.split,
    synthetic: true,
    caseOrigin: 'synthetic-fixture',
    labelSource: 'synthetic-hand-authored',
    referenceLabel: fixture.expectedVerdict === 'supported' ? 'pass' : 'fail',
    baselineOutcome: fixture.expectedVerdict === 'supported' ? 'pass' : 'fail',
    input: fixture.input,
    ...overrides,
  };
}

const baseCases: readonly MarketingSemanticCalibrationCase[] =
  SYNTHETIC_JEV_SEMANTIC_FIXTURES.map(fixture =>
    makeCase(fixture, {
      preference:
        fixture.id === 'dev-pricing-claim-supported'
          ? {
              candidateIds: ['control', 'candidate'],
              preferredCandidateId: 'candidate',
              blinded: true,
              reversed: true,
              labelSource: 'synthetic-hand-authored',
            }
          : undefined,
    })
  );

function calibrationCases(): readonly MarketingSemanticCalibrationCase[] {
  const supported = baseCases.find(
    row => row.id === 'dev-pricing-claim-supported'
  );
  const contradicted = baseCases.find(
    row => row.id === 'dev-pricing-claim-contradicted'
  );
  if (!supported || !contradicted) throw new Error('fixture setup failed');

  const staleInput = {
    ...supported.input,
    currentArtifactSha256: 'c'.repeat(64),
  } satisfies MarketingSemanticReviewInput;

  return [
    ...baseCases,
    {
      ...supported,
      id: 'dev-pricing-supported-stale-render',
      caseId: 'dev-pricing-supported-stale-render',
      input: staleInput,
      preference: undefined,
    },
    {
      ...contradicted,
      id: 'dev-pricing-contradicted-baseline-false-pass',
      caseId: 'dev-pricing-contradicted-baseline-false-pass',
      baselineOutcome: 'pass',
      preference: undefined,
    },
  ];
}

async function evaluateWithCuratedFake(row: MarketingSemanticCalibrationCase) {
  return reviewMarketingSemantics(row.input, {
    evaluate: async request => ({
      status: 'evaluated' as const,
      alignment: row.referenceLabel === 'pass' ? 'supported' : 'contradicted',
      requestFingerprint: request.fingerprint,
    }),
  });
}

describe('marketing semantic calibration harness', () => {
  it('rejects provenance mismatches, page-family leakage, and weak preference evidence', () => {
    const rows = calibrationCases();
    const leakage = validateMarketingCalibrationCorpus([
      rows[0]!,
      {
        ...rows[0]!,
        id: 'held-out-pricing-leak',
        caseId: 'held-out-pricing-leak',
        split: 'held-out',
      },
    ]);
    expect(leakage.valid).toBe(false);
    expect(leakage.errors.join('\n')).toMatch(/leaks across/);

    const provenance = validateMarketingCalibrationCorpus([
      {
        ...rows[0]!,
        id: 'bad-provenance',
        caseId: 'bad-provenance',
        synthetic: false,
      },
    ]);
    expect(provenance.valid).toBe(false);
    expect(provenance.errors.join('\n')).toMatch(
      /origin and labelSource disagree/
    );

    const weakPreference = validateMarketingCalibrationCorpus([
      {
        ...rows[0]!,
        id: 'bad-preference',
        caseId: 'bad-preference',
        preference: {
          ...rows[0]!.preference!,
          reversed: false,
        },
      },
    ]);
    expect(weakPreference.valid).toBe(false);
    expect(weakPreference.errors.join('\n')).toMatch(/blinded and reversed/);
  });

  it('compares a baseline with actual semantic observations and keeps synthetic evidence advisory', async () => {
    const rows = calibrationCases();
    const baselineCalls: string[] = [];
    const report = await runMarketingSemanticCalibration({
      cases: rows,
      generatedAt,
      enforcementRequested: true,
      evaluateBaseline: row => {
        baselineCalls.push(row.id);
        return row.baselineOutcome;
      },
      evaluateSemantic: evaluateWithCuratedFake,
    });

    expect(baselineCalls).toHaveLength(rows.length);
    expect(report.corpus.syntheticDataCannotPromote).toBe(true);
    expect(report.corpus.syntheticCaseCount).toBe(rows.length);
    expect(report.corpus.realHumanHeldOutCount).toBe(0);
    expect(report.semanticCalibration).toMatchObject({
      status: 'unqualified',
      reason: 'real-human-heldout-required',
      syntheticEvidenceOnly: true,
    });
    expect(report.baselineCalibration.reason).toBe(
      'real-human-heldout-required'
    );
    expect(report.enforcement).toMatchObject({
      requested: true,
      eligible: false,
      enabled: false,
    });

    const baselineAll = report.baseline.find(row => row.split === 'all');
    const semanticAll = report.semantic.find(row => row.split === 'all');
    const deltaAll = report.comparison.semanticMinusBaseline.find(
      (_, index) => report.comparison.semantic[index]?.split === 'all'
    );
    expect(baselineAll).toMatchObject({
      falsePassCount: 1,
      falseBlockCount: 0,
      abstentionCount: 0,
    });
    expect(semanticAll).toMatchObject({
      falsePassCount: 0,
      falseBlockCount: 1,
      abstentionCount: 2,
    });
    expect(deltaAll).toMatchObject({
      falsePassCount: -1,
      falseBlockCount: 1,
      abstentionCount: 2,
    });
    expect(report.preferences).toMatchObject({
      status: 'passed',
      total: 1,
      valid: 1,
      blindedCount: 1,
      reversedCount: 1,
    });
    expect(report.modelIdentity.configuredAliases).toContain('typesafe-ai/jev');
    expect(report.modelIdentity.resolvedVersionStatus).toBe('unknown');
    expect(report.modelIdentity.aliasOrVersionUnknown).toBe(true);
    expect(report.workflow).toMatchObject({
      semanticCalls: rows.length,
      baselineCalls: rows.length,
      estimatedCostUsd: null,
      humanReviewMinutes: null,
    });
    expect(report.workflow.unknowns).toEqual([
      'semantic-cost-not-measured',
      'human-review-time-not-measured',
    ]);

    const stale = report.caseResults.find(
      row => row.id === 'dev-pricing-supported-stale-render'
    );
    const exactOverlap = report.caseResults.find(
      row => row.id === 'dev-pricing-section-exact-overlap'
    );
    expect(stale?.semantic).toMatchObject({
      status: 'abstained',
      outcome: 'abstain',
      reasonCode: 'stale-evidence',
      requestFingerprint: null,
    });
    expect(exactOverlap?.semantic).toMatchObject({
      status: 'abstained',
      outcome: 'abstain',
      reasonCode: 'deterministic-overlap',
    });

    const evaluated = report.caseResults.find(
      row => row.id === 'dev-pricing-claim-supported'
    );
    expect(evaluated?.semantic).toMatchObject({
      status: 'evaluated',
      outcome: 'pass',
      verdict: 'supported',
      sourceSha: 'a'.repeat(40),
      artifactSha256: 'b'.repeat(64),
      evidenceFingerprint: expect.stringMatching(/^sha256:/),
    });
    expect(evaluated?.semantic.requestFingerprint).toMatch(/^sha256:/);
  });

  it('uses the real default semantic boundary without paid calls and records the abstention', async () => {
    const row = makeCase(SYNTHETIC_JEV_SEMANTIC_FIXTURES[0]!);
    const report = await runMarketingSemanticCalibration({
      cases: [row],
      generatedAt,
      evaluateSemantic: candidate => reviewMarketingSemantics(candidate.input),
    });

    expect(report.semantic[0]).toMatchObject({
      abstentionCount: 1,
      evaluatedCount: 0,
    });
    expect(report.caseResults[0]?.semantic).toMatchObject({
      status: 'abstained',
      outcome: 'abstain',
      reasonCode: 'reviewer-unavailable',
    });
  });

  it('keeps a public /pay automatic-contact transform from human promotion while binding exact artifact evidence', async () => {
    const publicPayCase: MarketingSemanticCalibrationCase = {
      id: 'public-pay-automatic-contact-transform',
      caseId: 'public-pay-automatic-contact-transform',
      pageFamily: 'pay',
      split: 'held-out',
      synthetic: true,
      caseOrigin: 'public-artifact',
      labelSource: 'synthetic-hand-authored',
      referenceLabel: 'fail',
      baselineOutcome: 'fail',
      input: {
        route: '/pay',
        pageId: 'pay',
        audience: 'independent artists collecting payments at live shows',
        objective:
          'help an artist turn a payment into a reachable fan relationship',
        sourceSha: '3d470af452e2a079f2cb96b2f49314473fd7e36e',
        artifactSha256:
          '83f35175b2eaef269ee0c890d9195f44acdfe85237ca80ca8756d28a2bde17c1',
        check: 'claim-support',
        claim: {
          id: 'pay-automatic-contact-transform',
          statement: 'Every payment automatically captures a fan contact.',
          renderedText: 'Every payment automatically captures a fan contact.',
        },
        supportingEvidence: [
          {
            id: 'pay-how-it-works-step-3',
            statement:
              'You capture their contact info. They get an automatic thank-you with links to stream your music everywhere.',
          },
        ],
      },
    };
    const report = await runMarketingSemanticCalibration({
      cases: [publicPayCase],
      enforcementRequested: true,
      evaluateSemantic: async candidate =>
        reviewMarketingSemantics(candidate.input, {
          evaluate: async request => ({
            status: 'evaluated' as const,
            alignment: 'supported' as const,
            requestFingerprint: request.fingerprint,
          }),
        }),
    });

    expect(report.semantic[0]).toMatchObject({
      falsePassCount: 1,
      referenceProvenance: 'synthetic',
    });
    expect(report.semanticCalibration.reason).toBe(
      'real-human-heldout-required'
    );
    expect(report.enforcement).toMatchObject({
      requested: true,
      eligible: false,
      enabled: false,
    });
    expect(report.modelIdentity.resolvedVersionStatus).toBe('unknown');
    expect(report.workflow.estimatedCostUsd).toBeNull();
  });

  it('abstains on spliced fingerprints, source identity, or an unconfigured model', async () => {
    const row = makeCase(SYNTHETIC_JEV_SEMANTIC_FIXTURES[0]!);
    const mismatches = [
      {
        id: 'wrong-request-fingerprint',
        patch: { requestFingerprint: 'sha256:wrong-request' },
        reasonCode: 'stale-evidence',
      },
      {
        id: 'wrong-source-sha',
        patch: { sourceSha: 'd'.repeat(40) },
        reasonCode: 'stale-evidence',
      },
      {
        id: 'wrong-model-alias',
        patch: { model: 'unconfigured/model' },
        reasonCode: 'invalid-response',
      },
    ] as const;

    for (const mismatch of mismatches) {
      const report = await runMarketingSemanticCalibration({
        cases: [{ ...row, id: mismatch.id, caseId: mismatch.id }],
        evaluateSemantic: async candidate => {
          const evaluated = await evaluateWithCuratedFake(candidate);
          return { ...evaluated, ...mismatch.patch };
        },
      });
      expect(report.caseResults[0]?.semantic).toMatchObject({
        status: 'abstained',
        outcome: 'abstain',
        reasonCode: mismatch.reasonCode,
      });
    }
  });

  it('requires a finite threshold and adequate non-abstaining human-heldout coverage', async () => {
    const row = makeCase(SYNTHETIC_JEV_SEMANTIC_FIXTURES[0]!);
    await expect(
      runMarketingSemanticCalibration({
        cases: [row],
        threshold: Number.NaN,
        evaluateSemantic: evaluateWithCuratedFake,
      })
    ).rejects.toThrow(/finite number between 0 and 1/);

    // These rows exercise the provenance contract only; their labels are test
    // data and must never be treated as production human-heldout evidence.
    const humanContractRows = Array.from({ length: 8 }, (_, index) => ({
      ...row,
      id: `human-contract-${index}`,
      caseId: `human-contract-${index}`,
      pageFamily: `human-contract-family-${index}`,
      split: 'held-out' as const,
      synthetic: false,
      caseOrigin: 'source-backed-constructed' as const,
      labelSource: 'human-review' as const,
      referenceLabel: index % 2 === 0 ? ('pass' as const) : ('fail' as const),
      baselineOutcome: index % 2 === 0 ? ('pass' as const) : ('fail' as const),
      preference: undefined,
    }));
    const report = await runMarketingSemanticCalibration({
      cases: humanContractRows,
      enforcementRequested: true,
      observationSource: 'mocked',
      evaluateSemantic: async candidate => {
        if (
          candidate.id.endsWith('-5') ||
          candidate.id.endsWith('-6') ||
          candidate.id.endsWith('-7')
        ) {
          return reviewMarketingSemantics({
            ...candidate.input,
            currentArtifactSha256: 'c'.repeat(64),
          });
        }
        return evaluateWithCuratedFake(candidate);
      },
    });
    expect(report.semanticCalibration).toMatchObject({
      status: 'unqualified',
      reason: 'human-heldout-non-abstaining-coverage-too-low',
      eligibleCaseCount: 5,
      nonAbstainingCoverage: 0.625,
      excludedAbstentions: 3,
    });
    expect(report.enforcement).toMatchObject({
      requested: true,
      eligible: false,
      enabled: false,
    });
  });

  it('round-trips a report through the eval JSON read/write boundary', async () => {
    const row = makeCase(SYNTHETIC_JEV_SEMANTIC_FIXTURES[0]!);
    const report = await runMarketingSemanticCalibration({
      cases: [row],
      generatedAt,
      evaluateSemantic: evaluateWithCuratedFake,
    });
    const serialized = serializeMarketingSemanticCalibrationReport(report);
    const parsed = parseMarketingSemanticCalibrationReport(
      JSON.parse(serialized)
    );
    expect(parsed).toEqual(report);

    const directory = await mkdtemp(
      path.join(tmpdir(), 'marketing-calibration-')
    );
    const filePath = path.join(directory, 'report.json');
    try {
      await writeMarketingSemanticCalibrationReport(filePath, report);
      await expect(
        readMarketingSemanticCalibrationReport(filePath)
      ).resolves.toEqual(report);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
