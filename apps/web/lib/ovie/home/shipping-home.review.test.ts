import { describe, expect, it } from 'vitest';
import { isAskEvidenceMissing } from '@/lib/home-loop/contract';
import type { OvieCertificationRow } from '@/lib/ovie/certifications/types';
import type { OvieInboxCase } from '@/lib/ovie/inbox';
import { INTERACTION_CASE_CONTRACT } from '@/lib/ovie/interaction-case';
import { buildOvieAsks } from './shipping-home';

function reviewCase(
  overrides: Partial<OvieInboxCase> & {
    readonly receipts?: OvieCertificationRow['evidence'];
  } = {}
): OvieInboxCase {
  const { receipts, ...rest } = overrides;
  return {
    contract: INTERACTION_CASE_CONTRACT,
    id: 'certification:marketing_components:hero',
    kind: 'certification',
    source: { system: 'certification', id: 'hero', revision: 'digest' },
    title: 'Hero',
    recommendation: 'Review the evidence and certify or request changes.',
    owner: 'founder',
    state: 'needs_you',
    priority: 2,
    createdAt: '2026-10-20T18:00:00.000Z',
    nextAction: null,
    waitingUntil: null,
    confidence: null,
    evidence: [],
    body: 'Marketing',
    decisionTarget: {
      kind: 'certification',
      id: 'hero',
      evidenceDigest: 'digest',
    },
    ...(receipts
      ? {
          certification: {
            row: { evidence: receipts } as unknown as OvieCertificationRow,
            card: null,
          },
        }
      : {}),
    ...rest,
  };
}

const receipt = (
  tier: OvieCertificationRow['evidence'][number]['tier'],
  status: OvieCertificationRow['evidence'][number]['status']
): OvieCertificationRow['evidence'][number] => ({
  id: `${tier}-${status}`,
  tier,
  status,
  summary: `${tier} ran`,
  href: null,
  ref: `receipts/${tier}.json`,
});

describe('buildOvieAsks review evidence', () => {
  it('marks a certification with no evidence as missing evidence', () => {
    const [ask] = buildOvieAsks({ cases: [reviewCase()], issues: [] });
    expect(ask).toMatchObject({
      actionLabel: 'Certify',
      requiresEvidence: true,
      evidenceSummary: null,
    });
    expect(ask && isAskEvidenceMissing(ask)).toBe(true);
  });

  it('summarizes tier receipts, capping the inline list', () => {
    const [ask] = buildOvieAsks({
      cases: [
        reviewCase({
          receipts: [
            receipt('tests_coverage', 'passed'),
            receipt('visual_proof', 'passed'),
            receipt('invariant_evaluation', 'missing'),
            receipt('required_variants', 'passed'),
          ],
        }),
      ],
      issues: [],
    });
    expect(ask?.evidenceSummary).toBe(
      'Tests passed · Visual passed · Invariants missing · +1 more'
    );
    expect(ask && isAskEvidenceMissing(ask)).toBe(false);
  });

  it('treats evidence links as evidence', () => {
    const [ask] = buildOvieAsks({
      cases: [reviewCase({ evidence: ['https://example.test/receipt'] })],
      issues: [],
    });
    expect(ask && isAskEvidenceMissing(ask)).toBe(false);
  });

  it('requires evidence for visual review but not for other decisions', () => {
    const [visual, summer] = buildOvieAsks({
      cases: [
        reviewCase({
          id: 'visual:run:surface',
          kind: 'design',
          decisionTarget: { kind: 'visual', id: 'run', surfaceId: 'surface' },
        }),
        reviewCase({
          id: 'summer-card:1',
          kind: 'spend',
          decisionTarget: { kind: 'summer', id: '1' },
        }),
      ],
      issues: [],
    });
    expect(visual?.requiresEvidence).toBe(true);
    expect(summer?.requiresEvidence).toBeUndefined();
  });
});
