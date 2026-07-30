import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

import { db } from '@/lib/db';
import { emitBrandDealOpportunity } from './brand-deal-opportunity-emitter';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const CONNECTOR_ACCOUNT_ID = '20000000-0000-4000-8000-000000000001';
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
};

function mockSelectResults(...results: readonly unknown[][]) {
  let call = 0;
  vi.mocked(db.select).mockImplementation(() => {
    const rows = results[call++] ?? [];
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
    } as unknown as ReturnType<typeof db.select>;
  });
}

function mockInsertResult(rows: readonly unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  vi.mocked(db.insert).mockReturnValue(
    chain as unknown as ReturnType<typeof db.insert>
  );
  return chain;
}

describe('emitBrandDealOpportunity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects malformed evidence before reading connector state', async () => {
    await expect(
      emitBrandDealOpportunity({
        userId: USER_ID,
        connectorAccountId: CONNECTOR_ACCOUNT_ID,
        payload: { ...verifiedPayload, ownershipVerified: false },
        rationale: 'Malformed evidence.',
      })
    ).resolves.toEqual({
      created: false,
      actionId: null,
      reason: 'invalid-opportunity',
    });
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects a payload that does not match the authenticated connector account', async () => {
    mockSelectResults([
      {
        id: CONNECTOR_ACCOUNT_ID,
        provider: 'gmail',
        providerAccountId: 'tim@jov.ie',
      },
    ]);

    await expect(
      emitBrandDealOpportunity({
        userId: USER_ID,
        connectorAccountId: CONNECTOR_ACCOUNT_ID,
        payload: verifiedPayload,
        rationale: 'Wrong connector.',
      })
    ).resolves.toEqual({
      created: false,
      actionId: null,
      reason: 'connector-account-mismatch',
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects a non-Gmail connector even when its account id matches', async () => {
    mockSelectResults([
      {
        id: CONNECTOR_ACCOUNT_ID,
        provider: 'google_calendar',
        providerAccountId: 't@timwhite.co',
      },
    ]);

    await expect(
      emitBrandDealOpportunity({
        userId: USER_ID,
        connectorAccountId: CONNECTOR_ACCOUNT_ID,
        payload: verifiedPayload,
        rationale: 'Wrong connector provider.',
      })
    ).resolves.toEqual({
      created: false,
      actionId: null,
      reason: 'connector-provider-unsupported',
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('keeps one pending brand-deal decision in the Inbox', async () => {
    mockSelectResults(
      [
        {
          id: CONNECTOR_ACCOUNT_ID,
          provider: 'gmail',
          providerAccountId: 't@timwhite.co',
        },
      ],
      [{ id: 'existing-action' }]
    );

    await expect(
      emitBrandDealOpportunity({
        userId: USER_ID,
        connectorAccountId: CONNECTOR_ACCOUNT_ID,
        payload: verifiedPayload,
        rationale: 'Verified personal Backstage match.',
      })
    ).resolves.toEqual({
      created: false,
      actionId: 'existing-action',
      reason: 'decision-slot-occupied',
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('inserts a verified, ranked, decision-only Inbox opportunity', async () => {
    mockSelectResults(
      [
        {
          id: CONNECTOR_ACCOUNT_ID,
          provider: 'gmail',
          providerAccountId: 't@timwhite.co',
        },
      ],
      []
    );
    const insert = mockInsertResult([{ id: 'inserted-action' }]);

    const result = await emitBrandDealOpportunity({
      userId: USER_ID,
      connectorAccountId: CONNECTOR_ACCOUNT_ID,
      payload: verifiedPayload,
      rationale: 'Verified personal Backstage match.',
    });

    expect(result.created).toBe(true);
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        kind: 'brand_deal.opportunity',
        targetConnectorAccountId: CONNECTOR_ACCOUNT_ID,
        signalType: 'brand_deal',
        status: 'pending',
        sideEffects: [],
        payload: expect.objectContaining({ rankingScore: 75 }),
      })
    );
  });
});
