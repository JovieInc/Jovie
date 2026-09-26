import type { Metadata } from 'next';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import {
  getEmailDomain,
  isReservedTestEmailDomain,
  normalizeEmail,
} from '@/lib/utils/email';
import { isOpaqueInternalProfileHandle } from './opaque-internal-profile-handle';
import {
  getPublicProfileIdentityExclusionReason,
  type PublicProfileIdentityExclusionReason,
} from './public-profile-identity-policy';

export { PUBLIC_PROFILE_PRODUCTION_CANARY_HANDLE } from './public-profile-identity-policy';

/**
 * Reasons a public profile is excluded from indexing: the exact-handle
 * reservation registry (fixtures/canaries) plus the QA machine-handle shape
 * rule, which matches claimed automated-test identities that no exact list
 * covers.
 */
export type PublicProfileIndexingExclusionReason =
  | PublicProfileIdentityExclusionReason
  | 'qa_machine_handle'
  | 'unresolved_platform_id_handle';

export type PublicProfileDiscoveryExclusionReason =
  | PublicProfileIndexingExclusionReason
  | 'qa_display_name'
  | 'test_account_email'
  | 'private_or_unpublished'
  | 'unknown_identity'
  | 'placeholder_identity'
  | 'empty_profile';

export interface PublicProfileDiscoveryIdentity {
  readonly handle?: string | null;
  readonly displayName?: string | null;
  readonly isPublic?: boolean | null;
  readonly ownerEmail?: string | null;
  /**
   * Whether the profile has at least one publicly eligible release. Omit when
   * the source cannot supply it; only an explicit `false` excludes.
   */
  readonly hasPublicRelease?: boolean | null;
}

export interface PublicProfileDiscoveryEligibilityOptions {
  readonly requirePublication?: boolean;
}

export const PUBLIC_PROFILE_DISCOVERY_EXCLUSION_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, nosnippet, noarchive',
} as const;

export function getPublicProfileIndexingExclusionReason(
  handle: string
): PublicProfileIndexingExclusionReason | null {
  return (
    getPublicProfileIdentityExclusionReason(handle) ??
    getQaMachineHandleIndexingExclusionReason(handle) ??
    getUnresolvedPlatformIdHandleExclusionReason(handle)
  );
}

/**
 * QA machine-handle shapes (JOV-6126). Automated Clerk-test provisioning emits
 * handles like `tmoc0g1x9dwmk71` and display names like `gp moc…+clerk test`;
 * those identities may be claimed yet must never enter search indexes or the
 * sitemap. Matched by shape, not by exact handle, so new QA rows fail closed
 * without touching the exact-handle reservation registry above.
 *
 * Deliberately conservative: a legitimate creator handle is alphanumeric and
 * never looks like `tmoc` + ~15 chars of base36, and real display names do not
 * end in the `+clerk test` suffix. Revisit only if a genuine collision appears.
 */
const JOVIE_TEST_ACCOUNT_LOCAL_PART_PATTERN = /^(?:e2e|browse)(?:[-+]|$)/;
const CLERK_TEST_EMAIL_LOCAL_PART_PATTERN = /\+clerk_test(?:\+|$)/;

function getQaMachineHandleIndexingExclusionReason(
  handle: string
): 'qa_machine_handle' | null {
  return isOpaqueInternalProfileHandle(handle) ? 'qa_machine_handle' : null;
}

/**
 * Unresolved Spotify artist-ID handles (JOV-6126). Ingestion mints
 * `artist_<22-char Spotify ID>` when no human handle resolves; production then
 * served `/artist_5k9ywwwkldouuicvijstpl` ("Dave Edwards") as an indexable,
 * self-canonical page. Raw platform IDs are never canonical public URLs.
 */
const UNRESOLVED_SPOTIFY_ARTIST_HANDLE_PATTERN = /^artist_[0-9a-z]{22}$/;

