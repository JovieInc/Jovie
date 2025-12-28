import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  socialLinks: {},
  creatorProfiles: {},
}));

describe('GET /api/link/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 404 when link not found', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const { GET } = await import('@/app/api/link/[id]/route');
    const response = await GET(
      new Request('http://localhost/api/link/nonexistent'),
      { params: Promise.resolve({ id: 'nonexistent' }) }
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('not found');
  });

  it('returns link data when found', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 'link_123',
              url: 'https://example.com',
              title: 'Example Link',
            },
          ]),
        }),
      }),
    });

    const { GET } = await import('@/app/api/link/[id]/route');
    const response = await GET(
      new Request('http://localhost/api/link/link_123'),
      { params: Promise.resolve({ id: 'link_123' }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.link).toBeDefined();
  });
});
