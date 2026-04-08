import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import type { ProfileMode } from '@/features/profile/contracts';
import { ProfileCompactTemplate } from '@/features/profile/templates/ProfileCompactTemplate';
import type { DiscogRelease } from '@/lib/db/schema/content';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import type { PressPhoto } from '@/types/press-photos';

export interface StaticArtistPageProps {
  readonly mode: ProfileMode;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly subtitle: string;
  readonly showBackButton: boolean;
  readonly showTourButton?: boolean;
  readonly showFooter?: boolean;
  readonly autoOpenCapture?: boolean;
  readonly enableDynamicEngagement?: boolean;
  readonly latestRelease?: DiscogRelease | null;
  readonly photoDownloadSizes?: AvatarSize[];
  readonly allowPhotoDownloads?: boolean;
  readonly pressPhotos?: PressPhoto[];
  readonly subscribeTwoStep?: boolean;
  readonly genres?: string[] | null;
  readonly tourDates?: TourDateViewModel[];
  readonly visitTrackingToken?: string;
  readonly showSubscriptionConfirmedBanner?: boolean;
  readonly showShopButton?: boolean;
  readonly viewerCountryCode?: string | null;
}

export function StaticArtistPage({
  mode,
  artist,
  socialLinks,
  contacts,
  latestRelease,
  enableDynamicEngagement = false,
  subscribeTwoStep = false,
  genres,
  pressPhotos = [],
  allowPhotoDownloads = false,
  photoDownloadSizes = [],
  tourDates = [],
  visitTrackingToken,
  showSubscriptionConfirmedBanner = false,
  viewerCountryCode,
}: StaticArtistPageProps) {
  return (
    <ProfileCompactTemplate
      key={artist.id}
      mode={mode}
      artist={artist}
      socialLinks={socialLinks}
      contacts={contacts}
      latestRelease={latestRelease}
      enableDynamicEngagement={enableDynamicEngagement}
      subscribeTwoStep={subscribeTwoStep}
      genres={genres}
      pressPhotos={pressPhotos}
      allowPhotoDownloads={allowPhotoDownloads}
      photoDownloadSizes={photoDownloadSizes}
      tourDates={tourDates}
      visitTrackingToken={visitTrackingToken}
      showSubscriptionConfirmedBanner={showSubscriptionConfirmedBanner}
      viewerCountryCode={viewerCountryCode}
    />
  );
}
