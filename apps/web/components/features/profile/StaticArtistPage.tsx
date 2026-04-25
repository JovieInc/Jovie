import type {
  ProfileMode,
  ProfileRenderMode,
} from '@/features/profile/contracts';
import type { PublicRelease } from '@/features/profile/releases/types';
import { ProfileCompactTemplate } from '@/features/profile/templates/ProfileCompactTemplate';
import { buildProfilePublicViewModel } from '@/features/profile/view-models';
import type { DiscogRelease } from '@/lib/db/schema/content';
import type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import type { PressPhoto } from '@/types/press-photos';

export type StaticArtistPagePresentation = 'full-public' | 'compact-preview';

export interface StaticArtistPageProps {
  readonly mode: ProfileMode;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly subtitle: string;
  readonly showPayButton?: boolean;
  readonly showBackButton: boolean;
  readonly showTourButton?: boolean;
  readonly showFooter?: boolean;
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
  readonly featuredPlaylistFallback?: ConfirmedFeaturedPlaylistFallback | null;
  readonly viewerCountryCode?: string | null;
  readonly presentation?: StaticArtistPagePresentation;
  readonly releases?: readonly PublicRelease[];
  readonly hideJovieBranding?: boolean;
  readonly hideMoreMenu?: boolean;
}

export function StaticArtistPage({
  mode,
  artist,
  socialLinks,
  contacts,
  subtitle,
  showPayButton,
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
  featuredPlaylistFallback,
  viewerCountryCode,
  presentation = 'full-public',
  releases,
  hideJovieBranding = false,
  hideMoreMenu = false,
}: StaticArtistPageProps) {
  const viewModel = buildProfilePublicViewModel({
    mode,
    artist,
    socialLinks,
    contacts,
    showPayButton,
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
    featuredPlaylistFallback,
  });
  const renderMode: ProfileRenderMode =
    presentation === 'compact-preview' ? 'preview' : 'interactive';

  // Live public profiles and compact preview callers intentionally share the
  // same Apple-native compact shell. Homepage preview uses ProfileCompactSurface
  // directly, so StaticArtistPage should stay aligned to the current public UI.
  return (
    <ProfileCompactTemplate
      key={`${presentation}-${viewModel.artist.id}`}
      renderMode={renderMode}
      mode={viewModel.mode}
      artist={viewModel.artist}
      socialLinks={viewModel.socialLinks}
      contacts={viewModel.contacts}
      showPayButton={viewModel.showPayButton}
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
      featuredPlaylistFallback={viewModel.featuredPlaylistFallback}
      viewerCountryCode={viewerCountryCode}
      releases={releases}
      hideJovieBranding={hideJovieBranding}
      hideMoreMenu={hideMoreMenu}
    />
  );
}
