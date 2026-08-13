import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const hoisted = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  profileRows: [] as Array<{ id: string }>,
  contactRows: [] as Array<{ id: string }>,
  entitlements: {
    isAuthenticated: true,
    billingVerification: 'verified',
    canCreateManualReleases: true,
    canAccessTasksWorkspace: true,
    contactsLimit: null,
  } as Record<string, unknown>,
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: vi.fn(async () => ({ userId: hoisted.userId })),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: vi.fn(
    async (operation: (tx: unknown, userId: string) => Promise<unknown>) => {
      const makeQuery = (rows: Array<{ id: string }>) => {
        const query = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockImplementation(async () => rows),
          then: (resolve: (rows: Array<{ id: string }>) => void) =>
            resolve(rows),
        };
        return query;
      };
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

const { GET } = await import('@/app/api/v1/actions/route');

const PROFILE_ID = '123e4567-e89b-42d3-a456-426614174000';

function request(query = `profileId=${PROFILE_ID}&channel=web`) {
  return new Request(`https://jov.ie/api/v1/actions?${query}`);
}

describe('GET /api/v1/actions', () => {
  beforeEach(() => {
    hoisted.userId = 'user_1';
    hoisted.profileRows = [{ id: PROFILE_ID }];
    hoisted.contactRows = [];
  });

  it('returns 401 AUTH_REQUIRED when unauthenticated', async () => {
    hoisted.userId = null;
    const response = await GET(request());
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('AUTH_REQUIRED');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('returns 400 VALIDATION_FAILED for a malformed query', async () => {
    const response = await GET(request('profileId=nope&channel=web'));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 403 FORBIDDEN when the profile is not owned', async () => {
    hoisted.profileRows = [];
    const response = await GET(request());
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('resolves one capability per manifest action for an owned profile', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.actions).toHaveLength(4);
    const ids = body.actions.map(
      (capability: { action: { id: string } }) => capability.action.id
    );
    expect(ids).toEqual([
      'chat.start',
      'contact.create',
      'release.create',
      'task.create',
    ]);
    for (const capability of body.actions) {
      expect(capability.available).toBe(true);
      expect(capability.action.schemaVersion).toBe(1);
    }
  });
});
