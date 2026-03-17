import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import type { DiscogRelease } from '@/lib/db/schema/content';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import {
  type ProfileIdentityFields,
  type ProfilePreviewLinkViewModel,
  type ProfilePublicViewModel,
  type ProfileSaveState,
} from './contracts';
import { getProfileMode, getProfileModeDefinition } from './registry';

interface BuildProfilePublicViewModelInput {
  readonly mode: string | null | undefined;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly showTipButton?: boolean;
  readonly autoOpenCapture?: boolean;
  readonly enableDynamicEngagement?: boolean;
  readonly latestRelease?: DiscogRelease | null;
  readonly photoDownloadSizes?: AvatarSize[];
  readonly allowPhotoDownloads?: boolean;
  readonly subscribeTwoStep?: boolean;
  readonly genres?: string[] | null;
  readonly tourDates?: TourDateViewModel[];
  readonly visitTrackingToken?: string;
  readonly showSubscriptionConfirmedBanner?: boolean;
  readonly showShopButton?: boolean;
  readonly showFooter?: boolean;
  readonly showBackButton?: boolean;
  readonly showTourButton?: boolean;
  readonly showNotificationButton?: boolean;
  readonly subtitle?: string;
}

export function buildProfilePublicViewModel({
  mode,
  artist,
  socialLinks,
  contacts,
  showTipButton = false,
  autoOpenCapture,
  enableDynamicEngagement = false,
  latestRelease,
  photoDownloadSizes = [],
  allowPhotoDownloads = false,
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
}: BuildProfilePublicViewModelInput): ProfilePublicViewModel {
  const resolvedMode = getProfileMode(mode);
  const definition = getProfileModeDefinition(resolvedMode);

  return {
    mode: resolvedMode,
    artist,
    socialLinks,
    contacts,
    subtitle: subtitle ?? definition.subtitle,
    showTipButton,
    isTipModeActive: resolvedMode === 'tip',
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
    subscribeTwoStep,
    genres,
    tourDates,
    visitTrackingToken,
    showSubscriptionConfirmedBanner,
    showShopButton,
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
    hideBranding: Boolean(artist.settings?.hide_branding),
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
