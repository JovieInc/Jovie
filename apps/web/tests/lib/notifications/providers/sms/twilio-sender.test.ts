import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env-server', () => ({
  env: {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token_test',
    TWILIO_MESSAGING_SERVICE_SID: 'MG_test',
    TWILIO_FROM_NUMBER: '+15551234567',
  },
}));

vi.mock('@/lib/http/server-fetch', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/http/server-fetch')
  >('@/lib/http/server-fetch');
  return {
    ...actual,
    serverFetch: vi.fn(),
  };
});

import { ServerFetchTimeoutError, serverFetch } from '@/lib/http/server-fetch';
import {
  redactPhoneNumbers,
  sendTwilioSms,
} from '@/lib/notifications/providers/sms/twilio-sender';

const mockedFetch = vi.mocked(serverFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('sendTwilioSms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success with the provider message id on a 2xx response', async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse({ sid: 'SM_abc123', status: 'queued' })
    );

    const result = await sendTwilioSms({ to: '+15551112222', body: 'hi' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.providerMessageId).toBe('SM_abc123');
      expect(result.status).toBe('queued');
    }
  });

  it('uses MessagingServiceSid by default and includes To/Body', async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse({ sid: 'SM_x' }));

    await sendTwilioSms({ to: '+15551112222', body: 'hello world' });

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockedFetch.mock.calls[0];
    const form = new URLSearchParams(init?.body as string);
    expect(form.get('To')).toBe('+15551112222');
    expect(form.get('Body')).toBe('hello world');
    expect(form.get('MessagingServiceSid')).toBe('MG_test');
    expect(form.get('From')).toBeNull();
  });

  it('returns a failure with twilio error code on 4xx', async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse({ code: 21610, message: 'Recipient unsubscribed' }, 400)
    );

    const result = await sendTwilioSms({ to: '+15551112222', body: 'hi' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe('21610');
      expect(result.error).toContain('Recipient unsubscribed');
      expect(result.httpStatus).toBe(400);
      expect(result.retryable).toBe(false);
    }
  });

  it('marks 5xx failures retryable', async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse({ message: 'service unavailable' }, 503)
    );

    const result = await sendTwilioSms({ to: '+15551112222', body: 'hi' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.retryable).toBe(true);
    }
  });

  it('does NOT retry on 5xx (Twilio Messages is non-idempotent)', async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse({}, 500));

    await sendTwilioSms({ to: '+15551112222', body: 'hi' });

    // The single POST call must not be retried — duplicate sends would
    // result in duplicate billed messages.
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockedFetch.mock.calls[0];
    expect(init?.retry).toBeUndefined();
  });

  it('redacts phone numbers from Twilio error messages before returning', async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          code: 21211,
          message:
            "The 'To' phone number: +15551234567, is not currently reachable",
        },
        400
      )
    );

    const result = await sendTwilioSms({ to: '+15551112222', body: 'hi' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain('+15551234567');
      expect(result.error).toContain('[REDACTED_PHONE]');
    }
  });

  it('reports timeouts as retryable failures', async () => {
    mockedFetch.mockRejectedValueOnce(
      new ServerFetchTimeoutError(
        'twilio.messages.create timed out after 8000ms',
        8000,
        'twilio.messages.create'
      )
    );

    const result = await sendTwilioSms({ to: '+15551112222', body: 'hi' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('timed out');
      expect(result.retryable).toBe(true);
    }
  });

  it('returns a clear failure when response is missing sid', async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse({}, 200));

    const result = await sendTwilioSms({ to: '+15551112222', body: 'hi' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('missing message sid');
      expect(result.retryable).toBe(false);
    }
  });
});

describe('redactPhoneNumbers', () => {
  it('redacts E.164 numbers in any position', () => {
    expect(redactPhoneNumbers('Send to +15551234567 failed')).toBe(
      'Send to [REDACTED_PHONE] failed'
    );
  });

  it('redacts numbers without + prefix when long enough', () => {
    expect(redactPhoneNumbers('to 15551234567')).toContain('[REDACTED_PHONE]');
  });

  it('redacts formatted numbers with separators', () => {
    expect(
      redactPhoneNumbers('number (555) 123-4567 is unreachable')
    ).toContain('[REDACTED_PHONE]');
  });

  it('leaves messages without phone numbers unchanged', () => {
    expect(redactPhoneNumbers('queued for delivery')).toBe(
      'queued for delivery'
    );
  });
});

describe('sendTwilioSms — env-driven failures', () => {
  it('fails fast when account sid or auth token is missing', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env-server', () => ({
      env: {
        TWILIO_ACCOUNT_SID: undefined,
        TWILIO_AUTH_TOKEN: undefined,
        TWILIO_MESSAGING_SERVICE_SID: undefined,
        TWILIO_FROM_NUMBER: undefined,
      },
    }));
    const fresh = await import(
      '@/lib/notifications/providers/sms/twilio-sender'
    );

    const result = await fresh.sendTwilioSms({
      to: '+15551112222',
      body: 'hi',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Twilio not configured');
      expect(result.retryable).toBe(false);
    }
  });
});
