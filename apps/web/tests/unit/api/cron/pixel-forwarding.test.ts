import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockProcessPendingEvents = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema/pixels', () => ({
  pixelEvents: {
    forwardAt: 'forwardAt',
    forwardingStatus: 'forwardingStatus',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

vi.mock('@/lib/tracking/forwarding', () => ({
  processPendingEvents: mockProcessPendingEvents,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('GET /api/cron/pixel-forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'test-secret');

    mockProcessPendingEvents.mockResolvedValue({
      processed: 4,
      successful: 3,
      failed: 1,
    });
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 2 }]),
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 for invalid cron auth', async () => {
    const { GET } = await import('@/app/api/cron/pixel-forwarding/route');
    const response = await GET(
      new Request('http://localhost/api/cron/pixel-forwarding', {
        headers: { Authorization: 'Bearer wrong-secret' },
      })
    );

    expect(response.status).toBe(401);
  });

  it('processes pending pixel events with valid auth', async () => {
    const { GET } = await import('@/app/api/cron/pixel-forwarding/route');
    const response = await GET(
      new Request('http://localhost/api/cron/pixel-forwarding', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.retryQueueDepth).toBe(2);
    expect(mockProcessPendingEvents).toHaveBeenCalledWith(500);
  });
});
