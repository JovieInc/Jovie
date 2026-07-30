import { describe, expect, it } from 'vitest';
import {
  buildOpportunityInboxData,
  mapSuggestedActionToInboxCard,
} from './opportunity-inbox-mapper';

function verifiedBrandDealPayload(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
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
    observedAt: '2026-07-29T09:30:00.000Z',
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
    ...overrides,
  };
}

describe('mapSuggestedActionToInboxCard', () => {
  it('maps verified brand deals into a provenance-aware Inbox decision', () => {
    const card = mapSuggestedActionToInboxCard({
      id: 'brand-deal-1',
      kind: 'brand_deal.opportunity',
      payload: verifiedBrandDealPayload(),
      rationale: 'Verified personal marketplace opportunity.',
      createdAt: new Date('2026-07-29T10:00:00.000Z'),
    });

    expect(card).toMatchObject({
      id: 'brand-deal-1',
      signalType: 'brand_deal',
      typeLabel: 'Brand Deal',
      title: 'Example Brand creator-performance pilot',
      why: '$7.5k-$12.5k · Alex Buyer @ Example Brand · Backstage · verified · score 75.0 · 90-day organic usage, no exclusivity',
      primaryActionLabel: 'Approve buyer',
      status: 'pending',
      category: 'brand_deal',
    });
  });

  it('does not elevate an unverified brand-deal payload', () => {
    const card = mapSuggestedActionToInboxCard({
      id: 'brand-deal-unverified',
      kind: 'brand_deal.opportunity',
      payload: {
        title: 'Unverified sponsor',
        evidenceStatus: 'unverified',
      },
      rationale: 'Public-search-only lead.',
      createdAt: new Date('2026-07-29T10:00:00.000Z'),
    });

    expect(card.category).toBe('suggestion');
    expect(card.typeLabel).toBe('Brand Deal');
    expect(card.primaryActionLabel).toBe('Approve buyer');
  });

  it('maps calendar suggestions with rationale and action labels', () => {
    const card = mapSuggestedActionToInboxCard({
      id: 'action-1',
      kind: 'calendar.create_event',
      payload: {
        title: 'Detroit listeners up 340% — book a show',
        rationale: 'Promoter email matched your Detroit growth spike.',
      },
      rationale: 'Promoter email matched your Detroit growth spike.',
      createdAt: new Date('2026-06-28T10:00:00.000Z'),
    });

    expect(card).toMatchObject({
      id: 'action-1',
      signalType: 'new_event',
      typeLabel: 'New Event',
      title: 'Detroit listeners up 340% — book a show',
      why: 'Promoter email matched your Detroit growth spike.',
      primaryActionLabel: 'Add to calendar',
      status: 'pending',
    });
  });

  it('uses the persisted signal_type when present', () => {
    const card = mapSuggestedActionToInboxCard({
      id: 'action-3',
      kind: 'unknown.kind',
      payload: { title: 'Fresh drop' },
      rationale: null,
      createdAt: new Date('2026-06-28T10:00:00.000Z'),
      signalType: 'new_song',
    });

    expect(card.signalType).toBe('new_song');
    expect(card.typeLabel).toBe('New Song');
  });

  it('falls back when payload title and rationale are missing', () => {
    const card = mapSuggestedActionToInboxCard({
      id: 'action-2',
      kind: 'unknown.kind',
      payload: {},
      rationale: null,
      createdAt: new Date('2026-06-28T10:00:00.000Z'),
    });

    expect(card.title).toBe('Untitled suggestion');
    expect(card.why).toBe('Jovie found a booking signal worth your review.');
    expect(card.primaryActionLabel).toBe('Approve');
    expect(card.signalType).toBe('other');
    expect(card.typeLabel).toBe('Suggestion');
  });
});

