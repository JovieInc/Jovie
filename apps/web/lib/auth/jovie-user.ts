/**
 * JovieUser — the Clerk-shaped client user contract, backed by Better Auth.
 *
 * INERT until the client-flip commit of the Better Auth migration
 * (docs/auth/better-auth-migration-plan.md, build-order commit ⑦).
 *
 * Scope rule: this type carries ONLY the fields real `useUserSafe()`
 * consumers read today (grep evidence per field below). Clerk-specific
 * resource methods (`createExternalAccount`, `createEmailAddress`,
 * `getSessions`, …) are intentionally absent — their two call sites
 * (PlatformConnectionsClient, AccountSettingsSection's ClerkUserResource
 * cast) are reworked onto `authClient` APIs in the client-flip commit.
 */

/**
 * Mirrors the two fields consumers read off Clerk's EmailAddressResource.
 * Evidence: `user?.primaryEmailAddress?.emailAddress` and
 * `user?.emailAddresses?.[0]?.emailAddress` (useUserButton.ts,
 * ClerkAnalytics.tsx, ProfileInlineNotificationsCTA.tsx).
 */
export interface JovieUserEmailAddress {
  readonly id: string;
  readonly emailAddress: string;
}

export interface JovieUser {
  /** Better Auth user id. Evidence: `user?.id` (useUserButton.ts). */
  readonly id: string;
  /**
   * Better Auth stores exactly one email per user, so this is always a
   * single-element array. Evidence: `user?.emailAddresses?.[0]?.emailAddress`
   * fallback chain (useUserButton.ts).
   */
  readonly emailAddresses: readonly JovieUserEmailAddress[];
  /**
   * Same object as `emailAddresses[0]` — Better Auth has no secondary
   * emails, so "primary" is the only email. Evidence:
   * `user?.primaryEmailAddress?.emailAddress` (useUserButton.ts,
   * ClerkAnalytics.tsx, ProfileInlineNotificationsCTA.tsx).
   */
  readonly primaryEmailAddress: JovieUserEmailAddress | null;
  /**
   * Better Auth `user.image` (nullable — Clerk always hosted an avatar
   * URL, Better Auth only stores what the OAuth provider returned). The
   * sole consumer chain `upgradeOAuthAvatarUrl(user?.imageUrl)`
   * (useUserButton.ts → lib/utils/avatar-url.ts) accepts
   * `string | null | undefined`, so widening Clerk's `string` to
   * `string | null` is safe.
   */
  readonly imageUrl: string | null;
  /**
   * Better Auth `user.name`. Evidence: display-name fallback chain
   * (useUserButton.ts) and analytics identify payload (ClerkAnalytics.tsx).
   */
  readonly fullName: string | null;
  /**
   * Derived by splitting `name` on whitespace — Better Auth stores a
   * single `name` field. Evidence: `user?.firstName && user?.lastName
   * ? … : user?.firstName` (useUserButton.ts).
   */
  readonly firstName: string | null;
  /** See `firstName`. */
  readonly lastName: string | null;
  /**
   * Better Auth's base user has NO username field (the username plugin is
   * not part of the migration's server config); the app-level handle lives
   * on the app `users` table. Maps from an optional additional field when
   * the server config provides one, otherwise `null`. Both consumers
   * already handle null: useUserButton.ts falls back to `artist?.handle`,
   * ClerkAnalytics.tsx sends `undefined`.
   */
  readonly username: string | null;
}

/**
 * Structural view of the Better Auth session user this mapper needs.
 * The real `authClient.useSession().data.user` (id/email/name/image plus
 * timestamps) satisfies this; `username` flows through only if the server
 * config declares it as an additional field.
 */
export interface BetterAuthSessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly image?: string | null;
  readonly username?: string | null;
}

function splitName(name: string): {
  firstName: string | null;
  lastName: string | null;
} {
  const trimmed = name.trim();
  if (!trimmed) {
    return { firstName: null, lastName: null };
  }

  const [firstName, ...rest] = trimmed.split(/\s+/);
  return {
    firstName: firstName ?? null,
    lastName: rest.join(' ') || null,
  };
}

/**
 * Map a Better Auth session user onto the Clerk-shaped `JovieUser`
 * consumed by `useUserSafe()` call sites.
 */
export function toJovieUser(sessionUser: BetterAuthSessionUser): JovieUser {
  const email: JovieUserEmailAddress = {
    // Synthetic id: Better Auth does not model emails as sub-resources.
    // Consumers only use it as a stable React key / identity string.
    id: `ba_email_${sessionUser.id}`,
    emailAddress: sessionUser.email,
  };
  const { firstName, lastName } = splitName(sessionUser.name);

  return {
    id: sessionUser.id,
    emailAddresses: [email],
    primaryEmailAddress: email,
    imageUrl: sessionUser.image ?? null,
    fullName: sessionUser.name.trim() || null,
    firstName,
    lastName,
    username: sessionUser.username ?? null,
  };
}
