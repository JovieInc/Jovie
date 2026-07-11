import { describe, expect, it } from 'vitest';
import {
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
    expect(investorClaims.every(claim => claim.provenance.length > 0)).toBe(
      true
    );
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

    expect(fundraisingRegistry.risks).toHaveLength(10);
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
});
