import { beforeEach, describe, expect, it, vi } from 'vitest';

const APP_USER_ID = '66666666-6666-4666-8666-666666666666';
const RELEASE_ID = '77777777-7777-4777-8777-777777777777';
const { eqMock, insertValues, cols } = vi.hoisted(() => ({
  eqMock: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  insertValues: vi.fn(async () => undefined),
  cols: (prefix: string) =>
    new Proxy({}, { get: (_target, key) => `${prefix}.${String(key)}` }),
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: eqMock,
}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: vi.fn(async () => ({ userId: APP_USER_ID })),
}));
vi.mock('@/lib/env-server', () => ({ env: {} }));
vi.mock('@/lib/utils/pii-encryption', () => ({
  encryptPII: (value: string) => `enc:${value}`,
}));
vi.mock('@/lib/db/schema/auth', () => ({ users: cols('users') }));
vi.mock('@/lib/db/schema/content', () => ({
  providerLinks: cols('providerLinks'),
}));
vi.mock('@/lib/db/schema/pre-save', () => ({
  preSaveTokens: cols('preSaveTokens'),
}));
vi.mock('@/lib/db', () => {
  let selects = 0;
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              selects += 1;
              return selects === 1
                ? [{ id: APP_USER_ID, email: 'artist@example.com' }]
                : [{ externalId: 'album-1' }];
            },
          }),
        }),
      }),
      insert: () => ({ values: insertValues }),
    },
  };
});

describe('POST /api/pre-save/apple app user id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves a pre-add for a Better Auth user with a null clerk_id', async () => {
    const { POST } = await import('@/app/api/pre-save/apple/route');
    const response = await POST(
      new Request('http://localhost/api/pre-save/apple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releaseId: RELEASE_ID,
          appleMusicUserToken: 'a'.repeat(24),
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(eqMock).toHaveBeenCalledWith('users.id', APP_USER_ID);
    expect(eqMock).not.toHaveBeenCalledWith('users.clerkId', expect.anything());
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: APP_USER_ID, releaseId: RELEASE_ID })
    );
  });
});
