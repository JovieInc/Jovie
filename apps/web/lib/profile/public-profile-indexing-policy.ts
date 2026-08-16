import type { Metadata } from 'next';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import {
  getPublicProfileIdentityExclusionReason,
  type PublicProfileIdentityExclusionReason,
} from './public-profile-identity-policy';

export { PUBLIC_PROFILE_PRODUCTION_CANARY_HANDLE } from './public-profile-identity-policy';
export {
  type PublicProfileIdentityExclusionReason as PublicProfileIndexingExclusionReason,
};

export const PUBLIC_PROFILE_DISCOVERY_EXCLUSION_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, nosnippet, noarchive',
} as const;

export function getPublicProfileIndexingExclusionReason(
  handle: string
): PublicProfileIdentityExclusionReason | null {
  return getPublicProfileIdentityExclusionReason(handle);
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
