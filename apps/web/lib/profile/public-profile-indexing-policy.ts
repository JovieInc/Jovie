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
  | 'qa_machine_handle';

export type PublicProfileDiscoveryExclusionReason =
  | PublicProfileIndexingExclusionReason
  | 'qa_display_name'
  | 'test_account_email'
  | 'private_or_unpublished'
  | 'unknown_identity'
  | 'placeholder_identity';

export interface PublicProfileDiscoveryIdentity {
  readonly handle?: string | null;
  readonly displayName?: string | null;
  readonly isPublic?: boolean | null;
  readonly ownerEmail?: string | null;
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
    getQaMachineHandleIndexingExclusionReason(handle)
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
const QA_CLERK_TEST_DISPLAY_NAME_PATTERN = /\+clerk test$/;
const JOVIE_TEST_ACCOUNT_LOCAL_PART_PATTERN = /^(?:e2e|browse)(?:[-+]|$)/;
const CLERK_TEST_EMAIL_LOCAL_PART_PATTERN = /\+clerk_test(?:\+|$)/;

function getQaMachineHandleIndexingExclusionReason(
  handle: string
): 'qa_machine_handle' | null {
  return isOpaqueInternalProfileHandle(handle) ? 'qa_machine_handle' : null;
}

function matchesQaClerkTestDisplayName(displayName: string): boolean {
  return QA_CLERK_TEST_DISPLAY_NAME_PATTERN.test(
    displayName.trim().toLowerCase()
  );
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
