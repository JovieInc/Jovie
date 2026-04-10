import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import type { ProfileMode } from '@/features/profile/contracts';
import { ProfileCompactTemplate } from '@/features/profile/templates/ProfileCompactTemplate';
import { buildProfilePublicViewModel } from '@/features/profile/view-models';
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
  });

  return (
    <ProfileCompactTemplate
      key={artist.id}
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
      viewerCountryCode={viewerCountryCode}
    />
  );
}
