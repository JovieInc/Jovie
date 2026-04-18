import type { DiscogRelease } from '@/lib/db/schema/content';
import type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import type { PressPhoto } from '@/types/press-photos';
import {
  type ProfileIdentityFields,
  type ProfilePreviewLinkViewModel,
  type ProfilePublicViewModel,
  type ProfileSaveState,
} from './contracts';
import { getProfileMode, getProfileModeDefinition } from './registry';
import type { PublicRelease } from './releases/types';

interface BuildProfilePublicViewModelInput {
  readonly mode: string | null | undefined;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly showPayButton?: boolean;
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
  readonly featuredPlaylistFallback?: ConfirmedFeaturedPlaylistFallback | null;
  readonly showFooter?: boolean;
  readonly showBackButton?: boolean;
  readonly showTourButton?: boolean;
  readonly showNotificationButton?: boolean;
  readonly subtitle?: string;
  readonly releases?: readonly PublicRelease[];
}

export function buildProfilePublicViewModel({
  mode,
  artist,
  socialLinks,
  contacts,
  showPayButton = false,
  autoOpenCapture,
  enableDynamicEngagement = false,
  latestRelease,
  profileSettings,
  featuredPlaylistFallback,
  photoDownloadSizes = [],
  allowPhotoDownloads = false,
  pressPhotos = [],
  subscribeTwoStep = false,
  genres,
  tourDates = [],
  visitTrackingToken,
  showSubscriptionConfirmedBanner = true,
  showShopButton = false,
  showFooter,
  showBackButton,
  showTourButton,
  showNotificationButton,
  subtitle,
  releases,
}: BuildProfilePublicViewModelInput): ProfilePublicViewModel {
  const resolvedMode = getProfileMode(mode);
  const definition = getProfileModeDefinition(resolvedMode);

  return {
    mode: resolvedMode,
    artist,
    socialLinks,
    contacts,
    subtitle: subtitle ?? definition.subtitle,
    showPayButton,
    isPayModeActive: resolvedMode === 'pay',
    showBackButton: showBackButton ?? definition.shell.showBackButton,
    showTourButton: showTourButton ?? definition.shell.showTourButton,
    isTourModeActive: resolvedMode === 'tour',
    showFooter: showFooter ?? definition.shell.showFooter,
    showNotificationButton:
      showNotificationButton ?? definition.shell.showNotificationButton,
    autoOpenCapture: autoOpenCapture ?? resolvedMode === 'profile',
    enableDynamicEngagement,
    latestRelease,
    photoDownloadSizes,
    allowPhotoDownloads,
    pressPhotos,
    subscribeTwoStep,
    genres,
    tourDates,
    visitTrackingToken,
    showSubscriptionConfirmedBanner,
    showShopButton,
    profileSettings,
    featuredPlaylistFallback,
    releases,
  };
}

export function buildProfileIdentityFields(
  artist: Artist
): ProfileIdentityFields {
  return {
    username: artist.handle,
    displayName: artist.name,
    name: artist.name,
    tagline: artist.tagline ?? '',
    imageUrl: artist.image_url ?? '',
    location: artist.location ?? '',
    hometown: artist.hometown ?? '',
    careerHighlights: artist.career_highlights ?? '',
    targetPlaylists: artist.target_playlists?.join(', ') ?? '',
    profilePath: `/${artist.handle}`,
  };
}

export function buildProfileSaveState(
  input?: Partial<ProfileSaveState>
): ProfileSaveState {
  return {
    saving: input?.saving ?? false,
    success: input?.success ?? null,
    error: input?.error ?? null,
  };
}

export function buildProfilePreviewLinks(
  links: Array<{
    readonly id: string;
    readonly title?: string | null;
    readonly url: string;
    readonly platform: string;
    readonly isVisible?: boolean;
  }>
): ProfilePreviewLinkViewModel[] {
  return links.map(link => ({
    id: link.id,
    title: link.title ?? link.platform,
    url: link.url,
    platform: link.platform,
    isVisible: link.isVisible ?? true,
  }));
}
