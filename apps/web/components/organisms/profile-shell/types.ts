import type {
  ProfileNotificationsHydrationStatus,
  ProfileNotificationsState,
} from '@/components/organisms/hooks/useProfileNotificationsController';
import type { AvatarSize } from '@/components/profile/ProfilePhotoContextMenu';
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
  readonly showTipButton?: boolean;
  readonly showBackButton?: boolean;
  readonly showFooter?: boolean;
  readonly showNotificationButton?: boolean;
  readonly maxWidthClass?: string;
  readonly backgroundPattern?: 'grid' | 'dots' | 'gradient' | 'none';
  readonly showGradientBlurs?: boolean;
  /** Available download sizes for profile photo */
  readonly photoDownloadSizes?: AvatarSize[];
  /** Whether profile photo downloads are allowed */
  readonly allowPhotoDownloads?: boolean;
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
