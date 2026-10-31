/**
 * Fail-open marker token for the anonymous /start bot check (JOV-10194).
 *
 * When the invisible Turnstile widget hard-fails (error / timeout /
 * unsupported / unconfigured) or a held first send waits 8s without a token,
 * the client substitutes this marker for the Turnstile token. The server then
 * admits the request on the unverified-budget path
 * (`lib/turnstile/bot-check-budget.server.ts`) instead of dead-ending the
 * visitor. The marker is never sent to Cloudflare siteverify.
 *
 * Shared by the client component and the server handler, so it deliberately
 * lives outside any `server-only` module.
 */

export const ONBOARDING_TURNSTILE_MARKER_TOKEN =
  'jovie-onboarding-turnstile-unavailable';

/** Widget statuses that fail the first message open immediately. */
export const ONBOARDING_TURNSTILE_FAIL_OPEN_STATUSES = [
  'error',
  'timeout',
  'unsupported',
  'unconfigured',
] as const;

/** How long a held first send waits for a token before failing open. */
export const ONBOARDING_TURNSTILE_FAIL_OPEN_WAIT_MS = 8_000;

/**
 * Why the client sent the marker: the widget's hard-failure status, or
 * `loading` when the 8s wait elapsed. Reported to the server as
 * `botCheckClientStatus` and recorded on the `onboarding_bot_check` event.
 */
export const ONBOARDING_BOT_CHECK_CLIENT_STATUSES = [
  ...ONBOARDING_TURNSTILE_FAIL_OPEN_STATUSES,
  'loading',
] as const;

export type OnboardingBotCheckClientStatus =
  (typeof ONBOARDING_BOT_CHECK_CLIENT_STATUSES)[number];
