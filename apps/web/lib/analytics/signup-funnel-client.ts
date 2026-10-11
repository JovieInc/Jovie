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

/**
 * Existing client analytics events that already mark a funnel step. `track()`
 * forwards them here, so the product components keep one tracking call.
 */
export function forwardAnalyticsEventToFunnel(
  event: string,
  properties?: Record<string, unknown>
): void {
  switch (event) {
    case 'onboarding_started':
    case 'chat_started':
    case 'chat_completed':
    case 'qualified':
      trackFunnelStep({
        funnel: 'artist_signup',
        step: event,
        surface: 'onboarding',
      });
      return;
    case 'waitlist_decision_rendered':
      trackFunnelStep({
        funnel: 'artist_signup',
        step: 'qualified',
        outcome: 'dropped',
        surface: 'onboarding',
        reason: 'waitlist',
      });
      return;
    case 'alert_cta_click':
      // Subscribers reopening the flow to manage it are not funnel entries.
      if (properties?.flow_origin === 'subscribe') {
        trackFunnelStep({
          funnel: 'fan_subscribe',
          step: 'cta_click',
          surface: 'profile',
        });
      }
      return;
    default:
      return;
  }
}