describe('buildOpportunityInboxData', () => {
  it('keeps unverified brand-deal rows out of the user decision surface', () => {
    const data = buildOpportunityInboxData([
      {
        id: 'brand-deal-unverified',
        kind: 'brand_deal.opportunity',
        payload: {
          title: 'A video found by public search',
          evidenceStatus: 'unverified',
        },
        rationale: 'Ownership was not proven.',
        createdAt: new Date('2026-07-29T10:00:00.000Z'),
      },
    ]);

    expect(data.cards).toEqual([]);
  });

  it('keeps noncanonical persisted brand-deal rows out of the decision surface', () => {
    const data = buildOpportunityInboxData([
      {
        id: 'brand-deal-alias',
        kind: 'ugc.booking',
        signalType: 'brand_deal',
        payload: { title: 'Unverified UGC alias' },
        rationale: 'No canonical evidence payload.',
        createdAt: new Date('2026-07-29T10:00:00.000Z'),
      },
    ]);

    expect(data.cards).toEqual([]);
  });

  it('ranks verified brand deals by the required cash-efficiency score', () => {
    const data = buildOpportunityInboxData([
      {
        id: 'newer-lower-score',
        kind: 'brand_deal.opportunity',
        signalType: 'brand_deal',
        payload: verifiedBrandDealPayload({
          title: 'Lower-score deal',
          buyerName: 'Lower Buyer',
          buyerCompany: 'Lower Brand',
          sourceReference: 'https://www.backstage.com/casting/lower',
          expectedUpfrontCashCents: 375_000,
          closeProbability: 0.4,
          repeatPotential: 1,
          creatorMinutes: 60,
        }),
        rationale: 'Verified but lower expected return per minute.',
        createdAt: new Date('2026-07-29T11:00:00.000Z'),
      },
      {
        id: 'older-higher-score',
        kind: 'brand_deal.opportunity',
        signalType: 'brand_deal',
        payload: verifiedBrandDealPayload({
          title: 'Higher-score deal',
          buyerName: 'Higher Buyer',
          buyerCompany: 'Higher Brand',
          sourceReference: 'https://www.backstage.com/casting/higher',
          expectedUpfrontCashCents: 625_000,
          closeProbability: 0.8,
          repeatPotential: 1.5,
          creatorMinutes: 60,
        }),
        rationale: 'Verified and higher expected return per minute.',
        createdAt: new Date('2026-07-29T10:00:00.000Z'),
      },
    ]);

    expect(data.cards.map(card => card.id)).toEqual([
      'older-higher-score',
      'newer-lower-score',
    ]);
    expect(data.cards[0]?.brandDealRankingScore).toBe(125);
  });

  it('includes default empty-state action cards', () => {
    const data = buildOpportunityInboxData([]);

    expect(data.cards).toEqual([]);
    expect(data.emptyActionCards).toHaveLength(2);
    expect(data.emptyActionCards[0]?.id).toBe('connect-spotify');
  });
});

describe('tour-date classification in the mapper', () => {
  it('classifies tour-date-looking calendar signals with tour category + event type', () => {
    const card = mapSuggestedActionToInboxCard({
      id: 'action-3',
      kind: 'calendar.create_event',
      payload: {
        title: 'Show at Saint Andrews Hall',
        venueName: 'Saint Andrews Hall',
        city: 'Detroit',
      },
      rationale: 'Promoter email proposed a Detroit tour stop.',
      createdAt: new Date('2026-06-28T10:00:00.000Z'),
    });

    // category drives tour-date action labels; signalType drives the typed chip.
    expect(card.category).toBe('tour_date');
    expect(card.signalType).toBe('new_event');
    expect(card.typeLabel).toBe('New Event');
    expect(card.primaryActionLabel).toBe('Confirm date');
  });

  it('keeps non-tour calendar signals as suggestions with event type', () => {
    const card = mapSuggestedActionToInboxCard({
      id: 'action-4',
      kind: 'calendar.create_event',
      payload: { title: 'Weekly catalog review' },
      rationale: 'Recurring planning block.',
      createdAt: new Date('2026-06-28T10:00:00.000Z'),
    });

    expect(card.category).toBe('suggestion');
    expect(card.signalType).toBe('new_event');
    expect(card.typeLabel).toBe('New Event');
    expect(card.primaryActionLabel).toBe('Add to calendar');
  });
});

describe('buildOpportunityInboxData tour-date sections', () => {
  it('passes tour-date sections through when provided', () => {
    const tourDates = {
      pending: [
        {
          id: 'td-1',
          title: 'Saint Andrews Hall',
          startDate: '2026-08-14T00:00:00.000Z',
          startTime: null,
          venueName: 'Saint Andrews Hall',
          location: 'Detroit, MI',
          providerLabel: 'Bandsintown',
          status: 'pending' as const,
        },
      ],
      confirmed: [],
      rejected: [],
    };

    const data = buildOpportunityInboxData([], tourDates);
    expect(data.tourDates).toEqual(tourDates);
  });

  it('omits tour-date sections when not provided', () => {
    const data = buildOpportunityInboxData([]);
    expect(data.tourDates).toBeUndefined();
  });
});
