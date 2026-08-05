import { describe, expect, it } from 'vitest';
import {
  auditMarketingNarrativePlan,
  auditMarketingTasteAdmission,
  MARKETING_GENERATION_STAGES,
  MARKETING_STAGE_ATTEMPT_LIMITS,
  MARKETING_TASTE_GATE_IDS,
  type MarketingGateReceipt,
  type MarketingModelCandidate,
  type MarketingNarrativePlan,
  selectMarketingModelCandidate,
} from '@/data/marketing';

const candidates: readonly MarketingModelCandidate[] = [
  {
    id: 'cheap-copy',
    provider: 'provider-a',
    model: 'copy-small',
    healthy: true,
    capabilities: ['structured-output', 'editorial-compression'],
    roleScores: { 'copy-compiler': 0.8 },
    tasteAcceptanceRate: 0.75,
    costRank: 1,
    latencyRank: 1,
  },
  {
    id: 'best-copy',
    provider: 'provider-b',
    model: 'copy-large',
    healthy: true,
    capabilities: ['structured-output', 'editorial-compression'],
    roleScores: { 'copy-compiler': 0.96 },
    tasteAcceptanceRate: 0.9,
    costRank: 3,
    latencyRank: 3,
  },
  {
    id: 'unhealthy-copy',
    provider: 'provider-c',
    model: 'copy-offline',
    healthy: false,
    capabilities: ['structured-output', 'editorial-compression'],
    roleScores: { 'copy-compiler': 1 },
    tasteAcceptanceRate: 1,
    costRank: 1,
    latencyRank: 1,
  },
];

const narrative = (overrides: Partial<MarketingNarrativePlan> = {}) => ({
  pageId: 'artist-profiles',
  sections: [
    {
      sectionInstanceId: 'hero-0',
      sectionId: 'hero',
      question: 'Why is this different?',
      sectionJob: 'Define the category promise.',
      primaryResponsibility: 'adaptation',
      newInformation: 'One profile can prioritize a different action.',
      customerBelief: 'This is not a static link page.',
      evidenceRefs: ['profile-live', 'profile-tour'],
      mustNotRepeat: ['adaptation'],
    },
    {
      sectionInstanceId: 'feature-grid-0',
      sectionId: 'feature-grid',
      question: 'What can the profile hold?',
      sectionJob: 'Show the product scope.',
      primaryResponsibility: 'content coverage',
      newInformation: 'Music, shows, support, and contact live together.',
      customerBelief: 'This is a real artist destination.',
      evidenceRefs: ['profile-live'],
      mustNotRepeat: ['adaptation'],
    },
  ],
  ...overrides,
});

describe('marketing generation pipeline', () => {
  it('keeps the closed-loop stage order stable and repair budgets bounded', () => {
    expect(MARKETING_GENERATION_STAGES).toEqual([
      'truth',
      'narrative',
      'copy',
      'section-design',
      'asset-generation',
      'adversarial-review',
      'taste-admission',
    ]);
    expect(Math.max(...Object.values(MARKETING_STAGE_ATTEMPT_LIMITS))).toBe(3);
    expect(MARKETING_STAGE_ATTEMPT_LIMITS.truth).toBe(1);
    expect(MARKETING_STAGE_ATTEMPT_LIMITS['taste-admission']).toBe(1);
  });

  it('routes by capability and role quality rather than a hardcoded model name', () => {
    expect(
      selectMarketingModelCandidate({
        role: 'copy-compiler',
        candidates,
      })?.id
    ).toBe('best-copy');

    expect(
      selectMarketingModelCandidate({
        role: 'copy-compiler',
        candidates,
        excludedModelIds: ['best-copy'],
      })?.id
    ).toBe('cheap-copy');

    expect(
      selectMarketingModelCandidate({
        role: 'adversarial-reviewer',
        candidates,
      })
    ).toBeNull();
  });

  it('rejects repeated narrative responsibilities before copy begins', () => {
    const repeated = narrative({
      sections: [
        ...narrative().sections,
        {
          sectionInstanceId: 'comparison-0',
          sectionId: 'comparison',
          question: 'How does the profile adapt?',
          sectionJob: 'Explain the same mechanism again.',
          primaryResponsibility: 'adaptation',
          newInformation: 'A different fan sees a different action.',
          customerBelief: 'The profile changes with context.',
          evidenceRefs: ['profile-tour'],
          mustNotRepeat: ['adaptation'],
        },
      ],
    });

    expect(
      auditMarketingNarrativePlan(repeated).map(finding => finding.code)
    ).toContain('duplicate-primary-responsibility');
    expect(auditMarketingNarrativePlan(narrative())).toEqual([]);
  });

  it('admits one digest-bound survivor only after all ten gates pass', () => {
    const receipts: readonly MarketingGateReceipt[] =
      MARKETING_TASTE_GATE_IDS.map(gateId => ({
        gateId,
        verdict: 'pass',
        executionId: `execution-${gateId}`,
        candidateDigest: 'digest-a',
        reviewerModelId:
          gateId === 'visual-review' ? 'vision-reviewer' : undefined,
        findings: [],
      }));

    expect(
      auditMarketingTasteAdmission({
        candidateDigest: 'digest-a',
        generatorModelId: 'image-generator',
        receipts,
      })
    ).toEqual([]);

    expect(
      auditMarketingTasteAdmission({
        candidateDigest: 'digest-b',
        generatorModelId: 'vision-reviewer',
        receipts,
      }).map(finding => finding.code)
    ).toEqual(
      expect.arrayContaining(['stale-gate-receipt', 'self-reviewed-visual'])
    );
  });
});
