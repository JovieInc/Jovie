/**
 * Plan intent persistence for the signup-to-checkout funnel.
 *
 * When a user clicks a pricing CTA (e.g., "Start 14-day Pro trial"),
 * we capture their plan + billing interval so it survives
 * signup → login → provider/email interrupt → onboarding → checkout.
 *
 * Cookie: jovie_plan_intent + jovie_billing_interval (30-min TTL, SameSite=Lax)
 * SessionStorage: jovie_plan_intent (backup for restricted cookie envs)
 */

import {
  type BillingInterval,
  validateBillingInterval,
} from '@/lib/billing/offer-truth';

const PLAN_INTENT_KEY = 'jovie_plan_intent';
const BILLING_INTERVAL_KEY = 'jovie_billing_interval';
const PLAN_INTENT_TTL_MS = 30 * 60 * 1000; // 30 minutes

const VALID_PLANS = new Set(['free', 'pro', 'team', 'enterprise', 'max']);

export type PlanIntentTier = 'free' | 'pro' | 'team' | 'enterprise' | 'max';

export interface OfferIntent {
  readonly plan: PlanIntentTier;
  readonly interval: BillingInterval;
}

function getSecureCookieAttribute(): string {
  try {
    return globalThis.location?.protocol === 'https:' ||
      globalThis.isSecureContext
      ? '; Secure'
      : '';
  } catch {
    return '';
  }
}

function readCookieTokens(cookieHeader: string): string[] {
  return cookieHeader
    .split(';')
    .map(cookie => cookie.trim())
    .filter(Boolean);
}

function readCookieValue(
  cookies: readonly string[],
  key: string
): string | null {
  const match = cookies.find(cookie => cookie.startsWith(`${key}=`));
  if (!match) return null;
  return match.slice(key.length + 1) || null;
}

function writeCookie(key: string, value: string): void {
  const expires = new Date(Date.now() + PLAN_INTENT_TTL_MS).toUTCString();
  document.cookie = `${key}=${value}; path=/; expires=${expires}; SameSite=Lax${getSecureCookieAttribute()}`;
}

function expireCookie(key: string): void {
  document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${getSecureCookieAttribute()}`;
}

/**
 * Validate that a string is a known plan tier.
 * Returns the validated plan or null if invalid.
 */
export function validatePlan(
  value: string | null | undefined
): PlanIntentTier | null {
  if (!value || !VALID_PLANS.has(value)) return null;
  return value as PlanIntentTier;
}

function resolveStoredInterval(
  plan: PlanIntentTier,
  interval: string | null | undefined
): BillingInterval {
  if (plan === 'free') return 'month';
  return validateBillingInterval(interval) ?? 'month';
}

/**
 * Store plan + interval intent in cookie + sessionStorage.
 * Called when the user arrives at auth with ?plan= / ?interval=.
 */
export function setPlanIntent(plan: string, interval?: string | null): void {
  const validated = validatePlan(plan);
  if (!validated) return;
  const resolvedInterval = resolveStoredInterval(validated, interval);

  try {
    writeCookie(PLAN_INTENT_KEY, validated);
    writeCookie(BILLING_INTERVAL_KEY, resolvedInterval);
  } catch {
    // SSR or restricted context
  }

  try {
    globalThis.sessionStorage?.setItem(
      PLAN_INTENT_KEY,
      JSON.stringify({
        plan: validated,
        interval: resolvedInterval,
        ts: Date.now(),
      })
    );
  } catch {
    // sessionStorage unavailable
  }
}

export function persistOfferIntentFromSearchParams(searchParams: {
  get(name: string): string | null;
}): OfferIntent | null {
  const plan = validatePlan(searchParams.get('plan'));
  if (!plan) return getOfferIntent();
  const interval = resolveStoredInterval(plan, searchParams.get('interval'));
  setPlanIntent(plan, interval);
  return { plan, interval };
}

/**
 * Read plan intent from cookie, falling back to sessionStorage.
 * Returns the validated plan tier or null if absent/expired/invalid.
 */
export function getPlanIntent(): PlanIntentTier | null {
  return getOfferIntent()?.plan ?? null;
}

export function getBillingInterval(): BillingInterval {
  return getOfferIntent()?.interval ?? 'month';
}

export function getOfferIntent(): OfferIntent | null {
  try {
    const cookies = readCookieTokens(document.cookie);
    const plan = validatePlan(readCookieValue(cookies, PLAN_INTENT_KEY));
    if (plan) {
      return {
        plan,
        interval: resolveStoredInterval(
          plan,
          readCookieValue(cookies, BILLING_INTERVAL_KEY)
        ),
      };
    }
  } catch {
    // SSR or restricted context
  }

  try {
    const raw = globalThis.sessionStorage?.getItem(PLAN_INTENT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        plan?: string;
        interval?: string;
        ts?: number;
      };
      if (parsed.ts && Date.now() - parsed.ts > PLAN_INTENT_TTL_MS) {
        globalThis.sessionStorage?.removeItem(PLAN_INTENT_KEY);
        return null;
      }
      const plan = validatePlan(parsed.plan);
      if (!plan) return null;
      return {
        plan,
        interval: resolveStoredInterval(plan, parsed.interval),
      };
    }
  } catch {
    // sessionStorage unavailable or corrupt
  }

  return null;
}

/**
 * Read plan intent from a cookie header string (server-side).
 * Used by server components and server actions.
 */
export function getPlanIntentFromCookies(
  cookieHeader: string
): PlanIntentTier | null {
  return getOfferIntentFromCookies(cookieHeader)?.plan ?? null;
}

export function getBillingIntervalFromCookies(
  cookieHeader: string
): BillingInterval {
  return getOfferIntentFromCookies(cookieHeader)?.interval ?? 'month';
}

export function getOfferIntentFromCookies(
  cookieHeader: string
): OfferIntent | null {
  const cookies = readCookieTokens(cookieHeader);
  const plan = validatePlan(readCookieValue(cookies, PLAN_INTENT_KEY));
  if (!plan) return null;
  return {
    plan,
    interval: resolveStoredInterval(
      plan,
      readCookieValue(cookies, BILLING_INTERVAL_KEY)
    ),
  };
}

/**
 * Clear plan intent from both cookie and sessionStorage.
 * Called after checkout completes or user clicks "Skip".
 */
export function clearPlanIntent(): void {
  try {
    expireCookie(PLAN_INTENT_KEY);
    expireCookie(BILLING_INTERVAL_KEY);
  } catch {
    // SSR or restricted context
  }

  try {
    globalThis.sessionStorage?.removeItem(PLAN_INTENT_KEY);
  } catch {
    // sessionStorage unavailable
  }
}

/**
 * Check if a plan intent represents a paid plan (not free or null).
 */
export function isPaidIntent(plan: PlanIntentTier | null): boolean {
  return plan !== null && plan !== 'free';
}

/**
 * Default plan for organic users who didn't express paid intent.
 */
export const DEFAULT_UPSELL_PLAN: PlanIntentTier = 'pro';

/**
 * Spotify follower threshold for recommending Max over Pro.
 */
export const MAX_FOLLOWER_THRESHOLD = 10_000;

/**
 * Recommend a plan tier based on Spotify follower count.
 * Artists with 10K+ followers get Max; everyone else gets Pro.
 */
export function recommendPlan(spotifyFollowers: number | null): PlanIntentTier {
  if (spotifyFollowers !== null && spotifyFollowers >= MAX_FOLLOWER_THRESHOLD) {
    return 'max';
  }
  return DEFAULT_UPSELL_PLAN;
}