function getUnresolvedPlatformIdHandleExclusionReason(
  handle: string
): 'unresolved_platform_id_handle' | null {
  return UNRESOLVED_SPOTIFY_ARTIST_HANDLE_PATTERN.test(
    handle.trim().toLowerCase()
  )
    ? 'unresolved_platform_id_handle'
    : null;
}

function matchesQaClerkTestDisplayName(displayName: string): boolean {
  return displayName.trim().toLowerCase().endsWith('+clerk test');
}

function isPlaceholderIdentity(handle: string, displayName: string): boolean {
  if (displayName === '') return true;
  return displayName.toLowerCase() === handle.toLowerCase();
}

function isDiscoveryTestAccountEmail(
  email: string | null | undefined
): boolean {
  if (typeof email !== 'string' || email.trim() === '') return false;
  const normalized = normalizeEmail(email);
  const domain = getEmailDomain(normalized);
  if (!domain) return false;
  if (isReservedTestEmailDomain(domain)) return true;
  const localPart = normalized.slice(0, normalized.lastIndexOf('@'));
  if (CLERK_TEST_EMAIL_LOCAL_PART_PATTERN.test(localPart)) return true;
  return (
    domain === 'jov.ie' && JOVIE_TEST_ACCOUNT_LOCAL_PART_PATTERN.test(localPart)
  );
}

export function getPublicProfileDiscoveryExclusionReason(
  identity: PublicProfileDiscoveryIdentity | null | undefined,
  options: PublicProfileDiscoveryEligibilityOptions = {}
): PublicProfileDiscoveryExclusionReason | null {
  if (!identity) return 'unknown_identity';

  const handle = identity.handle?.trim() ?? '';
  if (!handle) return 'unknown_identity';

  if (identity.isPublic === false) return 'private_or_unpublished';
  if (options.requirePublication && identity.isPublic !== true) {
    return 'private_or_unpublished';
  }

  const indexingReason = getPublicProfileIndexingExclusionReason(handle);
  if (indexingReason) return indexingReason;

  const displayName = identity.displayName?.trim() ?? '';
  if (displayName !== '' && matchesQaClerkTestDisplayName(displayName)) {
    return 'qa_display_name';
  }

  if (isDiscoveryTestAccountEmail(identity.ownerEmail)) {
    return 'test_account_email';
  }

  // Directory/sitemap only. Direct profile access stays independent.
  // DATA unpublish of existing placeholder rows is a separate follow-up.
  if (
    options.requirePublication &&
    isPlaceholderIdentity(handle, displayName)
  ) {
    return 'placeholder_identity';
  }

  // JOV-6126: empty profiles ("No releases listed yet", e.g. duplicate or
  // test accounts) are thin content and stay out of discovery listings.
  if (options.requirePublication && identity.hasPublicRelease === false) {
    return 'empty_profile';
  }

  return null;
}

export function isPublicProfileDiscoveryEligible(
  identity: PublicProfileDiscoveryIdentity | null | undefined,
  options: PublicProfileDiscoveryEligibilityOptions = {}
): boolean {
  return getPublicProfileDiscoveryExclusionReason(identity, options) === null;
}

export function filterPublicDiscoveryIdentities<
  T extends PublicProfileDiscoveryIdentity,
>(identities: readonly T[] | null | undefined): T[] {
  if (!Array.isArray(identities)) return [];
  return identities.filter(identity =>
    isPublicProfileDiscoveryEligible(identity, { requirePublication: true })
  );
}

export function isPublicProfileIndexable(
  handle: string,
  displayName?: string | null
): boolean {
  return isPublicProfileDiscoveryEligible({ handle, displayName });
}

const INDEXABLE_PROFILE_ROBOTS: NonNullable<Metadata['robots']> = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    'max-video-preview': -1,
    'max-image-preview': 'large',
    'max-snippet': -1,
  },
};

export function getPublicProfileRobots(
  handle: string,
  displayName?: string | null
): NonNullable<Metadata['robots']> {
  return isPublicProfileIndexable(handle, displayName)
    ? INDEXABLE_PROFILE_ROBOTS
    : NOINDEX_ROBOTS;
}
