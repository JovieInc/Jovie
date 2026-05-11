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
    // No secret configured → treat as fail-closed so we don't silently allow
    // traffic past the gate in dev/staging environments missing the key.
    return { success: false, reason: 'turnstile_not_configured' };
  }

  const body = new URLSearchParams();
  body.set('secret', secretKey);
  body.set('response', token);
  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }

  // One bounded retry on transient failures (network errors, 5xx). Token
  // can be re-submitted to siteverify within its short validity window;
  // Cloudflare explicitly supports this for the same token.
  let lastTransientReason: string | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
    try {
      const response = await fetch(VERIFY_URL, {
        method: 'POST',
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        // 5xx is transient and worth retrying; 4xx is not.
        if (response.status >= 500 && attempt < MAX_ATTEMPTS - 1) {
          lastTransientReason = `siteverify_http_${response.status}`;
          await sleep(RETRY_BACKOFF_MS);
          continue;
        }
        return {
          success: false,
          reason: `siteverify_http_${response.status}`,
        };
      }

      const data = (await response.json()) as SiteverifyResponse;
      if (data.success) {
        return { success: true };
      }
      // siteverify returned 200 but success=false — definitive failure, do not retry
      return {
        success: false,
        errorCodes: data['error-codes'] ?? [],
        reason: 'siteverify_failed',
      };
    } catch (error) {
      const isAbort =
        (error as { name?: string } | null)?.name === 'AbortError';
      const reason = isAbort ? 'siteverify_timeout' : 'siteverify_error';
      // Retry on timeout and network errors
      if (attempt < MAX_ATTEMPTS - 1) {
        lastTransientReason = reason;
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      if (!isAbort) {
        await captureError('Turnstile siteverify request failed', error, {
          context: 'turnstile_verify',
        });
      }
      return { success: false, reason };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Unreachable in practice (loop returns on every path), but tsc requires a return
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
