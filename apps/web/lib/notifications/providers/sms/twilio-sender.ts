import 'server-only';
import { env } from '@/lib/env-server';
import { ServerFetchTimeoutError, serverFetch } from '@/lib/http/server-fetch';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';
const TWILIO_TIMEOUT_MS = 8000;
// Intentionally NO retry on POST. Twilio's Messages API is NOT idempotent —
// retrying after a 5xx or timeout can produce duplicate sends (and duplicate
// billing). On a transient failure we bail; the release-notification cron
// will pick the row up on the next tick if it stays `pending`.

/**
 * Strip E.164 phone numbers from a string before logging/persisting.
 * Twilio's error messages frequently echo the recipient phone (e.g.
 * "The 'To' number +15551234567 is unreachable"); we never want that
 * leaking into Sentry, application logs, or `notification_delivery_log`.
 */
export function redactPhoneNumbers(input: string): string {
  return input.replace(/\+?\d[\d\s\-().]{6,}\d/g, '[REDACTED_PHONE]');
}

export interface SendSmsParams {
  /** E.164-formatted destination phone. */
  to: string;
  /** Message body. */
  body: string;
  /** Override the default messaging service. */
  messagingServiceSid?: string;
  /** Override the default from-number. Used when no messaging service is set. */
  fromNumber?: string;
}

export interface SendSmsSuccess {
  success: true;
  providerMessageId: string;
  status?: string;
}

export interface SendSmsFailure {
  success: false;
  error: string;
  /** Twilio numeric error code (e.g. 21610 for unsubscribed recipient). */
  errorCode?: string;
  /** HTTP status from Twilio if applicable. */
  httpStatus?: number;
  /** True when the failure looked transient (timeout, 5xx, network). */
  retryable?: boolean;
}

export type SendSmsResult = SendSmsSuccess | SendSmsFailure;

interface TwilioErrorBody {
  code?: number | string;
  message?: string;
  status?: number | string;
  more_info?: string;
}

interface TwilioMessageBody {
  sid?: string;
  status?: string;
  error_code?: number | string | null;
  error_message?: string | null;
}

/**
 * Send an outbound SMS via Twilio's REST API.
 *
 * Uses `serverFetch` for bounded HTTP (timeout + retry on 5xx/transport errors).
 * Returns a discriminated result; never throws on Twilio-side failures so
 * callers can persist a delivery_log entry without try/catch noise.
 *
 * Throws only if env config is malformed (we treat that as a programmer error).
 */
export async function sendTwilioSms(
  params: SendSmsParams
): Promise<SendSmsResult> {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return {
      success: false,
      error:
        'Twilio not configured (missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN)',
      retryable: false,
    };
  }

  const messagingServiceSid =
    params.messagingServiceSid ?? env.TWILIO_MESSAGING_SERVICE_SID;
  const fromNumber = params.fromNumber ?? env.TWILIO_FROM_NUMBER;
  if (!messagingServiceSid && !fromNumber) {
    return {
      success: false,
      error:
        'Twilio sender not configured (missing TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER)',
      retryable: false,
    };
  }

  const form = new URLSearchParams();
  form.set('To', params.to);
  form.set('Body', params.body);
  // Prefer a messaging service (handles sticky sender, A2P, fallback) when
  // available; fall back to a plain From number for solo dev/test setups.
  if (messagingServiceSid) {
    form.set('MessagingServiceSid', messagingServiceSid);
  } else if (fromNumber) {
    form.set('From', fromNumber);
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const url = `${TWILIO_API_BASE}/Accounts/${encodeURIComponent(
    accountSid
  )}/Messages.json`;

  let response: Response;
  try {
    response = await serverFetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form.toString(),
      timeoutMs: TWILIO_TIMEOUT_MS,
      context: 'twilio.messages.create',
      // No retry: Twilio Messages is not idempotent.
    });
  } catch (error) {
    if (error instanceof ServerFetchTimeoutError) {
      return {
        success: false,
        error: `Twilio timed out after ${error.timeoutMs}ms`,
        retryable: true,
      };
    }
    const rawMessage =
      error instanceof Error ? error.message : 'Twilio fetch failed';
    return {
      success: false,
      error: redactPhoneNumbers(rawMessage),
      retryable: true,
    };
  }

  let parsed: TwilioMessageBody | TwilioErrorBody = {};
  try {
    parsed = (await response.json()) as TwilioMessageBody | TwilioErrorBody;
  } catch {
    // Twilio always returns JSON; non-JSON body indicates a transport-layer
    // surprise. Surface the status without crashing the caller.
  }

  if (!response.ok) {
    const errorBody = parsed as TwilioErrorBody;
    const rawError =
      errorBody.message ?? `Twilio request failed with HTTP ${response.status}`;
    return {
      success: false,
      // Twilio error messages frequently include the recipient phone in
      // plaintext; redact before the value crosses the trust boundary into
      // logs / delivery_log.
      error: redactPhoneNumbers(rawError),
      errorCode: errorBody.code != null ? String(errorBody.code) : undefined,
      httpStatus: response.status,
      retryable: response.status >= 500,
    };
  }

  const messageBody = parsed as TwilioMessageBody;
  if (!messageBody.sid) {
    return {
      success: false,
      error: 'Twilio response missing message sid',
      retryable: false,
    };
  }

  return {
    success: true,
    providerMessageId: messageBody.sid,
    status: messageBody.status,
  };
}
