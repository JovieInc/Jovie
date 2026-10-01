import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  selectRows: vi.fn<() => Promise<unknown[]>>(),
  updateReturning: vi.fn<() => Promise<unknown[]>>(),
  getCachedAuth: vi.fn(),
  getExactProfileAccess: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => hoisted.selectRows() }),
      }),
    }),
    update: () => ({
      set: () => ({ where: () => ({ returning: hoisted.updateReturning }) }),
    }),
  },
}));

vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: hoisted.getCachedAuth }));
vi.mock('@/lib/auth/profile-access', () => ({
  getExactProfileAccess: hoisted.getExactProfileAccess,
  isCanonicalUuid: (v: unknown) =>
    typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const RIDER_INPUT = {
  technical: [{ title: 'Sound', items: ['PA'] }],
  hospitality: [],
  visibility: 'private',
};

const riderRow = (version = 3, overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  creatorProfileId: PROFILE_ID,
  version,
  technical: [],
  hospitality: [],
  visibility: 'private',
  passwordHash: null,
  ...overrides,
});

const put = (body: unknown) =>
  new Request('https://jov.ie/api/dashboard/rider', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('PUT /api/dashboard/rider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCachedAuth.mockResolvedValue({ userId: 'user-1' });
    hoisted.getExactProfileAccess.mockResolvedValue({ ok: true });
  });

  it('rejects non-owner/manager access', async () => {
    hoisted.getExactProfileAccess.mockResolvedValue({ ok: false });
    const { PUT } = await import('./route');
    const res = await PUT(put({ profileId: PROFILE_ID, rider: RIDER_INPUT }));
    expect(res.status).toBe(403);
  });

  it('returns VERSION_CONFLICT when expectedVersion is stale', async () => {
    hoisted.selectRows.mockResolvedValue([riderRow(3)]);
    const { PUT } = await import('./route');
    const res = await PUT(
      put({ profileId: PROFILE_ID, expectedVersion: 1, rider: RIDER_INPUT })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('VERSION_CONFLICT');
    expect(body.currentVersion).toBe(3);
    expect(hoisted.updateReturning).not.toHaveBeenCalled();
  });

  it('updates with a matching version and never serializes the hash', async () => {
    hoisted.selectRows.mockResolvedValue([riderRow(3)]);
    hoisted.updateReturning.mockResolvedValue([
      riderRow(4, { technical: RIDER_INPUT.technical, passwordHash: 's:h' }),
    ]);
    const { PUT } = await import('./route');
    const res = await PUT(
      put({ profileId: PROFILE_ID, expectedVersion: 3, rider: RIDER_INPUT })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe(4);
    expect(body.rider.hasPassword).toBe(true);
    expect(JSON.stringify(body)).not.toContain('passwordHash');
    expect(JSON.stringify(body)).not.toContain('s:h');
  });
});
