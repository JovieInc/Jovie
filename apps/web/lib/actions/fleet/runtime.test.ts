import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCachedAuth } from '@/lib/auth/cached';
import { handleFleetControl } from './http';
import { fleetRuntime } from './runtime';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  admin: vi.fn(async () => true),
  owned: vi.fn(async () => 'founder'),
  get: vi.fn(async () => null),
  write: vi.fn(async () => true),
}));
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({ cookie: 'better-auth.session_data=stale' }),
}));
vi.mock('@/lib/auth/better-auth', () => ({
  auth: { api: { getSession: mocks.session } },
}));
vi.mock('@/lib/auth/app-user', () => ({
  getAppUserByBetterAuthId: async () => ({
    id: 'founder',
    userStatus: 'active',
    deletedAt: null,
  }),
}));
vi.mock('@/lib/auth/dev-test-auth.server', () => ({
  getCachedDevTestAuthSession: async () => null,
}));
vi.mock('@/lib/sentry/set-user-context', () => ({
  attachSentryContext: vi.fn(),
}));
vi.mock('@/lib/admin/roles', () => ({ isAdmin: mocks.admin }));
vi.mock('@/lib/auth/session', () => ({ withDbSessionTx: mocks.owned }));
vi.mock('@/lib/env-server', () => ({ env: { JOVIE_FLEET_ENABLED: '1' } }));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: () => ({
    get: mocks.get,
    setIfAbsent: mocks.write,
    compareAndSet: mocks.write,
  }),
}));

describe('fleet founder session revocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockImplementation(
      async (input: { query?: { disableCookieCache?: boolean } }) =>
        input.query?.disableCookieCache
          ? null
          : {
              session: { id: 'revoked-session' },
              user: { id: 'founder-ba' },
            }
    );
  });
  it.each(['approve', 'execute'] as const)(
    'rejects %s with a valid cookie cache but revoked database session',
    async kind => {
      expect(await getCachedAuth()).toMatchObject({ userId: 'founder' });
      const request = new Request('https://jov.ie/api/v1/fleet/' + kind, {
        method: 'POST',
        headers: { origin: 'https://jov.ie' },
        body: JSON.stringify({
          profileId: '11111111-1111-4111-a111-111111111111',
          operation: 'provision',
          approvalId: '22222222-2222-4222-a222-222222222222',
          input: {
            workerId: 'aeon',
            scopes: ['fleet:register'],
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }),
      });
      const response = await handleFleetControl(request, kind, fleetRuntime());
      expect(response.status).toBe(403);
      expect(mocks.session).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: { disableCookieCache: true } })
      );
      expect(mocks.admin).not.toHaveBeenCalled();
      expect(mocks.owned).not.toHaveBeenCalled();
      expect(mocks.get).not.toHaveBeenCalled();
      expect(mocks.write).not.toHaveBeenCalled();
    }
  );
});
