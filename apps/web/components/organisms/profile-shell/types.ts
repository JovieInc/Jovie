import type {
  ProfileNotificationsHydrationStatus,
  ProfileNotificationsState,
} from '@/components/organisms/hooks/useProfileNotificationsController';
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
  artist: Artist;
  socialLinks: LegacySocialLink[];
  contacts?: PublicContact[];
  subtitle?: string;
  children?: React.ReactNode;
  showSocialBar?: boolean;
  showTipButton?: boolean;
  showBackButton?: boolean;
  showFooter?: boolean;
  showNotificationButton?: boolean;
  maxWidthClass?: string;
  backgroundPattern?: 'grid' | 'dots' | 'gradient' | 'none';
  showGradientBlurs?: boolean;
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
