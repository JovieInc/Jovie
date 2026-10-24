import { beforeEach, describe, expect, it, vi } from 'vitest';

const APP_USER_ID = '55555555-5555-4555-8555-555555555555';
const { eqMock, cols } = vi.hoisted(() => ({
  eqMock: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  cols: (prefix: string) =>
    new Proxy({}, { get: (_target, key) => `${prefix}.${String(key)}` }),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }));
vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: eqMock,
}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: vi.fn(async () => ({ userId: APP_USER_ID })),
}));
vi.mock('@/lib/auth/session', () => ({
  withDbSession: (operation: (appUserId: string) => Promise<unknown>) =>
    operation(APP_USER_ID),
}));
vi.mock('@/lib/db/queries/social-links-verification', () => ({
  getSocialLinksVerificationColumnSupport: vi.fn(async () => false),
  buildSocialLinksVerificationSelect: () => ({}),
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () =>
                Promise.resolve([
                  {
                    linkId: 'link-1',
                    platform: 'spotify',
                    url: 'https://open.spotify.com/artist/1',
                    isActive: true,
                    state: 'active',
                    version: 1,
                  },
                ]),
            }),
          }),
        }),
      }),
    }),
  },
}));
vi.mock('@/lib/db/schema/auth', () => ({ users: cols('users') }));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: cols('creatorProfiles'),
}));
vi.mock('@/lib/db/schema/links', () => ({ socialLinks: cols('socialLinks') }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/migrations/handleMigrationErrors', () => ({
  handleMigrationErrors: vi.fn(),
}));

describe('getProfileSocialLinks app user id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns links for a Better Auth user with a null clerk_id', async () => {
    const { getProfileSocialLinks } = await import(
      '@/app/app/(shell)/dashboard/actions/social-links'
    );

    await expect(getProfileSocialLinks('profile-1')).resolves.toEqual([
      expect.objectContaining({ id: 'link-1', platform: 'spotify' }),
    ]);
    expect(eqMock).toHaveBeenCalledWith('users.id', APP_USER_ID);
    expect(eqMock).not.toHaveBeenCalledWith('users.clerkId', expect.anything());
  });
});
