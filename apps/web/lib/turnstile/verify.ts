import 'server-only';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';

/**
 * Cloudflare Turnstile siteverify helper (JOV-2132).
 *
 * Used by /api/chat to gate anonymous onboarding chat on a Cloudflare
 * Turnstile token. The token is minted client-side at /start and submitted
 * with the first chat message. Subsequent messages in the same session
 * skip verification (the session cookie carries the trust forward).
 *
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5_000;
const MAX_ATTEMPTS = 2; // one retry on transient failure
const RETRY_BACKOFF_MS = 250;

export interface TurnstileVerifyResult {
  readonly success: boolean;
  readonly errorCodes?: readonly string[];
  /** Why verification failed in human terms. Useful for debugging, not user-facing. */
  readonly reason?: string;
}

interface SiteverifyResponse {
  readonly success: boolean;
  readonly 'error-codes'?: readonly string[];
  readonly hostname?: string;
  readonly challenge_ts?: string;
  readonly action?: string;
  readonly cdata?: string;
}

function getSecretKey(): string | null {
  const key = env.TURNSTILE_SECRET_KEY;
  if (!key) return null;
  return key;
}

type AttemptOutcome =
  | { readonly kind: 'done'; readonly result: TurnstileVerifyResult }
  | { readonly kind: 'retry'; readonly reason: string };

async function attemptVerify(
  body: URLSearchParams,
  isLastAttempt: boolean
): Promise<AttemptOutcome> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const reason = `siteverify_http_${response.status}`;
      if (response.status >= 500 && !isLastAttempt) {
        return { kind: 'retry', reason };
      }
      return { kind: 'done', result: { success: false, reason } };
    }

    const data = (await response.json()) as SiteverifyResponse;
    if (data.success) {
      return { kind: 'done', result: { success: true } };
    }
    return {
      kind: 'done',
      result: {
        success: false,
        errorCodes: data['error-codes'] ?? [],
        reason: 'siteverify_failed',
      },
    };
  } catch (error) {
    const isAbort = (error as { name?: string } | null)?.name === 'AbortError';
    const reason = isAbort ? 'siteverify_timeout' : 'siteverify_error';
    if (!isLastAttempt) {
      return { kind: 'retry', reason };
    }
    if (!isAbort) {
      await captureError('Turnstile siteverify request failed', error, {
        context: 'turnstile_verify',
      });
    }
    return { kind: 'done', result: { success: false, reason } };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Verify a Turnstile token against Cloudflare's siteverify endpoint.
 *
 * @param token The token submitted by the client.
 * @param remoteIp The visitor's IP address (optional but recommended).
 * @returns `{ success: true }` on valid token; `{ success: false, errorCodes, reason }` otherwise.
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string | null
): Promise<TurnstileVerifyResult> {
  if (!token || token.length === 0) {
    return { success: false, reason: 'missing_token' };
  }

  const secretKey = getSecretKey();
  if (!secretKey) {
    return { success: false, reason: 'turnstile_not_configured' };
  }

  const body = new URLSearchParams();
  body.set('secret', secretKey);
  body.set('response', token);
  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }

  let lastTransientReason: string | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const isLastAttempt = attempt === MAX_ATTEMPTS - 1;
    const outcome = await attemptVerify(body, isLastAttempt);
    if (outcome.kind === 'done') {
      return outcome.result;
    }
    lastTransientReason = outcome.reason;
    await sleep(RETRY_BACKOFF_MS);
  }

  return {
    success: false,
    reason: lastTransientReason ?? 'siteverify_exhausted_retries',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * True when Turnstile is enabled in the current environment. The chat route
 * uses this to skip the gate cleanly when the secret isn't configured (e.g.
 * branch deploys without the env wired up yet).
 */
export function isTurnstileConfigured(): boolean {
  return getSecretKey() !== null;
}
