import type { DiscogRelease } from '@/lib/db/schema/content';
import type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import type { PressPhoto } from '@/types/press-photos';
import type { PublicRelease } from './releases/types';

export const PROFILE_MODE_KEYS = [
  'profile',
  'listen',
  'pay',
  'subscribe',
  'about',
  'contact',
  'tour',
  'releases',
] as const;

export type ProfileMode = (typeof PROFILE_MODE_KEYS)[number];

export type ProfileRenderMode = 'interactive' | 'preview';

export type ProfileSurfacePresentation = 'standalone' | 'embedded' | 'modal';

export const PROFILE_PRIMARY_TAB_KEYS = [
  'profile',
  'listen',
  'tour',
  'subscribe',
  'about',
] as const;

export type ProfilePrimaryTab = (typeof PROFILE_PRIMARY_TAB_KEYS)[number];

export interface ProfileRailCard {
  readonly id: string;
  readonly kind: 'release' | 'tour' | 'alerts' | 'playlist' | 'listen';
}

export type ProfileShowcaseStateId =
  | 'mock-home'
  | 'streams-latest'
  | 'streams-presave'
  | 'streams-release-day'
  | 'streams-video'
  | 'tour-nearby'
  | 'playlist-fallback'
  | 'listen-fallback'
  | 'fans-opt-in'
  | 'fans-confirmed'
  | 'fans-song-alert'
  | 'fans-show-alert'
  | 'subscribe-email'
  | 'subscribe-otp'
  | 'subscribe-otp-error'
  | 'subscribe-name'
  | 'subscribe-birthday'
  | 'subscribe-done'
  | 'tips-open'
  | 'tips-apple-pay'
  | 'tips-thank-you'
  | 'tips-followup'
  | 'tour'
  | 'contact'
  | 'catalog';

export type ProfileShowcaseDrawerView =
  | 'listen'
  | 'subscribe'
  | 'tour'
  | 'pay'
  | 'contact'
  | null;

export interface ProfilePreviewNotificationsState {
  readonly kind?: 'button' | 'input' | 'status' | 'otp' | 'name' | 'birthday';
  readonly tone: 'quiet' | 'compose' | 'success' | 'error';
  readonly label: string;
  readonly helper?: string;
  readonly value?: string;
  readonly actionLabel?: string;
}

export interface ProfilePreviewOverlayState {
  readonly kind: 'email-preview' | 'apple-pay' | 'thank-you';
  readonly title: string;
  readonly body: string;
  readonly accentLabel?: string;
}

export interface ProfileShowcaseState {
  readonly id: ProfileShowcaseStateId;
  readonly drawerView: ProfileShowcaseDrawerView;
  readonly latestReleaseKey: 'none' | 'presave' | 'live';
  readonly releaseActionLabel?: string;
  readonly notifications: ProfilePreviewNotificationsState;
  readonly showSubscriptionConfirmedBanner: boolean;
  readonly previewOverlay?: ProfilePreviewOverlayState | null;
}

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
  readonly showPayButton: boolean;
  readonly isPayModeActive: boolean;
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
  readonly profileSettings?: {
    readonly showOldReleases?: boolean;
  } | null;
  readonly featuredPlaylistFallback?: ConfirmedFeaturedPlaylistFallback | null;
  readonly releases?: readonly PublicRelease[];
}

export interface ProfileIdentityFields {
  readonly username: string;
  readonly displayName: string;
  readonly name: string;
  readonly tagline: string;
  readonly imageUrl: string;
  readonly location: string;
  readonly hometown: string;
  readonly careerHighlights: string;
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
