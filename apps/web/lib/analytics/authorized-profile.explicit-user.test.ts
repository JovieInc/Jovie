import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  cookieReads: 0,
  contextReads: 0,
  userId: '11111111-1111-4111-8111-111111111111',
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => {
    state.cookieReads++;
    return { userId: null };
  },
}));
vi.mock('@/lib/claim/claim-verification', () => ({
  isProofBlockingPublication: () => false,
}));
vi.mock('@/lib/db/client', () => ({
  logDbError: vi.fn(),
  logDbInfo: vi.fn(),
  withRetry: async (operation: () => Promise<unknown>) => operation(),
}));
vi.mock('@/lib/db/legacy-transaction', () => ({
  runLegacyDbTransaction: vi.fn(),
}));
vi.mock('@/lib/db', () => {
  const builder = {
    from: () => builder,
    leftJoin: () => builder,
    where: () => builder,
    limit: async () => {
      state.contextReads++;
      return [
        { userId: state.userId, profileId: 'profile-A', profileSettings: {} },
      ];
    },
  };
  return {
    db: { select: () => builder },
    applyRlsSessionUser: vi.fn(),
    applyRlsTransactionUser: vi.fn(),
    getRlsTransactionSessionSetSql: vi.fn(),
    resetRlsSession: vi.fn(),
  };
});

beforeEach(() => {
  vi.resetModules();
  state.cookieReads = 0;
  state.contextReads = 0;
});

it('the actual session helper preserves a supplied authenticated mobile user without cookie auth', async () => {
  // getMobileSessionUserId(request) owns bearer authentication. This test
  // preserves its downstream explicit-app-user contract; it does not model a
  // bearer token or claim to certify the existing transport authentication.
  const { getSessionContext } = await import('@/lib/auth/session');
  const context = await getSessionContext({
    clerkUserId: state.userId,
    requireUser: true,
    requireProfile: true,
  });
  expect(context.user.id).toBe(state.userId);
  expect(context.profile?.id).toBe('profile-A');
  expect(state.contextReads).toBe(1);
  expect(state.cookieReads).toBe(0);
});

it('the actual immutable-scope resolver also preserves that explicit-user contract', async () => {
  const { resolveAuthorizedAnalyticsProfile } = await import(
    '@/lib/analytics/authorized-profile'
  );
  const scope = await resolveAuthorizedAnalyticsProfile(state.userId);
  expect(scope).toMatchObject({ userId: state.userId, profileId: 'profile-A' });
  expect(Object.isFrozen(scope)).toBe(true);
  expect(state.contextReads).toBe(1);
  expect(state.cookieReads).toBe(0);
});
