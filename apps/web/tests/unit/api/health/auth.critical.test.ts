import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetUserByClerkId = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/db/queries', () => ({
  getUserByClerkId: mockGetUserByClerkId,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: {},
}));

describe('@critical GET /api/health/auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 403 in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { GET } = await import('@/app/api/health/auth/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.ok).toBe(false);
  });

  it('returns ok status for unauthenticated requests', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { GET } = await import('@/app/api/health/auth/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.authenticated).toBe(false);
  });

  it('returns authenticated status with user info', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetUserByClerkId.mockResolvedValue({ id: 'db_user_1' });
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([{ id: 'profile_1', username: 'testuser' }]),
        }),
      }),
    });

    const { GET } = await import('@/app/api/health/auth/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.authenticated).toBe(true);
  });
});
