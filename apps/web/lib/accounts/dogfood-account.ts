import {
  DOGFOOD_ACCOUNT_EMAIL_TAG,
  FOUNDER_EMAIL_DOMAIN,
  FOUNDER_EMAIL_LOCAL_PART,
  normalizeEmail,
} from '@/lib/utils/email';

/**
 * Founder dogfood accounts: the one address family that may create an account
 * without an invitation (see `lib/auth/signup-admission.ts`).
 *
 *   <founder>+dogfood@<founder domain>              long-lived
 *   <founder>+dogfood-<name>@<founder domain>       long-lived
 *   <founder>+dogfood-tmp-<id>@<founder domain>     ephemeral (agent runs)
 *
 * Closed by default: exact founder domain (no subdomain), exact founder base
 * local part, exactly one `+dogfood` tag, and an optional lowercase ASCII
 * slug of hyphen-separated `[a-z0-9]` words, at most 40 characters. Anything
 * else, including non-ASCII input that could normalize into a match, is not a
 * dogfood address. The domain's catch-all mailbox belongs to the founder, so
 * a verified OTP on one of these addresses proves the founder signed in.
 */

export type DogfoodAccountLifetime = 'long-lived' | 'ephemeral';

/** Ephemeral dogfood accounts older than this are due for cleanup. */
export const EPHEMERAL_DOGFOOD_MAX_AGE_DAYS = 7;

const EPHEMERAL_SLUG_PREFIX = 'tmp-';
const MAX_SLUG_LENGTH = 40;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRINTABLE_ASCII = /^[\x21-\x7e]+$/;

/** Lifetime of a dogfood address, or null when the email is not one. */
export function classifyDogfoodAccountEmail(
  email: string | null | undefined
): DogfoodAccountLifetime | null {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim();
  // Reject before lowercasing: some non-ASCII code points (e.g. the Kelvin
  // sign) lowercase into ASCII letters and could fake a match.
  if (!PRINTABLE_ASCII.test(trimmed)) return null;
  const normalized = normalizeEmail(trimmed);

  const domainSuffix = `@${FOUNDER_EMAIL_DOMAIN}`;
  if (!normalized.endsWith(domainSuffix)) return null;
  const localPart = normalized.slice(0, -domainSuffix.length);

  const prefix = `${FOUNDER_EMAIL_LOCAL_PART}+${DOGFOOD_ACCOUNT_EMAIL_TAG}`;
  if (localPart === prefix) return 'long-lived';
  if (!localPart.startsWith(`${prefix}-`)) return null;

  const slug = localPart.slice(prefix.length + 1);
  if (slug.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(slug)) return null;
  // `tmp` is reserved for ephemeral accounts, which must carry an id.
  if (slug === 'tmp') return null;
  return slug.startsWith(EPHEMERAL_SLUG_PREFIX) ? 'ephemeral' : 'long-lived';
}

/** True only for the founder's `+dogfood` / `+dogfood-<slug>` mailboxes. */
export function isDogfoodAccountEmail(
  email: string | null | undefined
): boolean {
  return classifyDogfoodAccountEmail(email) !== null;
}

/** True for `+dogfood-tmp-<id>` accounts, which cleanup may soft-delete. */
export function isEphemeralDogfoodAccountEmail(
  email: string | null | undefined
): boolean {
  return classifyDogfoodAccountEmail(email) === 'ephemeral';
}

/** Ephemeral dogfood account past its lifetime. Pure; callers pass `now`. */
export function isExpiredEphemeralDogfoodAccount(
  account: { email: string | null | undefined; createdAt: Date },
  now: Date
): boolean {
  if (!isEphemeralDogfoodAccountEmail(account.email)) return false;
  const ageMs = now.getTime() - account.createdAt.getTime();
  return ageMs > EPHEMERAL_DOGFOOD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Audit fields for admitting a dogfood account, or null when the email is not
 * one. Carries the reason and the domain only, never the full address.
 */
export function dogfoodAdmissionAudit(email: string | null | undefined): {
  reason: 'founder_dogfood_mailbox';
  lifetime: DogfoodAccountLifetime;
  emailDomain: string;
} | null {
  const lifetime = classifyDogfoodAccountEmail(email);
  if (!lifetime) return null;
  return {
    reason: 'founder_dogfood_mailbox',
    lifetime,
    emailDomain: FOUNDER_EMAIL_DOMAIN,
  };
}

const WALK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A fresh ephemeral dogfood address for one walk or E2E run:
 * `<founder>+dogfood-tmp-<walkId>@<founder domain>`. Every walk must use its
 * own address, because a second sign-in code to one address replaces the
 * first. Without a `walkId` a unique one is minted (UTC date + random hex).
 * The account is cleaned up EPHEMERAL_DOGFOOD_MAX_AGE_DAYS after creation.
 */
export function newDogfoodWalkEmail(
  walkId?: string,
  now: Date = new Date()
): string {
  const id = walkId?.trim().toLowerCase() ?? mintWalkId(now);
  const email = `${FOUNDER_EMAIL_LOCAL_PART}+${DOGFOOD_ACCOUNT_EMAIL_TAG}-${EPHEMERAL_SLUG_PREFIX}${id}@${FOUNDER_EMAIL_DOMAIN}`;
  if (!WALK_ID_PATTERN.test(id) || !isEphemeralDogfoodAccountEmail(email)) {
    throw new TypeError(
      'walkId must be hyphen-separated lowercase letters and digits, at most 36 characters'
    );
  }
  return email;
}

function mintWalkId(now: Date): string {
  const bytes = new Uint8Array(5);
  globalThis.crypto.getRandomValues(bytes);
  const random = Array.from(bytes, byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return `${now.toISOString().slice(0, 10).replaceAll('-', '')}-${random}`;
}
