import type { Metadata } from 'next';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
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
const QA_MACHINE_HANDLE_PATTERN = /^tmoc[0-9a-z]{10,}$/;
const QA_CLERK_TEST_DISPLAY_NAME_PATTERN = /\+clerk test$/;

function getQaMachineHandleIndexingExclusionReason(
  handle: string
): 'qa_machine_handle' | null {
  const normalized = handle.trim().toLowerCase();
  return QA_MACHINE_HANDLE_PATTERN.test(normalized)
    ? 'qa_machine_handle'
    : null;
}

function matchesQaClerkTestDisplayName(displayName: string): boolean {
  return QA_CLERK_TEST_DISPLAY_NAME_PATTERN.test(
    displayName.trim().toLowerCase()
  );
}

export function isPublicProfileIndexable(
  handle: string,
  displayName?: string | null
): boolean {
  return (
    getPublicProfileIndexingExclusionReason(handle) === null &&
    (displayName == null ||
      displayName.trim() === '' ||
      !matchesQaClerkTestDisplayName(displayName))
  );
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
