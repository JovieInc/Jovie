/**
 * Mid-trial upgrade: carry the remaining entitlement-trial days into the Stripe
 * subscription so an artist who upgrades during their free 14 days is not
 * charged until the trial would have ended.
 *
 * Stripe Checkout requires `subscription_data.trial_end` to be at least 48
 * hours in the future. Inside that window we cannot defer the charge, so the
 * checkout says "charged today" instead; the displayed date and the session
 * parameter always come from this one function.
 */
const HOUR_MS = 3_600_000;
/** 48h Stripe minimum plus a small margin for request latency and clock skew. */
export const STRIPE_CHECKOUT_MIN_TRIAL_MS = 48 * HOUR_MS + 10 * 60_000;

export interface TrialCarryInput {
  readonly isTrialing: boolean;
  /** ISO timestamp from the entitlement, null when not trialing. */
  readonly trialEndsAt: string | null;
  readonly now?: Date;
}

/** The instant (whole seconds) the first charge should happen, or null for now. */
export function resolveTrialCarryEnd(input: TrialCarryInput): Date | null {
  if (!input.isTrialing || !input.trialEndsAt) return null;
  const endMs = Date.parse(input.trialEndsAt);
  if (!Number.isFinite(endMs)) return null;
  const nowMs = (input.now ?? new Date()).getTime();
  if (endMs - nowMs < STRIPE_CHECKOUT_MIN_TRIAL_MS) return null;
  return new Date(Math.floor(endMs / 1000) * 1000);
}

/** Unix seconds for Stripe. */
export function toStripeTrialEnd(end: Date): number {
  return Math.floor(end.getTime() / 1000);
}
