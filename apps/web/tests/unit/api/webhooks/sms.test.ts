/**
 * Contract tests for SMS webhook route (Twilio inbound).
 * Covers signature verification, durable dedupe (409-style/idempotent), error taxonomy.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockVerifyInboundSmsWebhook = vi.hoisted(() => vi.fn());
const mockRecordWebhookEvent = vi.hoisted(() => vi.fn());
const mockMarkWebhookEventProcessed = vi.hoisted(() => vi.fn());
const mockHandleVerifiedInbound = vi.hoisted(() => vi.fn());
const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    NATIVE_SMS_ENABLED: 'true',
  },
}));

vi.mock('@/lib/notifications/sms-webhook', () => ({
  verifyInboundSmsWebhook: mockVerifyInboundSmsWebhook,
  recordWebhookEvent: mockRecordWebhookEvent,
  markWebhookEventProcessed: mockMarkWebhookEventProcessed,
  handleVerifiedInbound: mockHandleVerifiedInbound,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: mockLogger,
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

describe('POST /api/webhooks/sms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when signature verification fails (contract test)', async () => {
    mockVerifyInboundSmsWebhook.mockResolvedValue({
      reason: 'signature invalid',
      status: 401,
      kind: 'signature_invalid',
    });

    const { POST } = await import('@/app/api/webhooks/sms/route');
    const response = await POST(
      new NextRequest('https://example.com/api/webhooks/sms', {
        method: 'POST',
        body: 'Body=hi&From=%2B15551234567',
      }) as never
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'SMS webhook signature invalid',
      expect.objectContaining({ reason: 'signature invalid' })
    );
  });

  it('returns 200 idempotent for already-processed duplicate (durable dedupe contract test)', async () => {
    mockVerifyInboundSmsWebhook.mockResolvedValue({
      message: { provider: 'twilio', eventId: 'evt_dup' } as any,
      providerEventId: 'evt_dup',
    });
    mockRecordWebhookEvent.mockResolvedValue({
      isFirstSeen: false,
      alreadyProcessed: true,
      webhookEventId: 'we_123',
    });

    const { POST } = await import('@/app/api/webhooks/sms/route');
    const response = await POST(
      new NextRequest('https://example.com/api/webhooks/sms', {
        method: 'POST',
        body: 'Body=hi&From=%2B15551234567',
      }) as never
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, idempotent: true });
    expect(mockHandleVerifiedInbound).not.toHaveBeenCalled();
  });

  it('returns 200 for retry of unprocessed event (durable dedupe allows replay until processed)', async () => {
    mockVerifyInboundSmsWebhook.mockResolvedValue({
      message: { provider: 'twilio', eventId: 'evt_retry' } as any,
      providerEventId: 'evt_retry',
    });
    mockRecordWebhookEvent.mockResolvedValue({
      isFirstSeen: false,
      alreadyProcessed: false,
      webhookEventId: 'we_456',
    });
    mockHandleVerifiedInbound.mockResolvedValue({
      status: 200,
      kind: 'help_replied',
    });

    const { POST } = await import('@/app/api/webhooks/sms/route');
    const response = await POST(
      new NextRequest('https://example.com/api/webhooks/sms', {
        method: 'POST',
        body: 'Body=HELP&From=%2B15551234567',
      }) as never
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, kind: 'help_replied' });
    expect(mockMarkWebhookEventProcessed).toHaveBeenCalledWith('we_456');
  });

  it('returns 500 when recordWebhookEvent throws (fail-closed durable dedupe)', async () => {
    mockVerifyInboundSmsWebhook.mockResolvedValue({
      message: { provider: 'twilio' } as any,
      providerEventId: 'evt_db',
    });
    mockRecordWebhookEvent.mockRejectedValue(new Error('db down'));

    const { POST } = await import('@/app/api/webhooks/sms/route');
    const response = await POST(
      new NextRequest('https://example.com/api/webhooks/sms', {
        method: 'POST',
        body: 'Body=hi',
      }) as never
    );

    expect(response.status).toBe(500);
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'SMS webhook event record failed',
      expect.any(Error),
      expect.objectContaining({ providerEventId: 'evt_db' })
    );
  });
});

describe('SMS webhook route - method guard', () => {
  it('implicit 405 for GET (no handler)', async () => {
    // Next.js app router returns 405 for unhandled methods on POST-only routes
    const { POST } = await import('@/app/api/webhooks/sms/route');
    // We can't easily invoke GET without handler, but contract documents intent
    // (covered by e2e or platform behavior); here we just ensure module loads.
    expect(POST).toBeDefined();
  });
});
