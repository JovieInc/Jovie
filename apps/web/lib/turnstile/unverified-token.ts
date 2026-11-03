/**
 * Fail-open marker for the /start bot check.
 *
 * When the Turnstile widget cannot produce a token (privacy browser, in-app
 * webview, script blocker, slow network, Cloudflare outage) the chat still
 * sends, carrying this marker in place of a token. The server skips
 * siteverify for it and admits the chat on the tighter unverified budget
 * (`admitUnverifiedOnboardingStart`), so a real person never meets a dead
 * end. The marker grants nothing by itself: it is exactly what a client with
 * no token at all would get.
 */

export const UNVERIFIED_TURNSTILE_TOKEN_PREFIX = 'jv-unverified:';

/** Widget states a fail-open send can report. */
export const TURNSTILE_CLIENT_FAILURE_STATUSES = [
  'error',
  'unsupported',
  'unconfigured',
  'loading',
  'interactive',
] as const;

export type TurnstileClientFailureStatus =
  (typeof TURNSTILE_CLIENT_FAILURE_STATUSES)[number];

export function unverifiedTurnstileToken(
  status: TurnstileClientFailureStatus
): string {
  return `${UNVERIFIED_TURNSTILE_TOKEN_PREFIX}${status}`;
}

/**
 * The client-reported widget state behind a fail-open marker, `unknown` for
 * a marker with an unrecognized state, or null when the token is not a
 * marker (a real token, or none).
 */
export function parseUnverifiedTurnstileToken(
  token: string | null | undefined
): TurnstileClientFailureStatus | 'unknown' | null {
  if (!token?.startsWith(UNVERIFIED_TURNSTILE_TOKEN_PREFIX)) return null;
  const status = token.slice(UNVERIFIED_TURNSTILE_TOKEN_PREFIX.length);
  return (TURNSTILE_CLIENT_FAILURE_STATUSES as readonly string[]).includes(
    status
  )
    ? (status as TurnstileClientFailureStatus)
    : 'unknown';
}
