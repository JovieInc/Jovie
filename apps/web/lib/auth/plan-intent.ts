/**
 * Plan intent persistence for the signup-to-checkout funnel.
 *
 * When a user clicks a pricing CTA (e.g., "Choose Pro"),
 * we capture their plan intent in a cookie + sessionStorage so it
 * survives the signup → onboarding → checkout flow.
 *
 * Cookie: jovie_plan_intent (30-min TTL, SameSite=Lax)
 * SessionStorage: jovie_plan_intent (backup for restricted cookie envs)
 */

const PLAN_INTENT_KEY = 'jovie_plan_intent';
const PLAN_INTENT_TTL_MS = 30 * 60 * 1000; // 30 minutes

const VALID_PLANS = new Set(['free', 'pro', 'team', 'enterprise', 'max']);

export type PlanIntentTier = 'free' | 'pro' | 'team' | 'enterprise' | 'max';

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

export type AuthBillingInterval = 'monthly' | 'annual';

export type PlanIntentRecord = {
  readonly plan: PlanIntentTier;
  readonly interval: AuthBillingInterval | null;
  readonly artist: string | null;
};

type PlanIntentStoragePayload = {
  readonly plan?: string;
  readonly ts?: number;
  readonly interval?: string;
  readonly artist?: string;
};

function parseBillingInterval(
  value: string | null | undefined
): AuthBillingInterval | null {
  if (value === 'monthly' || value === 'annual') return value;
  return null;
}

function parseStoredPlanIntent(
  raw: string,
  now = Date.now()
): PlanIntentRecord | null {
  const parsed = JSON.parse(raw) as PlanIntentStoragePayload;
  if (parsed.ts && now - parsed.ts > PLAN_INTENT_TTL_MS) {
    return null;
  }
  const plan = validatePlan(parsed.plan);
  if (!plan) return null;
  return {
    plan,
    interval: parseBillingInterval(parsed.interval),
    artist: parsed.artist?.trim() ? parsed.artist : null,
  };
}

/**
 * Store plan intent in cookie + sessionStorage.
 * Called when user arrives at /signup with a ?plan= param.
 * Cookie stays plan-only so existing server readers keep working.
 */
export function setPlanIntent(
  plan: string,
  extras?: {
    readonly interval?: AuthBillingInterval | null;
    readonly artist?: string | null;
  }
): void {
  const validated = validatePlan(plan);
  if (!validated) return;

  // Set cookie with 30-min expiry
  try {
    const expires = new Date(Date.now() + PLAN_INTENT_TTL_MS).toUTCString();
    document.cookie = `${PLAN_INTENT_KEY}=${validated}; path=/; expires=${expires}; SameSite=Lax${getSecureCookieAttribute()}`;
  } catch {
    // SSR or restricted context
  }

  // Backup in sessionStorage — extras survive OAuth/email interrupts
  try {
    globalThis.sessionStorage?.setItem(
      PLAN_INTENT_KEY,
      JSON.stringify({
        plan: validated,
        ts: Date.now(),
        ...(extras?.interval ? { interval: extras.interval } : {}),
        ...(extras?.artist ? { artist: extras.artist } : {}),
      })
    );
  } catch {
    // sessionStorage unavailable
  }
}

/**
 * Read plan intent from cookie, falling back to sessionStorage.
 * Returns the validated plan tier or null if absent/expired/invalid.
 */
export function getPlanIntent(): PlanIntentTier | null {
  return getPlanIntentRecord()?.plan ?? null;
}

/**
 * Read the full plan-intent record (tier + billing interval + artist)
 * from cookie/sessionStorage. Cookie is plan-only; extras live in storage.
 */
export function getPlanIntentRecord(): PlanIntentRecord | null {
  let cookiePlan: PlanIntentTier | null = null;

  // Try cookie first
  try {
    const cookies = readCookieTokens(document.cookie);
    const match = cookies.find(c => c.startsWith(`${PLAN_INTENT_KEY}=`));
    if (match) {
      cookiePlan = validatePlan(match.split('=')[1]);
    }
  } catch {
    // SSR or restricted context
  }

  // Fall back to sessionStorage for extras (and plan if cookie missing)
  try {
    const raw = globalThis.sessionStorage?.getItem(PLAN_INTENT_KEY);
    if (raw) {
      const stored = parseStoredPlanIntent(raw);
      if (!stored) {
        globalThis.sessionStorage?.removeItem(PLAN_INTENT_KEY);
        return cookiePlan
          ? { plan: cookiePlan, interval: null, artist: null }
          : null;
      }
      return {
        plan: cookiePlan ?? stored.plan,
        interval: stored.interval,
        artist: stored.artist,
      };
    }
  } catch {
    // sessionStorage unavailable or corrupt
  }

  return cookiePlan ? { plan: cookiePlan, interval: null, artist: null } : null;
}

/**
 * Read plan intent from a cookie header string (server-side).
 * Used by server components and server actions.
 */
export function getPlanIntentFromCookies(
  cookieHeader: string
): PlanIntentTier | null {
  const cookies = readCookieTokens(cookieHeader);
  const match = cookies.find(c => c.startsWith(`${PLAN_INTENT_KEY}=`));
  if (!match) return null;
  return validatePlan(match.split('=')[1]);
}

/**
 * Clear plan intent from both cookie and sessionStorage.
 * Called after checkout completes or user clicks "Skip".
 */
export function clearPlanIntent(): void {
  // Expire the cookie
  try {
    document.cookie = `${PLAN_INTENT_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${getSecureCookieAttribute()}`;
  } catch {
    // SSR or restricted context
  }

  // Remove from sessionStorage
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
