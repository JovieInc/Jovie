/**
 * Durable provenance policy for synthetic public-profile identities.
 *
 * These handles are intentionally exact. Broad substring or prefix matching
 * could reserve a legitimate creator. Add a handle only after verifying its
 * repository or production-fixture provenance.
 *
 * Every identity in this registry is:
 * - excluded from search and machine-readable discovery;
 * - permanently unavailable for create, rename, reserve, and claim flows; and
 * - still allowed to render when a production monitor needs the public route.
 */

export type PublicProfileIdentityExclusionReason =
  | 'fabricated_identity_fixture'
  | 'legacy_claim_fixture'
  | 'production_canary'
  | 'qa_auth_fixture';

const EXCLUDED_HANDLES_BY_REASON = {
  fabricated_identity_fixture: [
    'dualipa',
    'taylorswift',
    'edgecase-empty',
    'edgecase-long',
  ],
  legacy_claim_fixture: ['testartist'],
  production_canary: ['authqaprod'],
  qa_auth_fixture: [
    'authiosprod',
    'authiosstaging',
    'authqastaging',
    'browse-ready-user',
    'e2e-test-user',
    'jovieqatestclerktest',
    'native-auth-smoke-jov-ie',
    'native-auth-smoke-staging-jov-ie',
    'qa-5b7a7db1',
    'qatest10clerktest',
    'timtest',
  ],
} as const satisfies Record<
  PublicProfileIdentityExclusionReason,
  readonly string[]
>;

export const PUBLIC_PROFILE_PRODUCTION_CANARY_HANDLE =
  EXCLUDED_HANDLES_BY_REASON.production_canary[0];

/** Complete exact-handle reservation set, exported for cross-surface tests. */
export const PUBLIC_PROFILE_RESERVED_IDENTITY_HANDLES: readonly string[] =
  Object.freeze(Object.values(EXCLUDED_HANDLES_BY_REASON).flat());

const EXCLUSION_REASON_BY_HANDLE = new Map<
  string,
  PublicProfileIdentityExclusionReason
>(
  Object.entries(EXCLUDED_HANDLES_BY_REASON).flatMap(([reason, handles]) =>
    handles.map(handle => [
      handle,
      reason as PublicProfileIdentityExclusionReason,
    ])
  )
);

function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase();
}

export function getPublicProfileIdentityExclusionReason(
  handle: string
): PublicProfileIdentityExclusionReason | null {
  return EXCLUSION_REASON_BY_HANDLE.get(normalizeHandle(handle)) ?? null;
}

/** Exact synthetic identities can never become legitimate claimed handles. */
export function isReservedPublicProfileIdentity(handle: string): boolean {
  return getPublicProfileIdentityExclusionReason(handle) !== null;
}
