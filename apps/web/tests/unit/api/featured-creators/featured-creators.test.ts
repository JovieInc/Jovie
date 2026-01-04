import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: {},
  socialLinks: {},
}));

describe('GET /api/featured-creators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns featured creators', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'profile_1',
                username: 'creator1',
                displayName: 'Creator One',
                avatarUrl: 'https://example.com/avatar1.jpg',
                creatorType: 'artist',
              },
              {
                id: 'profile_2',
                username: 'creator2',
                displayName: 'Creator Two',
                avatarUrl: 'https://example.com/avatar2.jpg',
                creatorType: 'artist',
              },
            ]),
          }),
        }),
      }),
    });

    const { GET } = await import('@/app/api/featured-creators/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({
      id: 'profile_1',
      handle: 'creator1',
      name: 'Creator One',
      src: 'https://example.com/avatar1.jpg',
    });
  });

  it('handles database errors gracefully', async () => {
    mockDbSelect.mockImplementation(() => {
      throw new Error('Database error');
    });

    const { GET } = await import('@/app/api/featured-creators/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBeDefined();
  });
});
