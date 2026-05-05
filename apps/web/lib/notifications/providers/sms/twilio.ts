import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  InboundSmsMessage,
  SignatureVerificationResult,
  SmsProviderAdapter,
} from './types';

/**
 * Twilio inbound webhook signature verification.
 *
 * Per Twilio docs, X-Twilio-Signature is computed as:
 *   HMAC-SHA1(authToken, fullUrl + concatenatedSortedFormParams).digest('base64')
 *
 * The `fullUrl` is the URL Twilio called, including query string but
 * excluding any forwarded host rewrites. The form params are the
 * application/x-www-form-urlencoded inbound body, sorted by key, with
 * keys+values concatenated (no separator).
 *
 * We support a 2-key rotation window: primary always; secondary only
 * while `TWILIO_AUTH_TOKEN_SECONDARY_EXPIRES_AT` is in the future.
 */
function buildExpectedSignature(
  authToken: string,
  fullUrl: string,
  formParams: URLSearchParams
): string {
  const sortedKeys = Array.from(new Set(Array.from(formParams.keys()))).sort(
    (a, b) => a.localeCompare(b)
  );
  let signed = fullUrl;
  for (const key of sortedKeys) {
    const values = formParams.getAll(key);
    for (const value of values) {
      signed += key + value;
    }
  }
  return createHmac('sha1', authToken).update(signed, 'utf8').digest('base64');
}

function compareSignaturesTimingSafe(
  provided: string,
  expected: string
): boolean {
  const providedBuf = Buffer.from(provided, 'base64');
  const expectedBuf = Buffer.from(expected, 'base64');
  if (providedBuf.length === 0 || providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

function parseFormFromRawBody(rawBody: string): URLSearchParams {
  return new URLSearchParams(rawBody);
}

export const twilioAdapter: SmsProviderAdapter = {
  name: 'twilio',

  verifySignature(input): SignatureVerificationResult {
    const provided = input.headers.get('x-twilio-signature');
    if (!provided) {
      return { ok: false, reason: 'missing_signature_header' };
    }

    const formParams = parseFormFromRawBody(input.rawBody);

    const primaryExpected = buildExpectedSignature(
      input.primaryToken,
      input.fullUrl,
      formParams
    );
    if (compareSignaturesTimingSafe(provided, primaryExpected)) {
      return { ok: true, keyUsed: 'primary' };
    }

    const secondaryActive =
      typeof input.secondaryToken === 'string' &&
      input.secondaryToken.length > 0 &&
      input.secondaryExpiresAt instanceof Date &&
      input.secondaryExpiresAt.getTime() > Date.now();

    if (secondaryActive && input.secondaryToken) {
      const secondaryExpected = buildExpectedSignature(
        input.secondaryToken,
        input.fullUrl,
        formParams
      );
      if (compareSignaturesTimingSafe(provided, secondaryExpected)) {
        return { ok: true, keyUsed: 'secondary' };
      }
    }

    return { ok: false, reason: 'signature_mismatch' };
  },

  parseInbound(form): InboundSmsMessage {
    const get = (key: string): string => {
      if (form instanceof URLSearchParams) return form.get(key) ?? '';
      return form[key] ?? '';
    };

    const messageId = get('MessageSid') || get('SmsSid');
    const fromPhone = get('From');
    const toPhone = get('To');
    const body = get('Body');

    return {
      provider: 'twilio',
      messageId,
      fromPhone,
      toPhone,
      body,
    };
  },
};

/**
 * Convenience: parse a date in any of: ISO-8601, RFC-3339, UNIX seconds.
 * Returns null if the string is missing or unparsable.
 */
export function parseSecondaryExpiresAt(raw: string | undefined): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const epoch = Number.parseInt(trimmed, 10);
    return Number.isFinite(epoch) ? new Date(epoch * 1000) : null;
  }
  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
