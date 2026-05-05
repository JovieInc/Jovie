/**
 * Unit tests for the Twilio webhook signature adapter.
 *
 * Twilio's spec: HMAC-SHA1(authToken, fullUrl + sortedConcatenatedFormParams)
 * base64-encoded. Verified by re-computing and timing-safe comparing.
 */
import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  parseSecondaryExpiresAt,
  twilioAdapter,
} from '@/lib/notifications/providers/sms/twilio';

const FULL_URL = 'https://jov.ie/api/webhooks/sms';
const PRIMARY_TOKEN = 'primary-test-auth-token';
const SECONDARY_TOKEN = 'secondary-test-auth-token';

function signTwilioPayload(
  authToken: string,
  url: string,
  formParams: URLSearchParams
): string {
  const sortedKeys = Array.from(new Set(Array.from(formParams.keys()))).sort();
  let signed = url;
  for (const key of sortedKeys) {
    for (const value of formParams.getAll(key)) {
      signed += key + value;
    }
  }
  return createHmac('sha1', authToken).update(signed, 'utf8').digest('base64');
}

function rawBodyOf(form: Record<string, string>): string {
  return new URLSearchParams(form).toString();
}

describe('twilioAdapter.verifySignature', () => {
  it('accepts a valid primary signature', () => {
    const form = {
      MessageSid: 'SM123',
      From: '+15555550100',
      To: '+15555550999',
      Body: 'JOIN J7K4Q2HZ',
    };
    const rawBody = rawBodyOf(form);
    const sig = signTwilioPayload(
      PRIMARY_TOKEN,
      FULL_URL,
      new URLSearchParams(rawBody)
    );

    const headers = new Headers();
    headers.set('x-twilio-signature', sig);

    const result = twilioAdapter.verifySignature({
      headers,
      rawBody,
      fullUrl: FULL_URL,
      primaryToken: PRIMARY_TOKEN,
    });

    expect(result.ok).toBe(true);
    expect(result.keyUsed).toBe('primary');
  });

  it('rejects when signature is missing', () => {
    const result = twilioAdapter.verifySignature({
      headers: new Headers(),
      rawBody: '',
      fullUrl: FULL_URL,
      primaryToken: PRIMARY_TOKEN,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_signature_header');
  });

  it('rejects an invalid signature', () => {
    const headers = new Headers();
    headers.set('x-twilio-signature', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    const result = twilioAdapter.verifySignature({
      headers,
      rawBody: 'MessageSid=SM1',
      fullUrl: FULL_URL,
      primaryToken: PRIMARY_TOKEN,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
  });

  it('accepts a secondary signature inside the rotation window', () => {
    const form = { MessageSid: 'SM2', From: '+15555550100' };
    const rawBody = rawBodyOf(form);
    const sig = signTwilioPayload(
      SECONDARY_TOKEN,
      FULL_URL,
      new URLSearchParams(rawBody)
    );
    const headers = new Headers();
    headers.set('x-twilio-signature', sig);

    const future = new Date(Date.now() + 60 * 60 * 1000);
    const result = twilioAdapter.verifySignature({
      headers,
      rawBody,
      fullUrl: FULL_URL,
      primaryToken: PRIMARY_TOKEN,
      secondaryToken: SECONDARY_TOKEN,
      secondaryExpiresAt: future,
    });

    expect(result.ok).toBe(true);
    expect(result.keyUsed).toBe('secondary');
  });

  it('rejects a secondary signature past the rotation window', () => {
    const form = { MessageSid: 'SM3' };
    const rawBody = rawBodyOf(form);
    const sig = signTwilioPayload(
      SECONDARY_TOKEN,
      FULL_URL,
      new URLSearchParams(rawBody)
    );
    const headers = new Headers();
    headers.set('x-twilio-signature', sig);

    const past = new Date(Date.now() - 60 * 60 * 1000);
    const result = twilioAdapter.verifySignature({
      headers,
      rawBody,
      fullUrl: FULL_URL,
      primaryToken: PRIMARY_TOKEN,
      secondaryToken: SECONDARY_TOKEN,
      secondaryExpiresAt: past,
    });

    expect(result.ok).toBe(false);
  });
});

describe('twilioAdapter.parseInbound', () => {
  it('extracts core fields from a Twilio form payload', () => {
    const form = new URLSearchParams({
      MessageSid: 'SM123',
      From: '+15555550100',
      To: '+15555550999',
      Body: 'JOIN J7K4Q2HZ',
    });
    const message = twilioAdapter.parseInbound(form);
    expect(message).toMatchObject({
      provider: 'twilio',
      messageId: 'SM123',
      fromPhone: '+15555550100',
      toPhone: '+15555550999',
      body: 'JOIN J7K4Q2HZ',
    });
  });

  it('falls back to SmsSid when MessageSid is missing', () => {
    const form = new URLSearchParams({ SmsSid: 'SS456', From: '+1' });
    const message = twilioAdapter.parseInbound(form);
    expect(message.messageId).toBe('SS456');
  });
});

describe('parseSecondaryExpiresAt', () => {
  it('parses ISO-8601 strings', () => {
    expect(parseSecondaryExpiresAt('2026-12-31T23:59:59Z')).toBeInstanceOf(
      Date
    );
  });

  it('parses UNIX seconds as a number string', () => {
    const result = parseSecondaryExpiresAt('1900000000');
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(1900000000 * 1000);
  });

  it('returns null for invalid input', () => {
    expect(parseSecondaryExpiresAt(undefined)).toBeNull();
    expect(parseSecondaryExpiresAt('')).toBeNull();
    expect(parseSecondaryExpiresAt('not-a-date')).toBeNull();
  });
});
