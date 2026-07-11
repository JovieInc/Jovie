import { describe, expect, it } from 'vitest';
import {
  type FundraisingRegistry,
  fundraisingRegistry,
  getInvestorFacingClaims,
  validateFundraisingRegistry,
} from '@/lib/investors/fundraising-registry';

describe('fundraising registry', () => {
  it('keeps the canonical investor narrative valid', () => {
    expect(validateFundraisingRegistry(fundraisingRegistry)).toEqual([]);
    expect(fundraisingRegistry.coreSlides).toHaveLength(7);
    expect(
      new Set(fundraisingRegistry.coreSlides.map(slide => slide.id)).size
    ).toBe(fundraisingRegistry.coreSlides.length);
  });

  it('never exposes unverified claims to investors', () => {
    const investorClaims = getInvestorFacingClaims();
    expect(investorClaims.length).toBeGreaterThan(0);
    expect(investorClaims.every(claim => claim.status !== 'unverified')).toBe(
      true
    );
    expect(
      investorClaims
        .filter(claim => claim.status === 'verified')
        .every(claim => claim.provenance.length > 0)
    ).toBe(true);
  });

  it('labels every step in the operating case', () => {
    expect(fundraisingRegistry.operatingLoop.map(step => step.status)).toEqual([
      'LIVE',
      'DEMO',
      'MANUAL',
      'PLANNED',
    ]);
  });

  it('excludes unverified fundraising and traction numbers', () => {
    const serialized = JSON.stringify({
      thesis: fundraisingRegistry.thesis,
      coreSlides: fundraisingRegistry.coreSlides,
      founderLetter: fundraisingRegistry.founderLetter,
      operatingLoop: fundraisingRegistry.operatingLoop,
    });
    expect(serialized).not.toMatch(/\$25K|90M|\$500K|\$5M|208k|184K/iu);
  });

  it('keeps the appendix out of the core narrative', () => {
    expect(fundraisingRegistry.appendix.length).toBeGreaterThan(0);
    expect(
      fundraisingRegistry.coreSlides.some(slide => slide.id === 'appendix')
    ).toBe(false);
  });

  it('keeps objection references and operating metadata valid', () => {
    const claimIds = new Set(fundraisingRegistry.claims.map(claim => claim.id));
    const slideIds = new Set(
      fundraisingRegistry.coreSlides.map(slide => slide.id)
    );

    expect(fundraisingRegistry.risks).toHaveLength(15);
    for (const risk of fundraisingRegistry.risks) {
      expect([
        'communication',
        'evidence',
        'strategy',
        'investor-fit',
      ]).toContain(risk.gapClassification);
      expect(risk.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(risk.portalSections.length).toBeGreaterThan(0);
      expect(
        risk.supportingClaimIds.every(claimId => claimIds.has(claimId))
      ).toBe(true);
      expect(
        risk.affectedSlideIds.every(slideId => slideIds.has(slideId))
      ).toBe(true);
      expect(risk.recommendedCompanyAction).not.toBe('');
      expect(risk.recommendedCommunicationAction).not.toBe('');
    }
  });

  it('exposes explicit readiness sections without inventing evidence', () => {
    expect(fundraisingRegistry.currentNarrative).not.toBe('');
    expect(fundraisingRegistry.metrics).toEqual([
      expect.objectContaining({ value: null, status: 'evidence-gap' }),
    ]);
    expect(fundraisingRegistry.researchSources.length).toBeGreaterThan(0);
    expect(fundraisingRegistry.investorConversationSummaries).toEqual([]);
    expect(fundraisingRegistry.investorFaq).toHaveLength(
      fundraisingRegistry.risks.length
    );
    expect(fundraisingRegistry.investorFaq.map(item => item.riskId)).toEqual(
      fundraisingRegistry.risks.map(item => item.id)
    );
  });

  it('tracks the completion-audit objections with unknown frequency', () => {
    const required = [
      'why-now',
      'why-founder',
      'willingness-to-pay',
      'small-team-support',
      'closed-loop-credibility',
    ];
    for (const id of required) {
      const objection = fundraisingRegistry.risks.find(risk => risk.id === id);
      expect(objection).toMatchObject({
        frequency: 'unknown',
        lastUpdated: '2026-07-11',
      });
      expect(objection?.evidenceGap).not.toBe('');
      expect(objection?.recommendedCompanyAction).not.toBe('');
      expect(objection?.recommendedCommunicationAction).not.toBe('');
    }
  });

  it('rejects missing, unsafe, and mismatched core claims', () => {
    const missing = structuredClone(
      fundraisingRegistry
    ) as unknown as FundraisingRegistry;
    (missing.coreSlides[0] as { claimIds: string[] }).claimIds = [];
    expect(validateFundraisingRegistry(missing)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('requires'),
        }),
      ])
    );

    const unknown = structuredClone(
      fundraisingRegistry
    ) as unknown as FundraisingRegistry;
    (unknown.coreSlides[0] as { claimIds: string[] }).claimIds = [
      'unknown-claim',
    ];
    expect(validateFundraisingRegistry(unknown)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'Unknown claim: unknown-claim' }),
      ])
    );

    const unsafe = structuredClone(
      fundraisingRegistry
    ) as unknown as FundraisingRegistry;
    (unsafe.claims[0] as { investorFacing: boolean }).investorFacing = false;
    (unsafe.coreSlides[0] as { claimIds: string[] }).claimIds = [
      unsafe.claims[0]?.id ?? '',
    ];
    expect(validateFundraisingRegistry(unsafe)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('not approved'),
        }),
      ])
    );

    const unverified = structuredClone(
      fundraisingRegistry
    ) as unknown as FundraisingRegistry;
    (unverified.claims[0] as { status: string }).status = 'unverified';
    (unverified.coreSlides[0] as { claimIds: string[] }).claimIds = [
      unverified.claims[0]?.id ?? '',
    ];
    expect(validateFundraisingRegistry(unverified)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('not approved'),
        }),
      ])
    );

    const mismatch = structuredClone(
      fundraisingRegistry
    ) as unknown as FundraisingRegistry;
    (mismatch.coreSlides[0] as { dominantSentence: string }).dominantSentence =
      'A different sentence.';
    expect(validateFundraisingRegistry(mismatch)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('exactly'),
        }),
      ])
    );
  });

  it('rejects self-referential founder proof', () => {
    const registry = structuredClone(
      fundraisingRegistry
    ) as unknown as FundraisingRegistry;
    const founderClaim = registry.claims.find(
      claim => claim.classification === 'founder-attested'
    );
    expect(founderClaim).toBeDefined();
    (founderClaim?.provenance[0] as { href: string }).href =
      '/pitch/index.html';
    expect(validateFundraisingRegistry(registry)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('outside the pitch'),
        }),
      ])
    );
  });
});
