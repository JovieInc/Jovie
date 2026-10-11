/**
 * Signup funnel contract (signup-funnel/v2).
 *
 * One stable id per funnel and one ordered step list per funnel, shared by the
 * client beacon, the server recorder, and the Summer aggregate. Steps follow
 * the real product order: the artist path is chat-first, so auth happens after
 * qualification, not before onboarding.
 *
 * Events carry no identifiers at all: no user id, profile id, handle, email,
 * or URL. A server-derived reporting cohort is allowed so customer-only
 * metrics can exclude synthetic principals without persisting identity.
 * Counts are event counts, not unique visitors.
 */

import type { AccountMetricCohort } from '@/lib/utils/email';

export const SIGNUP_FUNNEL_CONTRACT_VERSION = 'signup-funnel/v2';

export const SIGNUP_FUNNEL_STEPS = {
  /** Fan lands on a public profile and asks for updates from the artist. */
  fan_subscribe: [
    'profile_view',
    'cta_click',
    'contact_submitted',
    'subscribed',
  ],
  /** Artist lands, starts the chat onboarding, signs up, and claims. */
  artist_signup: [
    'landing_view',
    'cta_click',
    'onboarding_started',
    'chat_started',
    'chat_completed',
    'qualified',
    'auth_start',
    'auth_success',
    'claim_complete',
    'first_value',
  ],
} as const;

export type SignupFunnelId = keyof typeof SIGNUP_FUNNEL_STEPS;
export type SignupFunnelStep<F extends SignupFunnelId = SignupFunnelId> =
  (typeof SIGNUP_FUNNEL_STEPS)[F][number];

export const SIGNUP_FUNNEL_IDS = Object.keys(
  SIGNUP_FUNNEL_STEPS
) as SignupFunnelId[];

export const SIGNUP_FUNNEL_ALL_STEPS: readonly string[] = [
  ...new Set(Object.values(SIGNUP_FUNNEL_STEPS).flat()),
];

/**
 * `reached` counts toward the step. `error` is a failed attempt at the step.
 * `dropped` is an explicit exit at the step (dismissed flow, waitlisted).
 */
export const SIGNUP_FUNNEL_OUTCOMES = ['reached', 'error', 'dropped'] as const;
export type SignupFunnelOutcome = (typeof SIGNUP_FUNNEL_OUTCOMES)[number];

/** Where the step happened. Coarse surfaces only, never a path or handle. */
export const SIGNUP_FUNNEL_SURFACES = [
  'homepage',
  'profile',
  'profile_claim',
  'signup',
  'onboarding',
  'dashboard',
  'server',
] as const;
export type SignupFunnelSurface = (typeof SIGNUP_FUNNEL_SURFACES)[number];

/** Short machine reason for error/dropped outcomes. */
export const SIGNUP_FUNNEL_REASON_PATTERN = /^[a-z0-9_]{1,48}$/;

export interface SignupFunnelStepInput<
  F extends SignupFunnelId = SignupFunnelId,
> {
  readonly funnel: F;
  readonly step: SignupFunnelStep<F>;
  readonly outcome?: SignupFunnelOutcome;
  readonly surface?: SignupFunnelSurface;
  readonly reason?: string;
  /** Server-derived metric cohort. Browser beacons are always unattributed. */
  readonly cohort?: AccountMetricCohort;
}

export function isSignupFunnelStep(
  funnel: SignupFunnelId,
  step: string
): boolean {
  return (SIGNUP_FUNNEL_STEPS[funnel] as readonly string[]).includes(step);
}

/** Drop anything that is not a short machine token. */
export function normalizeSignupFunnelReason(
  reason: string | null | undefined
): string | undefined {
  if (typeof reason !== 'string') return undefined;
  const normalized = reason.trim().toLowerCase().replaceAll('-', '_');
  return SIGNUP_FUNNEL_REASON_PATTERN.test(normalized) ? normalized : 'other';
}
