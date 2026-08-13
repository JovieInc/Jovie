import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const hoisted = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  profileRows: [] as Array<{ id: string }>,
  contactRows: [] as Array<{ id: string }>,
  entitlements: {
    isAuthenticated: true,
    billingVerification: 'verified',
  } as Record<string, unknown>,
  resolveActionCapabilities: vi.fn(() => [] as unknown[]),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: vi.fn(async () => ({ userId: hoisted.userId })),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: vi.fn(
    async (operation: (tx: unknown, userId: string) => Promise<unknown>) => {
      const makeQuery = (rows: Array<{ id: string }>) => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(async () => rows),
        then: (resolve: (rows: Array<{ id: string }>) => void) => resolve(rows),
      });
      let call = 0;
      const tx = {
        select: vi.fn(() => {
          call += 1;
          return makeQuery(
            call === 1 ? hoisted.profileRows : hoisted.contactRows
          );
        }),
      };
      return operation(tx, 'app-user-1');
    }
  ),
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: vi.fn(async () => hoisted.entitlements),
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/actions/capabilities', () => ({
  resolveActionCapabilities: hoisted.resolveActionCapabilities,
}));

const { GET } = await import('@/app/api/v1/actions/route');

const PROFILE_ID = '123e4567-e89b-42d3-a456-426614174000';

describe('GET /api/v1/actions clientVersion propagation', () => {
  beforeEach(() => {
    hoisted.userId = 'user_1';
    hoisted.profileRows = [{ id: PROFILE_ID }];
    hoisted.contactRows = [];
    hoisted.resolveActionCapabilities.mockClear();
  });

  it('forwards the invocation clientVersion to capability resolution', async () => {
    const response = await GET(
      new Request(
        `https://jov.ie/api/v1/actions?profileId=${PROFILE_ID}&channel=ios&clientVersion=2.0.9`
      )
    );
    expect(response.status).toBe(200);
    expect(hoisted.resolveActionCapabilities).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'ios', clientVersion: '2.0.9' })
    );
  });

  it('passes clientVersion as undefined when the client omits it', async () => {
    const response = await GET(
      new Request(
        `https://jov.ie/api/v1/actions?profileId=${PROFILE_ID}&channel=ios`
      )
    );
    expect(response.status).toBe(200);
    expect(hoisted.resolveActionCapabilities).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'ios', clientVersion: undefined })
    );
  });

  it('rejects an overlong clientVersion as VALIDATION_FAILED', async () => {
    const response = await GET(
      new Request(
        `https://jov.ie/api/v1/actions?profileId=${PROFILE_ID}&channel=ios&clientVersion=${'1'.repeat(65)}`
      )
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(hoisted.resolveActionCapabilities).not.toHaveBeenCalled();
  });
});
