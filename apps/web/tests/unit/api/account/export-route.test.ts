import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const APP_UUID = '7b4b948f-9720-4c5f-98da-8a7335015da9';
const BETTER_AUTH_ID = 'ba_user_distinct_from_app_uuid';
const CLERK_ID = 'user_legacy_clerk_distinct';

const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockWithDbSessionTx = vi.hoisted(() => vi.fn());
const mockCheckAccountExportRateLimit = vi.hoisted(() => vi.fn());
const mockAppUserIdFilter = vi.hoisted(() => vi.fn());
const selectResults = vi.hoisted(() => ({ queue: [] as unknown[] }));

function makeChain(resolveValue: unknown = undefined) {
  const chain: Record<string, unknown> = {};
  const proxy = new Proxy(chain, {
    get(_, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) =>
          Promise.resolve(resolveValue).then(resolve);
      }
      return vi.fn().mockReturnValue(proxy);
    },
  });
  return proxy;
}

vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mockGetCachedAuth }));
vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: mockWithDbSessionTx,
  setupDbSession: vi.fn(),
}));
vi.mock('@/lib/auth/app-user-id', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/auth/app-user-id')>();
  return {
    ...actual,
    appUserIdFilter: mockAppUserIdFilter.mockImplementation(
      actual.appUserIdFilter
    ),
  };
});
vi.mock('@/lib/rate-limit', () => ({
  checkAccountExportRateLimit: mockCheckAccountExportRateLimit,
  createRateLimitHeaders: vi.fn(() => ({})),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/http/headers', () => ({ NO_STORE_HEADERS: {} }));

describe('GET /api/account/export (JOV-6267)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.queue = [];
    mockGetCachedAuth.mockResolvedValue({ userId: APP_UUID });
    mockCheckAccountExportRateLimit.mockResolvedValue({ success: true });
    mockWithDbSessionTx.mockImplementation(async (operation, options) =>
      operation(
        {
          select: vi.fn().mockImplementation(() => {
            const result = selectResults.queue.shift() ?? [];
            return makeChain(result);
          }),
        },
        options?.clerkUserId ?? APP_UUID
      )
    );
  });

  it('looks up users.id when app UUID, Better Auth ID, and Clerk ID all differ', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    selectResults.queue.push(
      [
        {
          id: APP_UUID,
          clerkId: CLERK_ID,
          betterAuthUserId: BETTER_AUTH_ID,
          name: 'Export Owner',
          email: 'owner@example.com',
          plan: 'free',
          userStatus: 'active',
          createdAt: now,
          updatedAt: now,
        },
      ],
      [],
      []
    );

    const { GET } = await import('@/app/api/account/export/route');
    const response = await GET();
    const query = new PgDialect().sqlToQuery(
      mockAppUserIdFilter.mock.results[0]?.value
    );

    expect(response.status).toBe(200);
    expect(query.sql).toContain('"users"."id" =');
    expect(query.sql).not.toContain('clerk_id');
    expect(query.params).toEqual([APP_UUID]);
    expect(mockWithDbSessionTx).toHaveBeenCalledWith(expect.any(Function), {
      clerkUserId: APP_UUID,
    });
    const body = await response.json();
    expect(body.user.id).toBe(APP_UUID);
    expect(body.user.id).not.toBe(CLERK_ID);
    expect(body.user.id).not.toBe(BETTER_AUTH_ID);

    mockGetCachedAuth.mockResolvedValue({ userId: null });
    expect((await GET()).status).toBe(401);
    mockGetCachedAuth.mockResolvedValue({ userId: APP_UUID });
    selectResults.queue.push([]);
    expect((await GET()).status).toBe(404);
  });
});
