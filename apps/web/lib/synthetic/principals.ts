/**
 * Synthetic dogfood principals (JOV-7697).
 *
 * One canonical roster of approved synthetic actors (Grokbot, Muse,
 * Instinct, the production canary) that exercise production journeys. A
 * principal is a real Better Auth account whose email carries the
 * `+synthetic-<actorId>[-<runTag>]` tag, e.g.
 * `canary+synthetic-grokbot-run42@mail.example`. The tag is the marker:
 *
 *   - auth/session: the account email is the identity, so every session,
 *     row, and receipt joins back to one roster entry;
 *   - analytics/metrics: `isInternalOrTestAccountEmail` treats the tag as
 *     internal, so the JOV-7362 exclusion path quarantines it (no second
 *     exclusion implementation lives here);
 *   - payment test paths: Stripe customers carry
 *     {@link SYNTHETIC_PRINCIPAL_METADATA_KEY} so revenue reads can show the
 *     purchase as proof-of-path, never customer revenue.
 *
 * Revocation flips `status` to `revoked`. A revoked principal keeps its
 * metrics quarantine (the tag still classifies as internal) but loses any
 * scenario grant, so nothing that checks {@link getActiveSyntheticPrincipal}
 * treats it as approved.
 */

import {
  isInternalOrTestAccountEmail,
  normalizeEmail,
  SYNTHETIC_PRINCIPAL_EMAIL_TAG,
} from '@/lib/utils/email';

export const SYNTHETIC_PRINCIPAL_SCHEMA = 'jovie.synthetic-principal/v1';

/** Stripe customer / checkout metadata key carrying the roster actor id. */
export const SYNTHETIC_PRINCIPAL_METADATA_KEY = 'synthetic_principal';

export const SYNTHETIC_PRINCIPAL_SCENARIOS = [
  'auth',
  'claim',
  'onboarding_chat',
  'checkout_test',
] as const;
export type SyntheticPrincipalScenario =
  (typeof SYNTHETIC_PRINCIPAL_SCENARIOS)[number];

export type SyntheticPrincipalStatus = 'active' | 'revoked';

export interface SyntheticPrincipal {
  /** Lowercase letters and digits only; the tag uses `-` before the run tag. */
  readonly actorId: string;
  readonly label: string;
  /** Producer that drives the actor; receipts record model/runtime per run. */
  readonly producer: string;
  readonly scenarios: readonly SyntheticPrincipalScenario[];
  readonly status: SyntheticPrincipalStatus;
}

export const SYNTHETIC_PRINCIPALS = [
  {
    actorId: 'grokbot',
    label: 'Grokbot',
    producer: 'grokbot',
    scenarios: ['auth', 'claim', 'onboarding_chat', 'checkout_test'],
    status: 'active',
  },
  {
    actorId: 'muse',
    label: 'Muse',
    producer: 'muse',
    scenarios: ['auth', 'claim', 'onboarding_chat', 'checkout_test'],
    status: 'active',
  },
  {
    actorId: 'instinct',
    label: 'Instinct',
    producer: 'instincts',
    scenarios: ['auth', 'claim', 'onboarding_chat'],
    status: 'active',
  },
  {
    actorId: 'canary',
    label: 'Production canary',
    producer: 'synthetic-monitoring',
    scenarios: ['auth', 'claim', 'onboarding_chat', 'checkout_test'],
    status: 'active',
  },
] as const satisfies readonly SyntheticPrincipal[];

const ACTOR_ID_PATTERN = /^[a-z0-9]+$/;
const RUN_TAG_PATTERN = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/;
const SYNTHETIC_TAG_PATTERN = /\+synthetic-([a-z0-9]+)(?:-([a-z0-9._-]+))?$/;

export interface ParsedSyntheticPrincipalEmail {
  readonly actorId: string;
  readonly runTag: string | null;
}

/**
 * Parse the synthetic tag from an email. Returns null when the address has
 * no tag. A tag on an unknown actor still parses; roster lookup decides
 * whether it is approved.
 */
export function parseSyntheticPrincipalEmail(
  email: string | null | undefined
): ParsedSyntheticPrincipalEmail | null {
  if (!email) return null;
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalized.length - 1) return null;

  const match = SYNTHETIC_TAG_PATTERN.exec(normalized.slice(0, atIndex));
  if (!match) return null;
  const runTag = match[2] ?? null;
  if (runTag !== null && !RUN_TAG_PATTERN.test(runTag)) return null;
  return { actorId: match[1], runTag };
}

export function findSyntheticPrincipal(
  actorId: string
): SyntheticPrincipal | null {
  return (
    SYNTHETIC_PRINCIPALS.find(principal => principal.actorId === actorId) ??
    null
  );
}

/**
 * Roster entry for an email, active or revoked. Unknown actors return null
 * but stay quarantined from metrics through the email classifier.
 */
export function resolveSyntheticPrincipal(
  email: string | null | undefined
): SyntheticPrincipal | null {
  const parsed = parseSyntheticPrincipalEmail(email);
  return parsed ? findSyntheticPrincipal(parsed.actorId) : null;
}

/**
 * Approved principal for a scenario: on the roster, active, and granted the
 * scenario. Everything else is treated as ordinary traffic.
 */
export function getActiveSyntheticPrincipal(
  email: string | null | undefined,
  scenario: SyntheticPrincipalScenario
): SyntheticPrincipal | null {
  const principal = resolveSyntheticPrincipal(email);
  if (!principal || principal.status !== 'active') return null;
  return principal.scenarios.includes(scenario) ? principal : null;
}

/** True for any tagged address; metrics quarantine never depends on status. */
export function isSyntheticPrincipalEmail(
  email: string | null | undefined
): boolean {
  return parseSyntheticPrincipalEmail(email) !== null;
}

/**
 * Build a principal address from the producer's mailbox base (for example
 * the canary's `E2E_PROD_SIGNUP_EMAIL_BASE`). Throws on unknown or revoked
 * actors so a producer cannot mint an unapproved identity by accident.
 */
export function buildSyntheticPrincipalEmail(
  mailboxBase: string,
  actorId: string,
  runTag?: string
): string {
  const principal = findSyntheticPrincipal(actorId);
  if (!principal || principal.status !== 'active') {
    throw new Error(`Synthetic principal "${actorId}" is not active`);
  }
  if (!ACTOR_ID_PATTERN.test(actorId)) {
    throw new Error(`Synthetic principal id "${actorId}" is malformed`);
  }
  if (runTag !== undefined && !RUN_TAG_PATTERN.test(runTag)) {
    throw new Error(`Synthetic run tag "${runTag}" is malformed`);
  }

  const normalized = normalizeEmail(mailboxBase);
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    throw new Error('Synthetic mailbox base must be an email address');
  }
  // Drop any existing plus tag so the synthetic tag is the only one.
  const local = normalized.slice(0, atIndex).split('+')[0];
  const domain = normalized.slice(atIndex + 1);
  const suffix = runTag ? `${actorId}-${runTag}` : actorId;
  return `${local}${SYNTHETIC_PRINCIPAL_EMAIL_TAG}${suffix}@${domain}`;
}

/**
 * Stripe metadata marking a synthetic principal's customer. Empty for every
 * other email so customer metadata is unchanged for real users.
 */
export function syntheticPrincipalStripeMetadata(
  email: string | null | undefined
): Record<string, string> {
  const parsed = parseSyntheticPrincipalEmail(email);
  if (!parsed || !isInternalOrTestAccountEmail(email)) return {};
  return { [SYNTHETIC_PRINCIPAL_METADATA_KEY]: parsed.actorId };
}
