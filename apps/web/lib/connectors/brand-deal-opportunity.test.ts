import { describe, expect, it } from 'vitest';
import {
  BRAND_DEAL_OPPORTUNITY_KIND,
  formatBrandDealOpportunityMetadata,
  parseBrandDealOpportunity,
} from './brand-deal-opportunity';

const verifiedPayload = {
  title: 'Example Brand creator-performance pilot',
  buyerName: 'Alex Buyer',
  buyerCompany: 'Example Brand',
  budgetMinCents: 750_000,
  budgetMaxCents: 1_250_000,
  currency: 'USD',
  sourceLabel: 'Backstage',
  sourceType: 'backstage',
  sourceAccount: 't@timwhite.co',
  requiredSourceAccount: 't@timwhite.co',
  sourceReference: 'https://www.backstage.com/casting/example',
  observedAt: '2026-07-29T10:00:00.000Z',
  evidenceStatus: 'verified',
  confidence: 1,
  identityMatched: true,
  ownershipVerified: true,
  personalDealVerified: true,
  relationshipType: 'authenticated_marketplace_match',
  rightsSummary: '90-day organic usage, no exclusivity',
  depositPercent: 50,
  activeSponsorCampaignCount: 0,
  includedRevisions: 1,
  usageTermDays: 90,
  exclusivity: 'none',
  routeToLyb: false,
  lybPaidFlowVerified: false,
  externalSendApproved: false,
  commercialApprovalId: null,
  expectedUpfrontCashCents: 500_000,
  closeProbability: 0.6,
  repeatPotential: 1.5,
  creatorMinutes: 60,
} as const;

describe('parseBrandDealOpportunity', () => {
  it('accepts a fully verified brand-deal payload', () => {
    expect(
      parseBrandDealOpportunity(BRAND_DEAL_OPPORTUNITY_KIND, verifiedPayload)
    ).toEqual({ ...verifiedPayload, rankingScore: 75 });
  });

  it.each([
    ['wrong kind', 'calendar.create_event', verifiedPayload],
    [
      'unverified evidence',
      BRAND_DEAL_OPPORTUNITY_KIND,
      { ...verifiedPayload, evidenceStatus: 'unverified' },
    ],
    [
      'unmatched identity',
      BRAND_DEAL_OPPORTUNITY_KIND,
      { ...verifiedPayload, identityMatched: false },
    ],
    [
      'company-side relationship',
      BRAND_DEAL_OPPORTUNITY_KIND,
      { ...verifiedPayload, relationshipType: 'company_activation' },
    ],
    [
      'wrong source account',
      BRAND_DEAL_OPPORTUNITY_KIND,
      { ...verifiedPayload, sourceAccount: 'tim@jov.ie' },
    ],
    [
      'rejects a non-Gmail personal source reference',
      BRAND_DEAL_OPPORTUNITY_KIND,
      {
        ...verifiedPayload,
        sourceType: 'personal_email',
        sourceReference: 'https://example.com/thread/123',
      },
    ],
    [
      'rejects a future observation time',
      BRAND_DEAL_OPPORTUNITY_KIND,
      { ...verifiedPayload, observedAt: '2999-01-01T00:00:00.000Z' },
    ],
    [
      'Backstage lookalike',
      BRAND_DEAL_OPPORTUNITY_KIND,
      {
        ...verifiedPayload,
        sourceReference: 'https://backstage.army/opportunity/1',
      },
    ],
    [
      'a second active campaign',
      BRAND_DEAL_OPPORTUNITY_KIND,
      { ...verifiedPayload, activeSponsorCampaignCount: 1 },
    ],
    [
      'an external send at buyer-approval time',
      BRAND_DEAL_OPPORTUNITY_KIND,
      { ...verifiedPayload, externalSendApproved: true },
    ],
    [
      'an inflated upfront-cash score',
      BRAND_DEAL_OPPORTUNITY_KIND,
      { ...verifiedPayload, expectedUpfrontCashCents: 2_000_000 },
    ],
  ])('rejects %s', (_label, kind, payload) => {
    expect(parseBrandDealOpportunity(kind, payload)).toBeNull();
  });

  it('formats buyer-facing metadata without exposing source references', () => {
    const deal = parseBrandDealOpportunity(
      BRAND_DEAL_OPPORTUNITY_KIND,
      verifiedPayload
    );
    expect(deal).not.toBeNull();
    expect(formatBrandDealOpportunityMetadata(deal!)).toBe(
      '$7.5k-$12.5k · Alex Buyer @ Example Brand · Backstage · verified · score 75.0 · 90-day organic usage, no exclusivity'
    );
  });
});
