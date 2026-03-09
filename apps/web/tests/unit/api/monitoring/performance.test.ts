import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

// Mock heavy transitive dependencies (error-tracking loads Sentry + analytics
// chains, adding ~700ms of module resolution on first import).
vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  captureCriticalError: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Static import is safe: vi.mock() declarations are hoisted above imports by
// Vitest, and mockAuth is hoisted via vi.hoisted(). This avoids the per-test
// overhead of dynamic await import().
import { GET } from '@/app/api/monitoring/performance/route';

describe('GET /api/monitoring/performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns performance metrics for authenticated users', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(501);
    expect(data.error).toBe('Performance metrics not yet available');
    expect(Array.isArray(data.metrics)).toBe(true);
    expect(data.metrics).toHaveLength(0);
  });
});
