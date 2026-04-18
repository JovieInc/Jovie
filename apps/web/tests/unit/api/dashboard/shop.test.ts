import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  withDbSessionMock: vi.fn(),
  captureErrorMock: vi.fn(),
  selectLimitMock: vi.fn(),
  selectWhereMock: vi.fn(),
  selectInnerJoinMock: vi.fn(),
  selectFromMock: vi.fn(),
  selectMock: vi.fn(),
  updateWhereMock: vi.fn(),
  updateSetMock: vi.fn(),
  updateMock: vi.fn(),
  invalidateProfileCacheMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSession: hoisted.withDbSessionMock,
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: hoisted.invalidateProfileCacheMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
    update: hoisted.updateMock,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'id', clerkId: 'clerkId' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    userId: 'userId',
    username: 'username',
    usernameNormalized: 'usernameNormalized',
    settings: 'settings',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  sql: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: vi.fn().mockResolvedValue({
    ok: true,
    data: { shopifyUrl: 'https://mystore.myshopify.com' },
  }),
}));

vi.mock('@/lib/profile/shop-settings', () => ({
  getShopifyUrl: vi.fn().mockReturnValue('https://mystore.myshopify.com'),
  isShopifyDomain: vi.fn().mockReturnValue(true),
}));

describe('GET /api/dashboard/shop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.withDbSessionMock.mockRejectedValue(new Error('Unauthorized'));

    const { GET } = await import('@/app/api/dashboard/shop/route');
    const response = await GET();

    expect(response.status).toBe(401);
  });

  it('returns shopify URL for authenticated user', async () => {
    hoisted.withDbSessionMock.mockImplementation(async (callback: Function) => {
      return callback('clerk_123');
    });

    // Mock the DB query chain
    hoisted.selectLimitMock.mockResolvedValue([
      {
        id: 'profile_1',
        username: 'artist',
        usernameNormalized: 'artist',
        settings: { shopifyUrl: 'https://mystore.myshopify.com' },
      },
    ]);
    hoisted.selectWhereMock.mockReturnValue({ limit: hoisted.selectLimitMock });
    hoisted.selectInnerJoinMock.mockReturnValue({
      where: hoisted.selectWhereMock,
    });
    hoisted.selectFromMock.mockReturnValue({
      innerJoin: hoisted.selectInnerJoinMock,
    });
    hoisted.selectMock.mockReturnValue({ from: hoisted.selectFromMock });

    const { GET } = await import('@/app/api/dashboard/shop/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.shopifyUrl).toBe('https://mystore.myshopify.com');
  });

  it('returns 404 when profile not found', async () => {
    hoisted.withDbSessionMock.mockImplementation(async (callback: Function) => {
      return callback('clerk_123');
    });

    hoisted.selectLimitMock.mockResolvedValue([]);
    hoisted.selectWhereMock.mockReturnValue({ limit: hoisted.selectLimitMock });
    hoisted.selectInnerJoinMock.mockReturnValue({
      where: hoisted.selectWhereMock,
    });
    hoisted.selectFromMock.mockReturnValue({
      innerJoin: hoisted.selectInnerJoinMock,
    });
    hoisted.selectMock.mockReturnValue({ from: hoisted.selectFromMock });

    const { GET } = await import('@/app/api/dashboard/shop/route');
    const response = await GET();

    expect(response.status).toBe(404);
  });
});

describe('PUT /api/dashboard/shop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.withDbSessionMock.mockRejectedValue(new Error('Unauthorized'));

    const { PUT } = await import('@/app/api/dashboard/shop/route');
    const request = new Request('http://localhost/api/dashboard/shop', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopifyUrl: 'https://test.myshopify.com' }),
    });
    const response = await PUT(request);

    expect(response.status).toBe(401);
  });

  it('saves valid shopify URL and invalidates cache', async () => {
    hoisted.withDbSessionMock.mockImplementation(async (callback: Function) => {
      return callback('clerk_123');
    });

    // Mock the DB query chain for profile lookup
    hoisted.selectLimitMock.mockResolvedValue([
      {
        id: 'profile_1',
        username: 'artist',
        usernameNormalized: 'artist',
        settings: {},
      },
    ]);
    hoisted.selectWhereMock.mockReturnValue({ limit: hoisted.selectLimitMock });
    hoisted.selectInnerJoinMock.mockReturnValue({
      where: hoisted.selectWhereMock,
    });
    hoisted.selectFromMock.mockReturnValue({
      innerJoin: hoisted.selectInnerJoinMock,
    });
    hoisted.selectMock.mockReturnValue({ from: hoisted.selectFromMock });

    // Mock update chain
    hoisted.updateWhereMock.mockResolvedValue(undefined);
    hoisted.updateSetMock.mockReturnValue({ where: hoisted.updateWhereMock });
    hoisted.updateMock.mockReturnValue({ set: hoisted.updateSetMock });
    hoisted.invalidateProfileCacheMock.mockResolvedValue(undefined);

    const { PUT } = await import('@/app/api/dashboard/shop/route');
    const request = new Request('http://localhost/api/dashboard/shop', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopifyUrl: 'https://test.myshopify.com' }),
    });
    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(hoisted.updateMock).toHaveBeenCalled();
    expect(hoisted.invalidateProfileCacheMock).toHaveBeenCalled();
  });

  it('returns 500 on unexpected error', async () => {
    hoisted.withDbSessionMock.mockRejectedValue(new Error('DB crash'));

    const { PUT } = await import('@/app/api/dashboard/shop/route');
    const request = new Request('http://localhost/api/dashboard/shop', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopifyUrl: 'https://test.myshopify.com' }),
    });
    const response = await PUT(request);

    expect(response.status).toBe(500);
  });
});
