import { createHmac } from 'node:crypto';
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

  function signForResend(
    body: string,
    timestamp: string,
    secret: string
  ): string {
    const secretBytes = Buffer.from(
      secret.startsWith('whsec_') ? secret.slice(6) : secret,
      'base64'
    );
    const expected = createHmac('sha256', secretBytes)
      .update(`${timestamp}.${body}`)
      .digest('base64');
    return `v1,${expected}`;
  }

  it('returns 401 on invalid SVix signature (contract test)', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    mockHeaders.mockResolvedValue(
      new Headers({
        'svix-id': 'evt_123',
        'svix-timestamp': timestamp,
        'svix-signature': 'v1,invalid',
      })
    );

    const { POST } = await import('@/app/api/webhooks/resend/route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/resend', {
        method: 'POST',
        body: JSON.stringify({ type: 'email.delivered', data: {} }),
      }) as never
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid signature' });
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Invalid Resend webhook signature',
      expect.any(Error),
      expect.objectContaining({ route: '/api/webhooks/resend' })
    );
  });

  it('returns 401 on replay (timestamp outside 5m window) (contract test)', async () => {
    const oldTimestamp = Math.floor(
      (Date.now() - 10 * 60 * 1000) / 1000
    ).toString();
    const body = JSON.stringify({ type: 'email.bounced', data: {} });
    const sig = signForResend(body, oldTimestamp, 'whsec_test');
    mockHeaders.mockResolvedValue(
      new Headers({
        'svix-id': 'evt_replay',
        'svix-timestamp': oldTimestamp,
        'svix-signature': sig,
      })
    );

    const { POST } = await import('@/app/api/webhooks/resend/route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/resend', {
        method: 'POST',
        body,
      }) as never
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid signature' });
  });
});
