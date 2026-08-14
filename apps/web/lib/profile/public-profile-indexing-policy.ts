/**
 * Explicit indexing policy for synthetic public-profile identities.
 *
 * These handles are intentionally exact. Broad substring/prefix matching (for
 * example, blocking every handle containing "test") could hide a real creator.
 * Add a handle only when its repository or production-fixture provenance has
 * been verified.
 */

import type { Metadata } from 'next';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export type PublicProfileIndexingExclusionReason =
  | 'fabricated_identity_fixture'
  | 'production_canary'
  | 'qa_auth_fixture';

const EXCLUDED_HANDLES_BY_REASON = {
  fabricated_identity_fixture: [
    'dualipa',
    'taylorswift',
    'edgecase-empty',
    'edgecase-long',
  ],
  production_canary: ['testartist'],
  qa_auth_fixture: [
    'authiosprod',
    'authiosstaging',
    'authqaprod',
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
  PublicProfileIndexingExclusionReason,
  readonly string[]
>;

export const PUBLIC_PROFILE_PRODUCTION_CANARY_HANDLE =
  EXCLUDED_HANDLES_BY_REASON.production_canary[0];

const EXCLUSION_REASON_BY_HANDLE = new Map<
  string,
  PublicProfileIndexingExclusionReason
>(
  Object.entries(EXCLUDED_HANDLES_BY_REASON).flatMap(([reason, handles]) =>
    handles.map(handle => [
      handle,
      reason as PublicProfileIndexingExclusionReason,
    ])
  )
);

function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase();
}

export function getPublicProfileIndexingExclusionReason(
  handle: string
): PublicProfileIndexingExclusionReason | null {
  return EXCLUSION_REASON_BY_HANDLE.get(normalizeHandle(handle)) ?? null;
}

export function isPublicProfileIndexable(handle: string): boolean {
  return getPublicProfileIndexingExclusionReason(handle) === null;
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
  handle: string
): NonNullable<Metadata['robots']> {
  return isPublicProfileIndexable(handle)
    ? INDEXABLE_PROFILE_ROBOTS
    : NOINDEX_ROBOTS;
}
