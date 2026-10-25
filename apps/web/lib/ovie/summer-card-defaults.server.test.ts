import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  insertReturning: vi.fn(),
  insertValues: vi.fn(),
  updateReturning: vi.fn(),
  updateSet: vi.fn(),
  selectLimit: vi.fn(),
  listLimit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: (values: unknown) => {
        hoisted.insertValues(values);
        return {
          onConflictDoNothing: () => ({ returning: hoisted.insertReturning }),
        };
      },
    }),
    update: () => ({
      set: (values: unknown) => {
        hoisted.updateSet(values);
        return { where: () => ({ returning: hoisted.updateReturning }) };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: hoisted.selectLimit,
          orderBy: () => ({ limit: hoisted.listLimit }),
        }),
      }),
    }),
  },
}));

const {
  SUMMER_CARD_DEFAULT_DECIDER,
  summerCardDecisionContract,
  summerCardInputSchema,
  summerCardListQuerySchema,
} = await import('./summer-cards');
const { summerCardId, summerCardPayloadDigest } = await import(
  './summer-card-digest'
);
const {
  applySummerCardDefaults,
  decideSummerCard,
  getSummerCard,
  recordSummerCardFeedback,
  submitSummerCard,
} = await import('./summer-cards.server');

const FILED = new Date('2026-10-20T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

const tasteInput = {
  idempotencyKey: 'taste-header-2026-10-20',
  kind: 'taste',
  product: 'jov',
  title: 'Darker header',
  body: 'The header reads heavy on mobile.',
  recommendation: 'Ship the darker header',
  defaultIfSilent: 'Ship the darker header',
  defaultDecision: 'approve',
} as const;
const taste = summerCardInputSchema.parse(tasteInput);

/** A row as stored before the deadline contract existed (no new fields). */
function legacyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: summerCardId('legacy-card-key'),
    idempotencyKey: 'legacy-card-key',
    payloadDigest: 'digest',
    kind: 'decision',
    product: 'company',
    title: 'Legacy ask',
    body: 'Filed before the contract.',
    recommendation: 'Approve',
    defaultIfSilent: 'Stays in Backlog',
    recipient: null,
    amountUsd: null,
    preflightReceiptId: null,
    evidence: [],
    status: 'pending',
    comment: null,
    decidedBy: null,
    createdAt: FILED.toISOString(),
    decidedAt: null,
    ...overrides,
  };
}

function contractRow(overrides: Record<string, unknown> = {}) {
  return legacyRow({
    id: summerCardId(taste.idempotencyKey),
    idempotencyKey: taste.idempotencyKey,
    kind: 'taste',
    defaultIfSilent: taste.defaultIfSilent,
    decideBy: new Date(FILED.getTime() + 48 * HOUR).toISOString(),
    defaultDecision: 'approve',
    resolution: null,
    feedback: [],
    feedbackAt: null,
    ...overrides,
  });
}

