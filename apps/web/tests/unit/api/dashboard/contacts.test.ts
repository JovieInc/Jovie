import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  withDbSessionTxMock: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: hoisted.withDbSessionTxMock,
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'id', clerkId: 'clerkId' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'id', userId: 'userId' },
  creatorContacts: {
    id: 'id',
    creatorProfileId: 'creatorProfileId',
    role: 'role',
    customLabel: 'customLabel',
    personName: 'personName',
    companyName: 'companyName',
    territories: 'territories',
    email: 'email',
    phone: 'phone',
    preferredChannel: 'preferredChannel',
    isActive: 'isActive',
    sortOrder: 'sortOrder',
    createdAt: 'createdAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  asc: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

describe('GET /api/dashboard/contacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: null });

    const { GET } = await import('@/app/api/dashboard/contacts/route');
    const request = new Request(
      'http://localhost/api/dashboard/contacts?profileId=abc'
    );
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('returns 400 when profileId missing', async () => {
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'user_123' });

    const { GET } = await import('@/app/api/dashboard/contacts/route');
    const request = new Request('http://localhost/api/dashboard/contacts');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Missing profileId');
  });

  it('returns 404 when profile not found', async () => {
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.withDbSessionTxMock.mockResolvedValue(null);

    const { GET } = await import('@/app/api/dashboard/contacts/route');
    const request = new Request(
      'http://localhost/api/dashboard/contacts?profileId=profile_123'
    );
    const response = await GET(request);

    expect(response.status).toBe(404);
  });

  it('returns contacts list for valid profile', async () => {
    const mockContacts = [
      { id: 'c1', creatorProfileId: 'p1', role: 'manager', personName: 'Jane' },
    ];
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.withDbSessionTxMock.mockResolvedValue(mockContacts);

    const { GET } = await import('@/app/api/dashboard/contacts/route');
    const request = new Request(
      'http://localhost/api/dashboard/contacts?profileId=profile_123'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].personName).toBe('Jane');
  });

  it('returns 500 on unexpected error', async () => {
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.withDbSessionTxMock.mockRejectedValue(new Error('DB crash'));

    const { GET } = await import('@/app/api/dashboard/contacts/route');
    const request = new Request(
      'http://localhost/api/dashboard/contacts?profileId=profile_123'
    );
    const response = await GET(request);

    expect(response.status).toBe(500);
  });
});
