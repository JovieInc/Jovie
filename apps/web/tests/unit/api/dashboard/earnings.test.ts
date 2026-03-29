import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  withDbSessionTxMock: vi.fn(),
  captureErrorMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: hoisted.withDbSessionTxMock,
}));

vi.mock('@/lib/db/schema/analytics', () => ({
  tips: {
    id: 'id',
    creatorProfileId: 'creatorProfileId',
    status: 'status',
    amountCents: 'amountCents',
    tipperName: 'tipperName',
    contactEmail: 'contactEmail',
    createdAt: 'createdAt',
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'id', clerkId: 'clerkId' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'id', userId: 'userId' },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
  eq: vi.fn(),
  sum: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

describe('GET /api/dashboard/earnings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns earnings data for valid user', async () => {
    hoisted.withDbSessionTxMock.mockImplementation(
      async (callback: Function) => {
        const mockTx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi
                  .fn()
                  .mockResolvedValueOnce([{ id: 'user_1' }]) // user lookup
                  .mockResolvedValueOnce([{ id: 'profile_1' }]), // profile lookup
              }),
            }),
          }),
          execute: vi.fn().mockResolvedValue(undefined),
        };

        // Override select for stats query (after execute)
        let callCount = 0;
        mockTx.select = vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount <= 2) {
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi
                    .fn()
                    .mockResolvedValue(
                      callCount === 1
                        ? [{ id: 'user_1' }]
                        : [{ id: 'profile_1' }]
                    ),
                }),
              }),
            };
          }
          if (callCount === 3) {
            // Stats query
            return {
              from: vi.fn().mockReturnValue({
                where: vi
                  .fn()
                  .mockResolvedValue([
                    { totalRevenueCents: '5000', totalTips: 10 },
                  ]),
              }),
            };
          }
          // Tippers query
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([
                    {
                      id: 'tip_1',
                      tipperName: 'Fan',
                      contactEmail: 'fan@test.com',
                      amountCents: 500,
                      createdAt: new Date('2026-03-28'),
                    },
                  ]),
                }),
              }),
            }),
          };
        });

        return callback(mockTx, 'clerk_123');
      }
    );

    const { GET } = await import('@/app/api/dashboard/earnings/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stats.totalRevenueCents).toBe(5000);
    expect(body.stats.totalTips).toBe(10);
    expect(body.tippers).toHaveLength(1);
  });

  it('returns 500 when auth fails (withDbSessionTx rejects)', async () => {
    hoisted.withDbSessionTxMock.mockRejectedValue(new Error('Unauthorized'));

    const { GET } = await import('@/app/api/dashboard/earnings/route');
    const response = await GET();

    expect(response.status).toBe(500);
    expect(hoisted.captureErrorMock).toHaveBeenCalled();
  });

  it('returns 500 on error and reports to Sentry', async () => {
    hoisted.withDbSessionTxMock.mockRejectedValue(new Error('DB error'));

    const { GET } = await import('@/app/api/dashboard/earnings/route');
    const response = await GET();

    expect(response.status).toBe(500);
    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'Failed to fetch earnings data',
      expect.any(Error),
      expect.objectContaining({ route: '/api/dashboard/earnings' })
    );
  });
});