describe('summer card default-plus-deadline contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('files every card with a 48h deadline and a default that never acts by itself', () => {
    expect(summerCardDecisionContract(taste, FILED)).toEqual({
      decideBy: '2026-10-22T12:00:00.000Z',
      defaultDecision: 'approve',
    });
    const undeclared = summerCardInputSchema.parse({
      ...tasteInput,
      defaultDecision: undefined,
    });
    expect(summerCardDecisionContract(undeclared, FILED).defaultDecision).toBe(
      'reject'
    );
  });

  it('bounds a requested deadline to the filing time and 14 days', () => {
    const at = (decideBy: string) =>
      summerCardDecisionContract(
        summerCardInputSchema.parse({ ...tasteInput, decideBy }),
        FILED
      ).decideBy;
    expect(at('2026-10-21T12:00:00+00:00')).toBe('2026-10-21T12:00:00.000Z');
    expect(at('2026-10-19T00:00:00Z')).toBe(FILED.toISOString());
    expect(at('2027-01-01T00:00:00Z')).toBe('2026-11-03T12:00:00.000Z');
  });

  it('rejects defaults that would spend, send, or say nothing', () => {
    expect(
      summerCardInputSchema.safeParse({
        ...tasteInput,
        kind: 'outbound',
        defaultDecision: 'approve',
      }).success
    ).toBe(false);
    expect(
      summerCardInputSchema.safeParse({
        ...tasteInput,
        defaultIfSilent: undefined,
        defaultDecision: 'reject',
      }).success
    ).toBe(false);
    expect(
      summerCardInputSchema.safeParse({ ...tasteInput, decideBy: 'tomorrow' })
        .success
    ).toBe(false);
  });

  it('keeps the payload digest of cards filed without the new fields', () => {
    const legacy = summerCardInputSchema.parse({
      ...tasteInput,
      defaultDecision: undefined,
    });
    expect(legacy.decideBy).toBeNull();
    expect(legacy.defaultDecision).toBeNull();
    expect(summerCardPayloadDigest(legacy)).not.toBe(
      summerCardPayloadDigest(taste)
    );
    expect(
      summerCardPayloadDigest({
        ...taste,
        decideBy: '2026-10-21T00:00:00.000Z',
      })
    ).not.toBe(summerCardPayloadDigest(taste));
  });

  it('stores the deadline and default with a new card', async () => {
    hoisted.insertReturning.mockResolvedValue([{ key: 'k' }]);
    const result = await submitSummerCard(taste, FILED);
    expect(result).toMatchObject({
      outcome: 'created',
      card: {
        decideBy: '2026-10-22T12:00:00.000Z',
        defaultDecision: 'approve',
        resolution: null,
        feedback: [],
      },
    });
  });

  it('reads a legacy card with the default window from filing and a reject default', async () => {
    hoisted.selectLimit.mockResolvedValue([{ value: legacyRow() }]);
    await expect(
      getSummerCard(summerCardId('legacy-card-key'))
    ).resolves.toMatchObject({
      decideBy: '2026-10-22T12:00:00.000Z',
      defaultDecision: 'reject',
      resolution: null,
    });
    hoisted.selectLimit.mockResolvedValue([
      { value: legacyRow({ status: 'approved' }) },
    ]);
    await expect(
      getSummerCard(summerCardId('legacy-card-key'))
    ).resolves.toMatchObject({ resolution: 'founder' });
  });

  it('compares a legacy row against its stored JSON, not the parsed defaults', async () => {
    const raw = legacyRow();
    hoisted.selectLimit.mockResolvedValue([{ value: raw }]);
    hoisted.updateReturning.mockResolvedValue([{ key: 'k' }]);
    const result = await decideSummerCard({
      id: raw.id,
      decision: 'reject',
      comment: 'not now',
      decidedBy: 'tim@jov.ie',
    });
    expect(result).toMatchObject({
      outcome: 'decided',
      card: { status: 'rejected', resolution: 'founder' },
    });
    expect(hoisted.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        value: expect.objectContaining({ resolution: 'founder' }),
      })
    );
  });

  it('records the declared default on overdue cards and leaves the rest pending', async () => {
    const overdueTaste = contractRow();
    const overdueLegacy = legacyRow();
    const notDue = contractRow({
      id: summerCardId('later-card'),
      idempotencyKey: 'later-card',
      decideBy: '2026-10-25T12:00:00.000Z',
    });
    hoisted.listLimit.mockResolvedValue([
      { value: overdueTaste },
      { value: overdueLegacy },
      { value: notDue },
    ]);
    hoisted.selectLimit
      .mockResolvedValueOnce([{ value: overdueTaste }])
      .mockResolvedValueOnce([{ value: overdueLegacy }]);
    hoisted.updateReturning.mockResolvedValue([{ key: 'k' }]);

    const now = new Date('2026-10-22T12:15:00.000Z');
    const result = await applySummerCardDefaults(now);

    expect(result).toEqual({
      checked: 3,
      defaulted: 2,
      approvedByDefault: 1,
      rejectedByDefault: 1,
      raced: 0,
      cardIds: [overdueTaste.id, overdueLegacy.id],
    });
    const writes = hoisted.updateSet.mock.calls.map(([call]) => call.value);
    expect(writes[0]).toMatchObject({
      status: 'approved',
      decidedBy: SUMMER_CARD_DEFAULT_DECIDER,
      resolution: 'default',
      decidedAt: now.toISOString(),
      comment: expect.stringContaining('Ship the darker header'),
    });
    expect(writes[1]).toMatchObject({
      status: 'rejected',
      resolution: 'default',
      comment: expect.stringContaining('Stays in Backlog'),
    });
  });

  it('never settles a no-default card, however overdue (claim verification)', async () => {
    const claim = contractRow({
      id: summerCardId('claim-verification-card'),
      idempotencyKey: 'claim-verification-card',
      kind: 'decision',
      defaultIfSilent:
        'Stays pending; the artist is not linked and no refund runs.',
      defaultDecision: 'none',
    });
    hoisted.listLimit.mockResolvedValue([{ value: claim }]);

    const result = await applySummerCardDefaults(
      new Date('2026-11-30T00:00:00.000Z')
    );

    expect(result).toMatchObject({ checked: 1, defaulted: 0, cardIds: [] });
    expect(hoisted.updateSet).not.toHaveBeenCalled();
  });

  it('accepts none as a declared no-default for decision cards', () => {
    const card = summerCardInputSchema.parse({
      ...tasteInput,
      idempotencyKey: 'claim-verification-key',
      kind: 'decision',
      defaultDecision: 'none',
    });
    expect(card.defaultDecision).toBe('none');
    expect(summerCardDecisionContract(card, FILED).defaultDecision).toBe(
      'none'
    );
  });

  it('lets a founder decision that lands first win over the default', async () => {
    const overdue = contractRow();
    hoisted.listLimit.mockResolvedValue([{ value: overdue }]);
    hoisted.selectLimit
      .mockResolvedValueOnce([{ value: overdue }])
      .mockResolvedValueOnce([
        { value: contractRow({ status: 'rejected', resolution: 'founder' }) },
      ]);
    hoisted.updateReturning.mockResolvedValue([]);
    await expect(
      applySummerCardDefaults(new Date('2026-10-23T00:00:00.000Z'))
    ).resolves.toMatchObject({ defaulted: 0, raced: 1, cardIds: [] });
  });

  it('records post-ship feedback without changing the decision', async () => {
    const decided = contractRow({
      status: 'approved',
      resolution: 'default',
      decidedBy: SUMMER_CARD_DEFAULT_DECIDER,
      decidedAt: '2026-10-22T12:15:00.000Z',
    });
    hoisted.selectLimit.mockResolvedValue([{ value: decided }]);
    hoisted.updateReturning.mockResolvedValue([{ key: 'k' }]);
    const at = new Date('2026-10-23T09:00:00.000Z');
    await expect(
      recordSummerCardFeedback(
        { id: decided.id, comment: 'Too dark on iPhone SE' },
        at
      )
    ).resolves.toMatchObject({
      outcome: 'recorded',
      card: {
        status: 'approved',
        resolution: 'default',
        feedback: [{ comment: 'Too dark on iPhone SE', at: at.toISOString() }],
        feedbackAt: at.toISOString(),
      },
    });
  });

  it('refuses feedback before a decision and reports missing cards and lost races', async () => {
    hoisted.selectLimit.mockResolvedValue([{ value: contractRow() }]);
    await expect(
      recordSummerCardFeedback({ id: contractRow().id, comment: 'x' })
    ).resolves.toMatchObject({ outcome: 'pending' });

    hoisted.selectLimit.mockResolvedValue([]);
    await expect(
      recordSummerCardFeedback({ id: contractRow().id, comment: 'x' })
    ).resolves.toEqual({ outcome: 'not_found' });

    hoisted.selectLimit.mockResolvedValue([
      { value: contractRow({ status: 'approved' }) },
    ]);
    hoisted.updateReturning.mockResolvedValue([]);
    await expect(
      recordSummerCardFeedback({ id: contractRow().id, comment: 'x' })
    ).resolves.toEqual({ outcome: 'conflict' });
    expect(hoisted.updateSet).toHaveBeenCalledTimes(3);
  });

  it('lets Summer poll for feedback by time', () => {
    expect(
      summerCardListQuerySchema.parse({
        status: 'decided',
        feedbackSince: '2026-10-23T00:00:00Z',
      })
    ).toMatchObject({ feedbackSince: '2026-10-23T00:00:00Z' });
    expect(
      summerCardListQuerySchema.safeParse({ feedbackSince: 'yesterday' })
        .success
    ).toBe(false);
  });
});
