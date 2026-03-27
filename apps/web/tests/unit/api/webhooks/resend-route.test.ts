import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHeaders = vi.hoisted(() => vi.fn());
const mockCaptureCriticalError = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    RESEND_WEBHOOK_SECRET: 'whsec_test',
  },
}));

vi.mock('@/lib/db', () => ({
  db: {},
}));

vi.mock('@/lib/db/schema/suppression', () => ({
  webhookEvents: {},
}));

vi.mock('@/lib/email/campaigns/enrollment', () => ({
  stopEnrollmentsForEmail: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
}));

vi.mock('@/lib/notifications/reputation', () => ({
  getCreatorByMessageId: vi.fn(),
  recordBounce: vi.fn(),
  recordComplaint: vi.fn(),
  recordDelivery: vi.fn(),
}));

vi.mock('@/lib/notifications/suppression', () => ({
  addSuppression: vi.fn(),
  logDelivery: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('POST /api/webhooks/resend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 400 when required SVix headers are missing', async () => {
    mockHeaders.mockResolvedValue(new Headers());

    const { POST } = await import('@/app/api/webhooks/resend/route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/resend', {
        method: 'POST',
        body: JSON.stringify({ type: 'email.delivered', data: {} }),
      }) as never
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Missing webhook headers',
    });
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Missing Resend webhook headers',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/webhooks/resend',
      })
    );
  });
});
