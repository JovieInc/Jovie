import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

describe('GET /api/monitoring/performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { GET } = await import('@/app/api/monitoring/performance/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns performance metrics for authenticated users', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });

    const { GET } = await import('@/app/api/monitoring/performance/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(501);
    expect(data.error).toBe('Performance metrics not yet available');
    expect(Array.isArray(data.metrics)).toBe(true);
    expect(data.metrics).toHaveLength(0);
  });
});
