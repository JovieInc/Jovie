/**
 * Durable provenance policy for synthetic public-profile identities.
 *
 * These handles are intentionally exact. Broad substring or prefix matching
 * could reserve a legitimate creator. Add a handle only after verifying its
 * repository or production-fixture provenance.
 *
 * Every identity in this registry is excluded from search and machine-readable
 * discovery and permanently unavailable to general create, rename, reserve,
 * and ingestion assignment flows. The dedicated claim-flow fixture has one
 * narrower exception: a verified token-backed pending claim may take over the
 * preseeded row. Production monitors may still render their public routes.
 */

export type PublicProfileIdentityExclusionReason =
  | 'claim_flow_fixture'
  | 'fabricated_identity_fixture'
  | 'legacy_claim_fixture'
  | 'production_canary'
  | 'qa_auth_fixture';

const EXCLUDED_HANDLES_BY_REASON = {
  claim_flow_fixture: ['e2eclaimartist'],
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

/** Exact protected identities are unavailable to every general assignment path. */
export function isReservedPublicProfileIdentity(handle: string): boolean {
  return getPublicProfileIdentityExclusionReason(handle) !== null;
}

/**
 * The only protected identity eligible for a verified token-backed takeover.
 * Callers must separately verify the signed pending context and stored token.
 */
export function isTokenBackedClaimFixture(handle: string): boolean {
  return (
    getPublicProfileIdentityExclusionReason(handle) === 'claim_flow_fixture'
  );
}

/** Normal identities and the dedicated claim fixture may enter token routes. */
export function isTokenBackedClaimEligibleIdentity(handle: string): boolean {
  const reason = getPublicProfileIdentityExclusionReason(handle);
  return reason === null || reason === 'claim_flow_fixture';
}
