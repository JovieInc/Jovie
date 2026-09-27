import { postJsonBeacon } from '@/lib/tracking/json-beacon';
import type { SignupFunnelId, SignupFunnelStepInput } from './signup-funnel';

export const SIGNUP_FUNNEL_BEACON_ENDPOINT = '/api/journey/step';

/**
 * Fire-and-forget beacon for a client-only signup funnel step. Never throws
 * and never blocks the caller. Server-verifiable steps (profile view, fan
 * subscribe, account creation, claim) are recorded server-side instead.
 */
export function trackFunnelStep<F extends SignupFunnelId>(
  input: SignupFunnelStepInput<F>
): void {
  if (globalThis.window === undefined) return;
  try {
    postJsonBeacon(SIGNUP_FUNNEL_BEACON_ENDPOINT, {
      funnel: input.funnel,
      step: input.step,
      ...(input.outcome ? { outcome: input.outcome } : {}),
      ...(input.surface ? { surface: input.surface } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    });
  } catch {
    // Telemetry must never break the measured path.
  }
}

const PENDING_FIRST_VALUE_KEY = 'jovie:signup-funnel:pending-first-value';

/**
 * Mark this browser as having just claimed a profile, so the next dashboard
 * load counts as the artist funnel's `first_value`. Returning artists never
 * carry the marker, so their dashboard loads are not counted.
 */
export function markSignupFirstValuePending(): void {
  try {
    globalThis.localStorage?.setItem(PENDING_FIRST_VALUE_KEY, '1');
  } catch {
    // Storage can be unavailable (private mode); the step is then skipped.
  }
}

/** Fire `first_value` once if a claim in this browser is pending it. */
export function consumeSignupFirstValue(): void {
  try {
    if (globalThis.localStorage?.getItem(PENDING_FIRST_VALUE_KEY) !== '1') {
      return;
    }
    globalThis.localStorage.removeItem(PENDING_FIRST_VALUE_KEY);
  } catch {
    return;
  }
  trackFunnelStep({
    funnel: 'artist_signup',
    step: 'first_value',
    surface: 'dashboard',
  });
}
