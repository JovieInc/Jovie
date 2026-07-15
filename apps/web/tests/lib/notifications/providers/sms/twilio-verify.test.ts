import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env-server', () => ({
  env: {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token_test',
    TWILIO_API_KEY_SID: 'SK_test',
    TWILIO_API_KEY_SECRET: 'secret_test',
    TWILIO_VERIFY_SERVICE_SID: 'VA_test',
  },
}));

vi.mock('@/lib/http/server-fetch', () => ({ serverFetch: vi.fn() }));

import { serverFetch } from '@/lib/http/server-fetch';
import { createTwilioVerifyAdapter } from '@/lib/notifications/providers/sms/twilio-verify';

const mockedFetch = vi.mocked(serverFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Twilio Verify adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts an SMS verification without sending the Better Auth code', async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse({ status: 'pending' }));

    await createTwilioVerifyAdapter().start('+15551112222');

    const [url, init] = mockedFetch.mock.calls[0];
    expect(String(url)).toContain('/Services/VA_test/Verifications');
    const form = new URLSearchParams(init?.body as string);
    expect(form.get('To')).toBe('+15551112222');
    expect(form.get('Channel')).toBe('sms');
    expect(form.has('Code')).toBe(false);
    expect(init?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from('SK_test:secret_test').toString('base64')}`,
    });
  });

  it('accepts only Twilio approved verification checks', async () => {
    mockedFetch
      .mockResolvedValueOnce(jsonResponse({ status: 'approved' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'pending' }));
    const adapter = createTwilioVerifyAdapter();

    await expect(adapter.check('+15551112222', '123456')).resolves.toBe(true);
    await expect(adapter.check('+15551112222', '000000')).resolves.toBe(false);
  });

  it('redacts phone numbers from provider errors', async () => {
    mockedFetch.mockResolvedValueOnce(
      jsonResponse({ message: 'Invalid To +15551112222' }, 400)
    );

    await expect(
      createTwilioVerifyAdapter().start('+15551112222')
    ).rejects.toThrow('Invalid To [REDACTED_PHONE]');
  });
});
