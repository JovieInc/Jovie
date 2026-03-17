import type {
  ProfileNotificationsHydrationStatus,
  ProfileNotificationsState,
} from '@/components/organisms/hooks/useProfileNotificationsController';
import type { ProfileMode } from '@/features/profile/contracts';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import type {
  NotificationChannel,
  NotificationContactValues,
  NotificationSubscriptionState,
} from '@/types/notifications';

export interface ProfileNotificationsContextValue {
  state: ProfileNotificationsState;
  setState: React.Dispatch<React.SetStateAction<ProfileNotificationsState>>;
  hydrationStatus: ProfileNotificationsHydrationStatus;
  hasStoredContacts: boolean;
  notificationsEnabled: boolean;
  channel: NotificationChannel;
  setChannel: React.Dispatch<React.SetStateAction<NotificationChannel>>;
  subscribedChannels: NotificationSubscriptionState;
  setSubscribedChannels: React.Dispatch<
    React.SetStateAction<NotificationSubscriptionState>
  >;
  subscriptionDetails: NotificationContactValues;
  setSubscriptionDetails: React.Dispatch<
    React.SetStateAction<NotificationContactValues>
  >;
  openSubscription: (channel?: NotificationChannel) => void;
  /** Register a callback to focus the subscription input */
  registerInputFocus: (focusFn: (() => void) | null) => void;
}

export interface ProfileShellProps {
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts?: PublicContact[];
  readonly subtitle?: string;
  readonly children?: React.ReactNode;
  readonly showSocialBar?: boolean;
  readonly mode?: ProfileMode;
  readonly showTipButton?: boolean;
  readonly isTipModeActive?: boolean;
  readonly showBackButton?: boolean;
  readonly showTourButton?: boolean;
  readonly isTourModeActive?: boolean;
  readonly showFooter?: boolean;
  readonly showNotificationButton?: boolean;
  readonly showShopButton?: boolean;
  readonly maxWidthClass?: string;
  readonly backgroundPattern?: 'grid' | 'dots' | 'gradient' | 'none';
  readonly showGradientBlurs?: boolean;
  /** Available download sizes for profile photo */
  readonly photoDownloadSizes?: AvatarSize[];
  /** Whether profile photo downloads are allowed */
  readonly allowPhotoDownloads?: boolean;
  /** HMAC-signed tracking token for authenticating visit tracking requests */
  readonly visitTrackingToken?: string;
}

export const SOCIAL_NETWORK_PLATFORMS = [
  'twitter',
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'linkedin',
  'discord',
  'twitch',
] as const;
