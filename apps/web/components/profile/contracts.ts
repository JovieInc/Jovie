import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import type { DiscogRelease } from '@/lib/db/schema/content';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';

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
  readonly subscribeTwoStep: boolean;
  readonly genres?: string[] | null;
  readonly tourDates: TourDateViewModel[];
  readonly visitTrackingToken?: string;
  readonly showSubscriptionConfirmedBanner: boolean;
}

export interface ProfileIdentityFields {
  readonly username: string;
  readonly displayName: string;
  readonly name: string;
  readonly tagline: string;
  readonly imageUrl: string;
  readonly hideBranding: boolean;
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
