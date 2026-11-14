/**
 * Pure public-release eligibility predicate.
 *
 * This module is reachable from the public profile client island
 * (`profile-surface-state.ts` -> `release-visibility.ts`), so it must never
 * import `@/lib/db`, `drizzle-orm`, or anything else server-only. The SQL
 * twin of this predicate lives in `./public-release-eligibility.ts`.
 */
import { determineReleasePhase } from '@/lib/discography/release-phase';
import {
  isLibraryReleaseApprovedForPublic,
  type LibraryApprovalStatus,
} from '@/lib/library/approval-status';
import {
  isLibraryAssetVisibleOnProfile,
  type LibraryProfileVisibility,
} from '@/lib/library/profile-visibility';

type ReleaseDateInput = Date | string | null | undefined;

export interface PublicReleaseEligibilityInput {
  readonly releaseDate: ReleaseDateInput;
  readonly revealDate?: ReleaseDateInput;
  readonly artworkUrl: string | null | undefined;
  readonly status?: string | null;
  readonly deletedAt?: Date | string | null;
  readonly hasProviderLinks?: boolean;
  readonly approvalStatus?: LibraryApprovalStatus | null;
  readonly profileVisibility?: LibraryProfileVisibility | null;
}

export function hasPublicReleaseArtwork(
  artworkUrl: string | null | undefined
): boolean {
  return typeof artworkUrl === 'string' && artworkUrl.trim().length > 0;
}

export function isPublicReleaseEligible(
  release: PublicReleaseEligibilityInput | null | undefined,
  now = new Date(),
  options: { readonly requireProviderLinks?: boolean } = {}
): boolean {
  if (!release) return false;
  if (release.deletedAt) return false;
  if (release.status === 'draft') return false;
  const approvalStatus = release.approvalStatus;
  if (
    approvalStatus !== undefined &&
    !isLibraryReleaseApprovedForPublic(approvalStatus)
  ) {
    return false;
  }
  if (!isLibraryAssetVisibleOnProfile(release.profileVisibility)) return false;
  if (!hasPublicReleaseArtwork(release.artworkUrl)) return false;
  if (options.requireProviderLinks && release.hasProviderLinks !== true) {
    return false;
  }

  return (
    determineReleasePhase(release.releaseDate, release.revealDate, now) !==
    'mystery'
  );
}
