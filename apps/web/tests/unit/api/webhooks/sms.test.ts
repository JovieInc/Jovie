import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
const mockVerifyInboundSmsWebhook = vi.hoisted(() => vi.fn());
const mockRecordWebhookEvent = vi.hoisted(() => vi.fn());
const mockHandleVerifiedInbound = vi.hoisted(() => vi.fn());
const mockMarkWebhookEventProcessed = vi.hoisted(() => vi.fn());
const mockEnv = vi.hoisted(() => ({
  NATIVE_SMS_ENABLED: 'true',
  TWILIO_AUTH_TOKEN: 'test_primary_token',
  TWILIO_AUTH_TOKEN_SECONDARY: '',
  TWILIO_AUTH_TOKEN_SECONDARY_EXPIRES_AT: '',
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: mockLogger,
}));

vi.mock('@/lib/notifications/sms-webhook', () => ({
  verifyInboundSmsWebhook: mockVerifyInboundSmsWebhook,
  recordWebhookEvent: mockRecordWebhookEvent,
  handleVerifiedInbound: mockHandleVerifiedInbound,
  markWebhookEventProcessed: mockMarkWebhookEventProcessed,
}));

vi.mock('@/lib/env-server', () => ({
  env: mockEnv,
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return {
    ...actual,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) => {
        const status = init?.status ?? 200;
        const headers = new Headers(init?.headers);
        return {
          status,
          headers,
          json: async () => body,
        };
      },
    },
  };
});

function makeRequest(
  body = 'From=%2B15551234567&Body=STOP',
  headers: Record<string, string> = {}
) {
  const url = 'https://example.com/api/webhooks/sms';
  return {
    nextUrl: new URL(url),
    headers: new Headers({
      'content-type': 'application/x-www-form-urlencoded',
      ...headers,
    }),
    text: async () => body,
  } as never;
}

describe('POST /api/webhooks/sms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockVerifyInboundSmsWebhook.mockReset();
    mockRecordWebhookEvent.mockReset();
    mockHandleVerifiedInbound.mockReset();
    mockMarkWebhookEventProcessed.mockReset();
    mockCaptureCriticalError.mockReset();
    mockLogger.warn.mockReset();
    mockLogger.info.mockReset();
  });

  it('returns 401 Unauthorized on missing x-twilio-signature (signature verification contract)', async () => {
    mockVerifyInboundSmsWebhook.mockResolvedValue({
      status: 401,
      kind: 'signature_invalid',
      reason: 'missing_signature_header',
    });

    const { POST } = await import('@/app/api/webhooks/sms/route');
    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 on invalid signature mismatch (real error shape)', async () => {
    mockVerifyInboundSmsWebhook.mockResolvedValue({
      status: 401,
      kind: 'signature_invalid',
      reason: 'signature_mismatch',
    });

    const { POST } = await import('@/app/api/webhooks/sms/route');
    const res = await POST(
      makeRequest('From=%2B15551234567&Body=hi', {
        'x-twilio-signature': 'bad',
      })
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 on malformed payload after verify (missing required fields)', async () => {
    mockVerifyInboundSmsWebhook.mockResolvedValue({
      status: 400,
      kind: 'malformed',
      reason: 'missing_required_fields',
    });

    const { POST } = await import('@/app/api/webhooks/sms/route');
    const res = await POST(makeRequest(''));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing_required_fields' });
  });

  it('returns 200 idempotent true for already processed duplicate event (durable dedupe contract)', async () => {
    mockVerifyInboundSmsWebhook.mockResolvedValue({
      message: {
        messageId: 'mid_123',
        fromPhone: '+15551234567',
        body: 'STOP',
        provider: 'twilio',
      },
      rawBody: 'test',
      providerEventId: 'mid_123',
      keyUsed: 'primary',
    });
    mockRecordWebhookEvent.mockResolvedValue({
      isFirstSeen: false,
      alreadyProcessed: true,
      webhookEventId: 'evt_123',
    });

    const { POST } = await import('@/app/api/webhooks/sms/route');
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, idempotent: true });
  });

  it('replays unprocessed event (processed=false retry path)', async () => {
    mockVerifyInboundSmsWebhook.mockResolvedValue({
      message: {
        messageId: 'mid_456',
        fromPhone: '+15551234567',
        body: 'STOP',
        provider: 'twilio',
      },
      rawBody: 'test',
      providerEventId: 'mid_456',
      keyUsed: 'primary',
    });
    mockRecordWebhookEvent.mockResolvedValue({
      isFirstSeen: false,
      alreadyProcessed: false,
      webhookEventId: 'evt_456',
    });
    mockHandleVerifiedInbound.mockResolvedValue({
      status: 200,
      kind: 'stop_applied',
    });
    mockMarkWebhookEventProcessed.mockResolvedValue(undefined);

    const { POST } = await import('@/app/api/webhooks/sms/route');
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, kind: 'stop_applied' });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('retry of unprocessed event'),
      expect.any(Object)
    );
  });

  it('returns 500 and does not mark processed on handler 5xx (fail-closed durable dedupe)', async () => {
    mockVerifyInboundSmsWebhook.mockResolvedValue({
      message: {
        messageId: 'mid_err',
        fromPhone: '+1',
        body: 'x',
        provider: 'twilio',
      },
      rawBody: 'x',
      providerEventId: 'mid_err',
      keyUsed: 'primary',
    });
    mockRecordWebhookEvent.mockResolvedValue({
      isFirstSeen: true,
      alreadyProcessed: false,
      webhookEventId: 'evt_err',
    });
    mockHandleVerifiedInbound.mockResolvedValue({ status: 500, kind: 'error' });

    const { POST } = await import('@/app/api/webhooks/sms/route');
    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: true, kind: 'error' });
    expect(mockMarkWebhookEventProcessed).not.toHaveBeenCalled();
  });

  it('returns 500 on outer catch in recordWebhookEvent (real error shape, capture called)', async () => {
    mockVerifyInboundSmsWebhook.mockResolvedValue({
      message: {
        messageId: 'mid_crash',
        fromPhone: '+1',
        body: 'x',
        provider: 'twilio',
      },
      rawBody: 'x',
      providerEventId: 'mid_crash',
      keyUsed: 'primary',
    });
    mockRecordWebhookEvent.mockRejectedValue(new Error('db down'));

    const { POST } = await import('@/app/api/webhooks/sms/route');
    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal error' });
    expect(mockCaptureCriticalError).toHaveBeenCalled();
  });
});
