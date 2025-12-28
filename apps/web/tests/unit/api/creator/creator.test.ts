import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: {},
  users: {},
}));

describe('GET /api/creator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { GET } = await import('@/app/api/creator/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns creator profile for authenticated user', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'profile_123',
                username: 'testcreator',
                displayName: 'Test Creator',
              },
            ]),
          }),
        }),
      }),
    });

    const { GET } = await import('@/app/api/creator/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.profile).toBeDefined();
  });

  it('returns null profile when user has no creator profile', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });

    const { GET } = await import('@/app/api/creator/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.profile).toBeNull();
  });
});
