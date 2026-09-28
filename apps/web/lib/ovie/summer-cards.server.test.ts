import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  insertReturning: vi.fn(),
  insertValues: vi.fn(),
  updateReturning: vi.fn(),
  updateSet: vi.fn(),
  selectLimit: vi.fn(),
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
      from: () => ({ where: () => ({ limit: hoisted.selectLimit }) }),
    }),
  },
}));

const { summerCardId, summerCardInputSchema, summerCardPayloadDigest } =
  await import('./summer-cards');
const { decideSummerCard, submitSummerCard } = await import(
  './summer-cards.server'
);

const NOW = new Date('2026-09-26T10:00:00.000Z');

const input = summerCardInputSchema.parse({
  idempotencyKey: 'spend-2026-09-26',
  kind: 'spend',
  product: 'company',
  title: 'Renew domain',
  body: 'Renew jov.ie for one year.',
  recommendation: 'Approve',
  amountUsd: 12.5,
});

function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: summerCardId(input.idempotencyKey),
    idempotencyKey: input.idempotencyKey,
    payloadDigest: summerCardPayloadDigest(input),
    kind: 'spend',
    product: 'company',
    title: input.title,
    body: input.body,
    recommendation: input.recommendation,
    defaultIfSilent: null,
    recipient: null,
    amountUsd: 12.5,
    evidence: [],
    status: 'pending',
    comment: null,
    decidedBy: null,
    createdAt: NOW.toISOString(),
    decidedAt: null,
    ...overrides,
  };
}

describe('summer card store', () => {
  beforeEach(() => vi.clearAllMocks());

  it('derives a stable id from the idempotency key', () => {
    expect(summerCardId('spend-2026-09-26')).toMatch(/^sc_[0-9a-f]{32}$/u);
    expect(summerCardId('spend-2026-09-26')).toBe(
      summerCardId('spend-2026-09-26')
    );
    expect(summerCardId('spend-2026-09-27')).not.toBe(
      summerCardId('spend-2026-09-26')
    );
  });

  it('creates a pending card keyed by its id, without internal fields', async () => {
    hoisted.insertReturning.mockResolvedValue([{ key: 'k' }]);
    const result = await submitSummerCard(input, NOW);
    expect(result).toEqual({
      outcome: 'created',
      card: expect.not.objectContaining({ payloadDigest: expect.anything() }),
    });
    expect(result).toMatchObject({
      card: { amountUsd: 12.5, status: 'pending', decidedAt: null },
    });
    expect(hoisted.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `summer-card:${summerCardId(input.idempotencyKey)}`,
      })
    );
  });

  it('replays when the stored digest matches', async () => {
    hoisted.insertReturning.mockResolvedValue([]);
    hoisted.selectLimit.mockResolvedValue([{ value: stored() }]);
    await expect(submitSummerCard(input, NOW)).resolves.toMatchObject({
      outcome: 'replayed',
      card: { id: summerCardId(input.idempotencyKey) },
    });
  });

  it('conflicts when the same key carries a different payload', async () => {
    hoisted.insertReturning.mockResolvedValue([]);
    hoisted.selectLimit.mockResolvedValue([
      { value: stored({ payloadDigest: 'other' }) },
    ]);
    await expect(submitSummerCard(input, NOW)).resolves.toEqual({
      outcome: 'conflict',
    });
  });

  it('digests every payload field except the key', () => {
    const base = summerCardPayloadDigest(input);
    expect(
      summerCardPayloadDigest({ ...input, idempotencyKey: 'another-key' })
    ).toBe(base);
    expect(summerCardPayloadDigest({ ...input, amountUsd: 13 })).not.toBe(base);
    expect(summerCardPayloadDigest({ ...input, body: 'Other copy' })).not.toBe(
      base
    );
  });

  it('decides a pending card and records who decided', async () => {
    hoisted.selectLimit.mockResolvedValue([{ value: stored() }]);
    hoisted.updateReturning.mockResolvedValue([{ key: 'k' }]);
    const result = await decideSummerCard(
      {
        id: stored().id,
        decision: 'approve',
        comment: 'ok',
        decidedBy: 'founder@jov.ie',
      },
      new Date('2026-09-26T11:00:00.000Z')
    );
    expect(result).toMatchObject({
      outcome: 'decided',
      card: {
        status: 'approved',
        comment: 'ok',
        decidedAt: '2026-09-26T11:00:00.000Z',
      },
    });
    expect(hoisted.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        value: expect.objectContaining({ decidedBy: 'founder@jov.ie' }),
      })
    );
  });

  it('never overwrites an already-decided card', async () => {
    hoisted.selectLimit.mockResolvedValue([
      { value: stored({ status: 'rejected' }) },
    ]);
    await expect(
      decideSummerCard({
        id: stored().id,
        decision: 'approve',
        comment: null,
        decidedBy: null,
      })
    ).resolves.toMatchObject({
      outcome: 'already_decided',
      card: { status: 'rejected' },
    });
    expect(hoisted.updateSet).not.toHaveBeenCalled();
  });

  it('reports the winner when a concurrent decision lands first', async () => {
    hoisted.selectLimit
      .mockResolvedValueOnce([{ value: stored() }])
      .mockResolvedValueOnce([{ value: stored({ status: 'rejected' }) }]);
    hoisted.updateReturning.mockResolvedValue([]);
    await expect(
      decideSummerCard({
        id: stored().id,
        decision: 'approve',
        comment: null,
        decidedBy: null,
      })
    ).resolves.toMatchObject({
      outcome: 'already_decided',
      card: { status: 'rejected' },
    });
  });

  it('reports a missing card', async () => {
    hoisted.selectLimit.mockResolvedValue([]);
    await expect(
      decideSummerCard({
        id: stored().id,
        decision: 'reject',
        comment: null,
        decidedBy: null,
      })
    ).resolves.toEqual({ outcome: 'not_found' });
  });
});
