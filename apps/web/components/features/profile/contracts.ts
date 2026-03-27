import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import type { DiscogRelease } from '@/lib/db/schema/content';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import type { PressPhoto } from '@/types/press-photos';

export const PROFILE_MODE_KEYS = [
  'profile',
  'listen',
  'tip',
  'subscribe',
  'about',
  'contact',
  'tour',
] as const;

export type ProfileMode = (typeof PROFILE_MODE_KEYS)[number];

export const SWIPEABLE_MODES = ['profile', 'tour', 'tip', 'about'] as const;

export type SwipeableProfileMode = (typeof SWIPEABLE_MODES)[number];

export function supportsProfileV2Mode(
  mode: ProfileMode,
  hasContacts = false
): boolean {
  if (mode === 'contact') {
    return hasContacts;
  }

  return true;
}

export const PROFILE_V2_OVERLAY_MODES = [
  'listen',
  'subscribe',
  'contact',
] as const;

export type ProfileV2OverlayMode =
  | (typeof PROFILE_V2_OVERLAY_MODES)[number]
  | null;

export interface ProfileModeShellConfig {
  readonly showBackButton: boolean;
  readonly showSocialBar: boolean;
  readonly showNotificationButton: boolean;
  readonly showTourButton: boolean;
  readonly showFooter: boolean;
}

export interface ProfileModeDefinition {
  readonly mode: ProfileMode;
  readonly subtitle: string;
  readonly pathSegment: '' | Exclude<ProfileMode, 'profile'>;
  readonly shell: ProfileModeShellConfig;
}

export interface ProfilePublicViewModel {
  readonly mode: ProfileMode;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly subtitle: string;
  readonly showTipButton: boolean;
  readonly isTipModeActive: boolean;
  readonly showBackButton: boolean;
  readonly showTourButton: boolean;
  readonly isTourModeActive: boolean;
  readonly showFooter: boolean;
  readonly showNotificationButton: boolean;
  readonly autoOpenCapture: boolean;
  readonly enableDynamicEngagement: boolean;
  readonly latestRelease?: DiscogRelease | null;
  readonly photoDownloadSizes: AvatarSize[];
  readonly allowPhotoDownloads: boolean;
  readonly pressPhotos: PressPhoto[];
  readonly subscribeTwoStep: boolean;
  readonly genres?: string[] | null;
  readonly tourDates: TourDateViewModel[];
  readonly visitTrackingToken?: string;
  readonly showSubscriptionConfirmedBanner: boolean;
  readonly showShopButton: boolean;
}

export interface ProfileIdentityFields {
  readonly username: string;
  readonly displayName: string;
  readonly name: string;
  readonly tagline: string;
  readonly imageUrl: string;
  readonly hideBranding: boolean;
  readonly location: string;
  readonly hometown: string;
  readonly pitchContext: string;
  readonly targetPlaylists: string;
  readonly profilePath: string;
}

export interface ProfileSaveState {
  readonly saving: boolean;
  readonly success: boolean | null;
  readonly error: string | null;
}

export interface ProfilePreviewLinkViewModel {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly platform: string;
  readonly isVisible: boolean;
}
