'use client';

import { PublicClaimBanner } from '@/app/[username]/_components/PublicClaimBanner';
import {
  HOMEPAGE_PROFILE_PREVIEW_ARTIST,
  HOMEPAGE_PROFILE_PREVIEW_CONTACTS,
  HOMEPAGE_PROFILE_PREVIEW_DRAWER_RELEASES,
  HOMEPAGE_PROFILE_PREVIEW_RELEASES,
  HOMEPAGE_PROFILE_PREVIEW_SOCIAL_LINKS,
  HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES,
} from '@/components/features/home/homepage-profile-preview-fixture';
import { ProfileCompactTemplate } from '@/features/profile/templates/ProfileCompactTemplate';

export interface PublicProfileFixtureProps {
  readonly longName?: boolean;
  readonly preview?: boolean;
  readonly state?: string;
}

/**
 * Deterministic, source-backed public profile used by the canonical
 * `/unfazed` admission route and the guarded E2E fixture.
 *
 * This intentionally uses the real full-public template rather than the
 * embedded preview presentation. It therefore exercises the same responsive
 * desktop/mobile ownership contract without depending on a database row.
 */
export function PublicProfileFixture({
  longName = false,
  preview = false,
  state = 'unclaimed',
}: Readonly<PublicProfileFixtureProps>) {
  const artist = {
    ...HOMEPAGE_PROFILE_PREVIEW_ARTIST,
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: longName ? 'The Extraordinary Midnight Radio Orchestra' : 'Unfazed',
    handle: 'unfazed',
  };

  return (
    <ProfileCompactTemplate
      mode='profile'
      artist={artist}
      socialLinks={[...HOMEPAGE_PROFILE_PREVIEW_SOCIAL_LINKS]}
      contacts={[...HOMEPAGE_PROFILE_PREVIEW_CONTACTS]}
      allowFanCapture={false}
      latestRelease={HOMEPAGE_PROFILE_PREVIEW_RELEASES.live}
      profileSettings={{ showOldReleases: true }}
      genres={artist.genres ?? []}
      photoDownloadSizes={[]}
      pressPhotos={[]}
      allowPhotoDownloads={false}
      tourDates={[...HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES]}
      releases={[...HOMEPAGE_PROFILE_PREVIEW_DRAWER_RELEASES]}
      profileBanner={
        <PublicClaimBanner
          profileHandle={artist.handle}
          displayName={artist.name}
          directClaimSupported
          claimRequiresVerification
          isClaimed={state === 'claimed' || state === 'owner'}
          visitorState={
            state === 'owner'
              ? 'owner'
              : state === 'claimed'
                ? 'claimed_public'
                : 'organic_unclaimed'
          }
        />
      }
      embeddedPreview={preview}
    />
  );
}
