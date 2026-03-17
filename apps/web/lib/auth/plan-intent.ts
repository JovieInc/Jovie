/**
 * Plan intent persistence for the signup-to-checkout funnel.
 *
 * When a user clicks a pricing CTA (e.g., "Choose Founding Member"),
 * we capture their plan intent in a cookie + sessionStorage so it
 * survives the signup → onboarding → checkout flow.
 *
 * Cookie: jovie_plan_intent (30-min TTL, SameSite=Lax)
 * SessionStorage: jovie_plan_intent (backup for restricted cookie envs)
 */

const PLAN_INTENT_KEY = 'jovie_plan_intent';
const PLAN_INTENT_TTL_MS = 30 * 60 * 1000; // 30 minutes

const VALID_PLANS = new Set(['free', 'founding', 'pro', 'growth']);

export type PlanIntentTier = 'free' | 'founding' | 'pro' | 'growth';

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

/**
 * Store plan intent in cookie + sessionStorage.
 * Called when user arrives at /signup with a ?plan= param.
 */
export function setPlanIntent(plan: string): void {
  const validated = validatePlan(plan);
  if (!validated) return;

  // Set cookie with 30-min expiry
  try {
    const expires = new Date(Date.now() + PLAN_INTENT_TTL_MS).toUTCString();
    document.cookie = `${PLAN_INTENT_KEY}=${validated}; path=/; expires=${expires}; SameSite=Lax`;
  } catch {
    // SSR or restricted context
  }

  // Backup in sessionStorage
  try {
    globalThis.sessionStorage?.setItem(
      PLAN_INTENT_KEY,
      JSON.stringify({ plan: validated, ts: Date.now() })
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
  // Try cookie first
  try {
    const cookies = document.cookie.split(';').map(c => c.trim());
    const match = cookies.find(c => c.startsWith(`${PLAN_INTENT_KEY}=`));
    if (match) {
      const value = match.split('=')[1];
      const validated = validatePlan(value);
      if (validated) return validated;
    }
  } catch {
    // SSR or restricted context
  }

  // Fall back to sessionStorage
  try {
    const raw = globalThis.sessionStorage?.getItem(PLAN_INTENT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { plan?: string; ts?: number };
      if (parsed.ts && Date.now() - parsed.ts > PLAN_INTENT_TTL_MS) {
        globalThis.sessionStorage?.removeItem(PLAN_INTENT_KEY);
        return null;
      }
      return validatePlan(parsed.plan);
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
  const cookies = cookieHeader.split(';').map(c => c.trim());
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
    document.cookie = `${PLAN_INTENT_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
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
