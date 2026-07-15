import 'server-only';

import type { PhoneVerificationPort } from '@/lib/auth/phone-verification';
import { env } from '@/lib/env-server';
import { serverFetch } from '@/lib/http/server-fetch';
import { redactPhoneNumbers } from './twilio-sender';

const TWILIO_VERIFY_API_BASE = 'https://verify.twilio.com/v2';
const TWILIO_TIMEOUT_MS = 8000;

interface TwilioVerifyResponse {
  status?: string;
  message?: string;
}

async function postVerify(
  path: string,
  form: URLSearchParams
): Promise<TwilioVerifyResponse> {
  const hasApiKey = Boolean(
    env.TWILIO_API_KEY_SID && env.TWILIO_API_KEY_SECRET
  );
  const username = hasApiKey ? env.TWILIO_API_KEY_SID : env.TWILIO_ACCOUNT_SID;
  const password = hasApiKey
    ? env.TWILIO_API_KEY_SECRET
    : env.TWILIO_AUTH_TOKEN;
  const serviceSid = env.TWILIO_VERIFY_SERVICE_SID;
  if (!username || !password || !serviceSid) {
    throw new Error('Phone verification is not configured');
  }

  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const response = await serverFetch(
    `${TWILIO_VERIFY_API_BASE}/Services/${encodeURIComponent(serviceSid)}/${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form.toString(),
      timeoutMs: TWILIO_TIMEOUT_MS,
      context: `twilio.verify.${path}`,
    }
  );

  const body = (await response
    .json()
    .catch(() => ({}))) as TwilioVerifyResponse;
  if (!response.ok) {
    throw new Error(
      redactPhoneNumbers(
        body.message ?? `Phone verification failed with HTTP ${response.status}`
      )
    );
  }
  return body;
}

export function createTwilioVerifyAdapter(): PhoneVerificationPort {
  return {
    async start(phoneNumber) {
      const form = new URLSearchParams({ To: phoneNumber, Channel: 'sms' });
      await postVerify('Verifications', form);
    },
    async check(phoneNumber, code) {
      const form = new URLSearchParams({ To: phoneNumber, Code: code });
      const result = await postVerify('VerificationCheck', form);
      return result.status === 'approved';
    },
  };
}
