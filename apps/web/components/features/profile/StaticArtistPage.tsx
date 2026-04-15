import type { ProfileMode } from '@/features/profile/contracts';
import { ProfileCompactTemplate } from '@/features/profile/templates/ProfileCompactTemplate';
import { buildProfilePublicViewModel } from '@/features/profile/view-models';
import type { DiscogRelease } from '@/lib/db/schema/content';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
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
  readonly profileSettings?: {
    readonly showOldReleases?: boolean;
  } | null;
  readonly viewerCountryCode?: string | null;
}

export function StaticArtistPage({
  mode,
  artist,
  socialLinks,
  contacts,
  subtitle,
  showBackButton,
  showTourButton,
  showFooter,
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
  showShopButton = false,
  profileSettings,
  viewerCountryCode,
}: StaticArtistPageProps) {
  const viewModel = buildProfilePublicViewModel({
    mode,
    artist,
    socialLinks,
    contacts,
    subtitle,
    showBackButton,
    showTourButton,
    showFooter,
    latestRelease,
    enableDynamicEngagement,
    subscribeTwoStep,
    genres,
    pressPhotos,
    allowPhotoDownloads,
    photoDownloadSizes,
    tourDates,
    visitTrackingToken,
    showSubscriptionConfirmedBanner,
    showShopButton,
    profileSettings,
  });

  return (
    <ProfileCompactTemplate
      key={viewModel.artist.id}
      mode={viewModel.mode}
      artist={viewModel.artist}
      socialLinks={viewModel.socialLinks}
      contacts={viewModel.contacts}
      latestRelease={viewModel.latestRelease}
      enableDynamicEngagement={viewModel.enableDynamicEngagement}
      subscribeTwoStep={viewModel.subscribeTwoStep}
      genres={viewModel.genres}
      pressPhotos={viewModel.pressPhotos}
      allowPhotoDownloads={viewModel.allowPhotoDownloads}
      photoDownloadSizes={viewModel.photoDownloadSizes}
      tourDates={viewModel.tourDates}
      visitTrackingToken={viewModel.visitTrackingToken}
      showSubscriptionConfirmedBanner={
        viewModel.showSubscriptionConfirmedBanner
      }
      profileSettings={viewModel.profileSettings}
      viewerCountryCode={viewerCountryCode}
    />
  );
}
