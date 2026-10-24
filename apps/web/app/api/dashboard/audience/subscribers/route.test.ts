import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashEmail } from '@/lib/notifications/suppression';

const userId = '11111111-1111-4111-8111-111111111111';
const profileId = '22222222-2222-4222-8222-222222222222';
const rowId = '33333333-3333-4333-8333-333333333333';
const otherId = '44444444-4444-4444-8444-444444444444';
const mocks = vi.hoisted(() => ({
  entitlements: vi.fn(),
  session: vi.fn(),
  select: vi.fn(),
  execute: vi.fn(),
  legacyOwnership: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mocks.entitlements,
}));
vi.mock('@/lib/auth/session', () => ({ withDbSessionTx: mocks.session }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/db', () => ({ db: {}, withRetry: vi.fn() }));
vi.mock('@/lib/db/queries/shared', () => ({
  verifyProfileOwnership: mocks.legacyOwnership,
}));

const candidate = {
  id: rowId,
  email: 'fan@example.com',
  name: 'Fan',
  countryCode: 'US',
  channel: 'email',
  createdAt: new Date('2020-01-01'),
  confirmedAt: new Date('2020-01-01'),
  unsubscribedAt: null,
  artistEmailOptInAt: new Date('2020-01-02'),
  artistEmailOptOutAt: null,
};
let queue: unknown[][];
let predicates: SQL[];
let sessionUserId: string;

function ownership(
  user: string | null = userId,
  role: string | null = 'owner',
  legacy: string | null = userId
) {
  return {
    userId,
    profileId,
    legacyUserId: legacy,
    claimUserId: user,
    claimRole: role,
  };
}

async function invoke(body: unknown = { profileId }) {
  const { POST } = await import('./route');
  return POST(
    new Request('http://localhost/api/dashboard/audience/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

describe('server-authorized subscriber export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionUserId = userId;
    queue = [[ownership()], [candidate], [], []];
    predicates = [];
    mocks.entitlements.mockResolvedValue({
      isAuthenticated: true,
      userId,
      canExportContacts: true,
      billingVerification: 'verified',
    });
    mocks.session.mockImplementation(async operation =>
      operation({ select: mocks.select, execute: mocks.execute }, sessionUserId)
    );
    mocks.select.mockImplementation(() => {
      const rows = queue.shift() ?? [];
      const builder = {
        from: () => builder,
        leftJoin: () => builder,
        where: (condition: SQL) => {
          predicates.push(condition);
          return builder;
        },
        orderBy: () => builder,
        limit: () => builder,
        then: (resolve: (value: unknown[]) => unknown) =>
          Promise.resolve(rows).then(resolve),
      };
      return builder;
    });
  });

  it('requires a fresh session and pins its principal into the RLS transaction', async () => {
    const result = await invoke();
    expect(result.status).toBe(200);
    expect(mocks.entitlements).toHaveBeenCalledWith({ session: 'fresh' });
    expect(mocks.session).toHaveBeenCalledWith(expect.any(Function), {
      clerkUserId: userId,
    });
  });

  it('refuses a revoked fresh session even when the cookie identity remains paid', async () => {
    mocks.entitlements.mockImplementation(async options =>
      options?.session === 'fresh'
        ? { isAuthenticated: false, userId: null }
        : {
            isAuthenticated: true,
            userId,
            canExportContacts: true,
            billingVerification: 'verified',
          }
    );
    expect((await invoke()).status).toBe(401);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it.each([
    { change: { isAuthenticated: false }, status: 401 },
    { change: { canExportContacts: false }, status: 403 },
    { change: { billingVerification: 'unavailable' }, status: 503 },
    { change: { billingVerification: 'missing_user' }, status: 503 },
  ])(
    'refuses an unauthorized or unverified entitlement before accessing subscriber data',
    async ({ change, status }) => {
      mocks.entitlements.mockResolvedValue({
        isAuthenticated: true,
        userId,
        canExportContacts: true,
        billingVerification: 'verified',
        ...change,
      });
      const response = await invoke();
      expect(response.status).toBe(status);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(mocks.select).not.toHaveBeenCalled();
    }
  );

  it.each([
    {},
    { profileId: 'invalid' },
    { profileId, selectedIds: [] },
    { profileId, selectedIds: ['invalid'] },
    { profileId, plan: 'pro' },
    { profileId, userId: otherId },
  ])('rejects malformed or caller-asserted authority: %j', async body => {
    expect((await invoke(body)).status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it.each([
    { claims: [ownership(otherId, 'owner', userId)] },
    { claims: [ownership(userId, 'viewer', userId)] },
    {
      claims: [
        ownership(userId, 'manager', userId),
        ownership(otherId, 'owner', userId),
      ],
    },
    { claims: [ownership(), ownership(otherId, 'owner', userId)] },
  ])(
    'uses the real canonical helper to refuse stale legacy owners, viewers, managers and ambiguity',
    async ({ claims }) => {
      queue[0] = claims;
      const response = await invoke();
      expect(response.status).toBe(403);
      expect(mocks.select).toHaveBeenCalledTimes(1);
      expect(await response.text()).not.toContain(candidate.email);
    }
  );

  it('allows a canonical owner even when the legacy owner differs', async () => {
    queue[0] = [ownership(userId, 'owner', otherId)];
    queue.splice(1, 0, [{ email: candidate.email }]);
    const response = await invoke({ profileId, selectedIds: [rowId] });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      rows: [
        {
          id: rowId,
          email: candidate.email,
          name: 'Fan',
          countryCode: 'US',
          consentedAt: '2020-01-02T00:00:00.000Z',
        },
      ],
    });
    const query = new PgDialect().sqlToQuery(predicates[1]);
    expect(query.params).toEqual(
      expect.arrayContaining([profileId, 'email', rowId])
    );
    const latestQuery = new PgDialect().sqlToQuery(predicates[2]);
    expect(latestQuery.params).toEqual(
      expect.arrayContaining([profileId, 'email', candidate.email])
    );
    expect(latestQuery.sql).not.toContain('"unsubscribed_at" is null');
  });

  it('retains legacy-only owner export without requiring a new claim', async () => {
    queue[0] = [ownership(null, null, userId)];
    expect((await invoke()).status).toBe(200);
  });

  it('does not use entitlements belonging to a different session principal', async () => {
    sessionUserId = otherId;
    expect((await invoke()).status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('omits suppressed and category-opted-out addresses and does not expose consent internals or phones', async () => {
    queue[1] = [
      candidate,
      { ...candidate, id: otherId, email: 'optout@example.com' },
    ];
    queue[2] = [{ emailHash: hashEmail(candidate.email) }];
    queue[3] = [{ emailHash: hashEmail('optout@example.com') }];
    const response = await invoke();
    expect(await response.json()).toEqual({ rows: [] });
    const suppressionQuery = new PgDialect().sqlToQuery(predicates[2]);
    expect(suppressionQuery.sql).toContain('"expires_at" is null');
    expect(suppressionQuery.sql).toContain('"expires_at" >');
  });

  it('never silently truncates a large export', async () => {
    queue[1] = Array.from({ length: 10001 }, () => candidate);
    expect((await invoke()).status).toBe(413);
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it('does not resurrect a selected old opt-in when the latest state has been revoked', async () => {
    queue[1] = [{ email: candidate.email }];
    queue[2] = [
      candidate,
      {
        ...candidate,
        id: otherId,
        createdAt: new Date('2020-02-01'),
        unsubscribedAt: new Date('2020-02-01'),
      },
    ];
    queue[3] = [];
    queue[4] = [];
    const response = await invoke({ profileId, selectedIds: [rowId] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ rows: [] });
  });

  it('returns no records for selected IDs absent from the authorized profile', async () => {
    queue[1] = [];
    expect(
      await (await invoke({ profileId, selectedIds: [otherId] })).json()
    ).toEqual({ rows: [] });
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it('returns an empty eligible result without reading suppression tables', async () => {
    queue[1] = [];
    const response = await invoke();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ rows: [] });
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it('fails closed and sanitizes a database failure', async () => {
    mocks.select.mockImplementation(() => {
      throw new Error('private connection detail');
    });
    const response = await invoke();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private connection detail');
    expect(mocks.capture).toHaveBeenCalled();
  });

  it('preserves free owner subscriber browsing without applying the paid export gate', async () => {
    const row = {
      id: rowId,
      email: 'unconfirmed@example.com',
      phone: null,
      name: null,
      countryCode: null,
      createdAt: '2020-01-01',
      channel: 'email',
    };
    mocks.legacyOwnership.mockResolvedValue({ id: profileId });
    mocks.execute
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });
    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        `http://localhost/api/dashboard/audience/subscribers?profileId=${profileId}`
      )
    );
    expect(response.status).toBe(200);
    expect((await response.json()).rows).toEqual([row]);
    expect(mocks.entitlements).not.toHaveBeenCalled();
  });
});
