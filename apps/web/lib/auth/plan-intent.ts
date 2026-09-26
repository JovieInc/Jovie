/** Shared auth intent. Legacy plan identities are decoded, never purchase authority. */

export type BillingInterval = 'month' | 'year';

/** Decode persisted interval aliases; never purchase authority. */
export function validateBillingInterval(
  value: string | null | undefined
): BillingInterval | null {
  if (value === 'month' || value === 'year') return value;
  if (value === 'monthly') return 'month';
  if (value === 'annual' || value === 'yearly') return 'year';
  return null;
}

const PLAN_INTENT_KEY = 'jovie_plan_intent';
const BILLING_INTERVAL_KEY = 'jovie_billing_interval';
const PLAN_INTENT_TTL_MS = 30 * 60 * 1000;
const VALID_PLANS = new Set(['free', 'pro', 'team', 'enterprise', 'max']);
export type PlanIntentTier = 'free' | 'pro' | 'team' | 'enterprise' | 'max';
export interface PlanIntentRecord {
  readonly plan: PlanIntentTier;
  readonly interval: BillingInterval | null;
  readonly artist: string | null;
}
export type OfferIntent = PlanIntentRecord;
export interface PlanIntentExtras {
  readonly interval?: string | null;
  readonly artist?: string | null;
}

export function validatePlan(value: unknown): PlanIntentTier | null {
  return typeof value === 'string' && VALID_PLANS.has(value)
    ? (value as PlanIntentTier)
    : null;
}

export function parseAuthOfferArtist(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const artist = value
    .replaceAll(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 80);
  return !artist || /^(?:https?:)?\/\//i.test(artist) ? null : artist;
}

export function parseAuthBillingInterval(
  value: unknown
): BillingInterval | null {
  return typeof value === 'string'
    ? validateBillingInterval(value.trim().toLowerCase())
    : null;
}

interface AuthOfferParamReader {
  get(key: string): string | null;
}

export function readAuthOfferIntervalFromParams(
  params: AuthOfferParamReader
): BillingInterval | null {
  return (
    parseAuthBillingInterval(params.get('interval')) ??
    parseAuthBillingInterval(params.get('billing'))
  );
}

export function readAuthOfferArtistFromParams(
  params: AuthOfferParamReader
): string | null {
  return (
    parseAuthOfferArtist(params.get('artist')) ??
    parseAuthOfferArtist(params.get('artist_name'))
  );
}

function cookieValue(header: string, key: string): string | null {
  const token = header
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${key}=`));
  return token?.slice(key.length + 1) || null;
}

function writeCookie(key: string, value: string, expires: string): void {
  try {
    const secure =
      globalThis.location?.protocol === 'https:' || globalThis.isSecureContext
        ? '; Secure'
        : '';
    document.cookie = `${key}=${value}; path=/; expires=${expires}; SameSite=Lax${secure}`;
  } catch {
    /* SSR or restricted cookies; session storage remains independent. */
  }
}

/** Object extras are canonical; the string argument decodes #17708 callers. */
export function setPlanIntent(
  plan: string,
  extras?: PlanIntentExtras | string | null
): void {
  const validated = validatePlan(plan);
  if (!validated) return;
  const input = typeof extras === 'string' ? { interval: extras } : extras;
  const record: PlanIntentRecord = {
    plan: validated,
    interval: parseAuthBillingInterval(input?.interval),
    artist: parseAuthOfferArtist(input?.artist),
  };
  const now = Date.now();
  const expires = new Date(now + PLAN_INTENT_TTL_MS).toUTCString();
  writeCookie(PLAN_INTENT_KEY, validated, expires);
  writeCookie(
    BILLING_INTERVAL_KEY,
    record.interval ?? '',
    record.interval ? expires : new Date(0).toUTCString()
  );
  try {
    globalThis.sessionStorage?.setItem(
      PLAN_INTENT_KEY,
      JSON.stringify({ ...record, ts: now })
    );
  } catch {
    /* Restricted session storage; cookies remain independent. */
  }
}

export function getOfferIntentFromCookies(
  header: string
): PlanIntentRecord | null {
  const plan = validatePlan(cookieValue(header, PLAN_INTENT_KEY));
  return plan
    ? {
        plan,
        interval: parseAuthBillingInterval(
          cookieValue(header, BILLING_INTERVAL_KEY)
        ),
        artist: null,
      }
    : null;
}

function readStoredIntent(): PlanIntentRecord | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(PLAN_INTENT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const data = parsed as Record<string, unknown>;
    const plan = validatePlan(data.plan);
    if (
      !plan ||
      typeof data.ts !== 'number' ||
      !Number.isFinite(data.ts) ||
      data.ts > Date.now() ||
      Date.now() - data.ts >= PLAN_INTENT_TTL_MS
    ) {
      globalThis.sessionStorage?.removeItem(PLAN_INTENT_KEY);
      return null;
    }
    return {
      plan,
      interval: parseAuthBillingInterval(data.interval),
      artist: parseAuthOfferArtist(data.artist),
    };
  } catch {
    return null;
  }
}

export function getPlanIntentRecord(): PlanIntentRecord | null {
  let cookie: PlanIntentRecord | null = null;
  try {
    cookie = getOfferIntentFromCookies(document.cookie);
  } catch {
    /* SSR */
  }
  const stored = readStoredIntent();
  if (!cookie) return stored;
  // A different cookie plan (another tab) must never inherit stale session extras.
  if (!stored || stored.plan !== cookie.plan) return cookie;
  return { ...stored, interval: cookie.interval ?? stored.interval };
}
export const getOfferIntent = getPlanIntentRecord;
export function getPlanIntent(): PlanIntentTier | null {
  return getPlanIntentRecord()?.plan ?? null;
}
export function getBillingInterval(): BillingInterval {
  return getPlanIntentRecord()?.interval ?? 'month';
}
export function getPlanIntentFromCookies(
  header: string
): PlanIntentTier | null {
  return getOfferIntentFromCookies(header)?.plan ?? null;
}
export function getBillingIntervalFromCookies(header: string): BillingInterval {
  return getOfferIntentFromCookies(header)?.interval ?? 'month';
}

export function persistOfferIntentFromSearchParams(params: {
  get(key: string): string | null;
}): PlanIntentRecord | null {
  const plan = validatePlan(params.get('plan'));
  if (!plan) return params.get('plan') ? null : getPlanIntentRecord();
  setPlanIntent(plan, {
    interval: readAuthOfferIntervalFromParams(params),
    artist: readAuthOfferArtistFromParams(params),
  });
  return getPlanIntentRecord();
}

export function clearPlanIntent(): void {
  for (const key of [PLAN_INTENT_KEY, BILLING_INTERVAL_KEY])
    writeCookie(key, '', new Date(0).toUTCString());
  try {
    globalThis.sessionStorage?.removeItem(PLAN_INTENT_KEY);
  } catch {
    /* Restricted storage */
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
