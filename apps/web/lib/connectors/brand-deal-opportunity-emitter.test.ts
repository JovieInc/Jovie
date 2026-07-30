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
const EVIDENCE_OBJECT_ID = '30000000-0000-4000-8000-000000000001';
const fetchedAt = new Date();
const evidencePayload = {
  subject: 'Current paid creator campaign',
  from: 'Alex Buyer <alex@example.com>',
  date: fetchedAt.toISOString(),
  snippet:
    'This campaign brief is ready. Company: Example Brand. Budget: $10k. Deposit: 50%. 90-day organic usage. No exclusivity. One revision.',
};
const evidenceObject = {
  id: EVIDENCE_OBJECT_ID,
  connectorAccountId: CONNECTOR_ACCOUNT_ID,
  provider: 'gmail',
  kind: 'gmail_message',
  providerId: '181696d593400f5c',
  payload: evidencePayload,
  fetchedAt,
};
const connectorAccount = {
  id: CONNECTOR_ACCOUNT_ID,
  provider: 'gmail',
  providerAccountId: 't@timwhite.co',
};
function mockSelectResults(...results: readonly unknown[][]) {
  let call = 0;
  vi.mocked(db.select).mockImplementation(() => {
    const rows = results[call++] ?? [];
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
      then: (
        onFulfilled?: (value: readonly unknown[]) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) => Promise.resolve(rows).then(onFulfilled, onRejected),
    };
    return chain as unknown as ReturnType<typeof db.select>;
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

  it('rejects evidence that is not a persisted external object', async () => {
    mockSelectResults([]);

    await expect(
      emitBrandDealOpportunity({
        userId: USER_ID,
        evidenceObjectId: EVIDENCE_OBJECT_ID,
      })
    ).resolves.toEqual({
      created: false,
      actionId: null,
      reason: 'evidence-object-not-found',
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects external objects outside the native Gmail message lane', async () => {
    mockSelectResults([{ ...evidenceObject, provider: 'google_calendar' }]);

    await expect(
      emitBrandDealOpportunity({
        userId: USER_ID,
        evidenceObjectId: EVIDENCE_OBJECT_ID,
      })
    ).resolves.toEqual({
      created: false,
      actionId: null,
      reason: 'evidence-object-unsupported',
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('requires the evidence object to belong to a connected account owned by the user', async () => {
    mockSelectResults([evidenceObject], []);

    await expect(
      emitBrandDealOpportunity({
        userId: USER_ID,
        evidenceObjectId: EVIDENCE_OBJECT_ID,
      })
    ).resolves.toEqual({
      created: false,
      actionId: null,
      reason: 'connector-account-not-connected',
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects a non-Gmail connected account', async () => {
    mockSelectResults(
      [evidenceObject],
      [{ ...connectorAccount, provider: 'google_calendar' }]
    );

    await expect(
      emitBrandDealOpportunity({
        userId: USER_ID,
        evidenceObjectId: EVIDENCE_OBJECT_ID,
      })
    ).resolves.toEqual({
      created: false,
      actionId: null,
      reason: 'connector-provider-unsupported',
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects a connected Gmail that is not Tim’s approved personal mailbox', async () => {
    mockSelectResults(
      [evidenceObject],
      [{ ...connectorAccount, providerAccountId: 'tim@jov.ie' }]
    );

    await expect(
      emitBrandDealOpportunity({
        userId: USER_ID,
        evidenceObjectId: EVIDENCE_OBJECT_ID,
      })
    ).resolves.toEqual({
      created: false,
      actionId: null,
      reason: 'invalid-opportunity',
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects incomplete commercial terms after deriving provenance', async () => {
    mockSelectResults(
      [
        {
          ...evidenceObject,
          payload: {
            ...evidencePayload,
            snippet: evidencePayload.snippet.replace(
              'Deposit: 50%',
              'Deposit: 25%'
            ),
          },
        },
      ],
      [connectorAccount]
    );

    await expect(
      emitBrandDealOpportunity({
        userId: USER_ID,
        evidenceObjectId: EVIDENCE_OBJECT_ID,
      })
    ).resolves.toEqual({
      created: false,
      actionId: null,
      reason: 'invalid-opportunity',
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it.each([
    'pending',
    'approved',
  ])('refuses a new opportunity while a %s brand-deal slot exists', async _status => {
    mockSelectResults(
      [evidenceObject],
      [connectorAccount],
      [],
      [{ id: 'existing-action', status: _status }]
    );

    await expect(
      emitBrandDealOpportunity({
        userId: USER_ID,
        evidenceObjectId: EVIDENCE_OBJECT_ID,
      })
    ).resolves.toEqual({
      created: false,
      actionId: 'existing-action',
      reason: 'decision-slot-occupied',
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('refuses a new opportunity when an older approved campaign exists behind a newer rejected decision', async () => {
    mockSelectResults(
      [evidenceObject],
      [connectorAccount],
      [],
      [{ id: 'older-approved-action', status: 'approved' }]
    );

    await expect(
      emitBrandDealOpportunity({
        userId: USER_ID,
        evidenceObjectId: EVIDENCE_OBJECT_ID,
      })
    ).resolves.toEqual({
      created: false,
      actionId: 'older-approved-action',
      reason: 'decision-slot-occupied',
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('derives provenance and commercial terms from persisted evidence', async () => {
    mockSelectResults(
      [evidenceObject],
      [connectorAccount],
      [],
      [],
      [{ id: 'rejected-action', status: 'rejected' }]
    );
    const insert = mockInsertResult([{ id: 'inserted-action' }]);

    const result = await emitBrandDealOpportunity({
      userId: USER_ID,
      evidenceObjectId: EVIDENCE_OBJECT_ID,
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
        sourceRefs: [
          expect.objectContaining({
            connectorAccountId: CONNECTOR_ACCOUNT_ID,
            externalObjectId: EVIDENCE_OBJECT_ID,
            sourceType: 'personal_email',
            sourceReference: 'gmail:message:181696d593400f5c',
          }),
        ],
        payload: expect.objectContaining({
          sourceType: 'personal_email',
          sourceAccount: 't@timwhite.co',
          requiredSourceAccount: 't@timwhite.co',
          sourceReference: 'gmail:message:181696d593400f5c',
          observedAt: fetchedAt.toISOString(),
          title: 'Example Brand creator-performance campaign',
          rightsSummary: '90-day usage, no exclusivity',
          expectedUpfrontCashCents: 500_000,
          confidence: 1,
          evidenceStatus: 'verified',
          ownershipVerified: true,
          personalDealVerified: true,
          activeSponsorCampaignCount: 0,
          externalSendApproved: false,
          commercialApprovalId: null,
          rankingScore: 41.666666666666664,
        }),
      })
    );
  });

  it('refuses to re-emit evidence that already has a decided action', async () => {
    mockSelectResults(
      [evidenceObject],
      [connectorAccount],
      [
        {
          sourceRefs: [{ externalObjectId: EVIDENCE_OBJECT_ID }],
        },
      ]
    );

    await expect(
      emitBrandDealOpportunity({
        userId: USER_ID,
        evidenceObjectId: EVIDENCE_OBJECT_ID,
      })
    ).resolves.toEqual({
      created: false,
      actionId: null,
      reason: 'evidence-already-decided',
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('uses one deterministic slot generation for concurrent inserts and advances only after a terminal decision', async () => {
    mockSelectResults(
      [evidenceObject],
      [connectorAccount],
      [],
      [],
      [{ id: 'prior-rejected-action' }]
    );
    const firstInsert = mockInsertResult([{ id: 'inserted-action' }]);
    await emitBrandDealOpportunity({
      userId: USER_ID,
      evidenceObjectId: EVIDENCE_OBJECT_ID,
    });
    const firstActionId = (
      vi.mocked(firstInsert.values).mock.calls[0]?.[0] as { id: string }
    ).id;

    mockSelectResults(
      [evidenceObject],
      [connectorAccount],
      [],
      [],
      [{ id: 'prior-rejected-action' }]
    );
    const losingInsert = mockInsertResult([]);
    await expect(
      emitBrandDealOpportunity({
        userId: USER_ID,
        evidenceObjectId: EVIDENCE_OBJECT_ID,
      })
    ).resolves.toEqual({
      created: false,
      actionId: firstActionId,
      reason: 'duplicate',
    });
    expect(
      (
        vi.mocked(losingInsert.values).mock.calls[0]?.[0] as {
          id: string;
        }
      ).id
    ).toBe(firstActionId);

    mockSelectResults(
      [evidenceObject],
      [connectorAccount],
      [],
      [],
      [{ id: 'newer-rejected-action' }]
    );
    const nextGenerationInsert = mockInsertResult([{ id: 'next-action' }]);
    await emitBrandDealOpportunity({
      userId: USER_ID,
      evidenceObjectId: EVIDENCE_OBJECT_ID,
    });
    expect(
      (
        vi.mocked(nextGenerationInsert.values).mock.calls[0]?.[0] as {
          id: string;
        }
      ).id
    ).not.toBe(firstActionId);
  });
});
