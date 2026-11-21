import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileNotificationsContext } from '@/components/organisms/profile-shell/ProfileNotificationsContext';
import type { ProfileNotificationsContextValue } from '@/components/organisms/profile-shell/types';
import type { LegacySocialLink } from '@/types/db';
import { ProfilePrimaryCTA } from './ProfilePrimaryCTA';
import {
  PROFILE_STORY_ARTIST,
  profileStoryNoop,
} from './profile-story-fixture';

/**
 * Rendered states of the profile primary CTA. The default story lives in
 * ProfilePrimaryCTA.stories.tsx.
 */
const CHECKING_NOTIFICATIONS: ProfileNotificationsContextValue = {
  state: 'idle',
  setState: profileStoryNoop,
  hydrationStatus: 'checking',
  hasStoredContacts: true,
  notificationsEnabled: true,
  channel: 'email',
  setChannel: profileStoryNoop,
  subscribedChannels: {},
  setSubscribedChannels: profileStoryNoop,
  subscriptionDetails: {},
  setSubscriptionDetails: profileStoryNoop,
  openSubscription: profileStoryNoop,
  registerInputFocus: profileStoryNoop,
  smsEnabled: false,
};

const CheckingNotificationsFrame: Decorator =
  function CheckingNotificationsFrame(Story) {
    return (
      <ProfileNotificationsContext.Provider value={CHECKING_NOTIFICATIONS}>
        <Story />
      </ProfileNotificationsContext.Provider>
    );
  };

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

function socialLink(platform: string, url: string): LegacySocialLink {
  return {
    id: `link-${platform}`,
    artist_id: PROFILE_STORY_ARTIST.id,
    platform,
    url,
    clicks: 0,
    created_at: '2026-04-24T00:00:00.000Z',
  };
}

const meta = {
  title: 'Profile/ProfilePrimaryCTA/States',
  component: ProfilePrimaryCTA,
  parameters: { layout: 'centered' },
  args: {
    artist: PROFILE_STORY_ARTIST,
    socialLinks: [],
    showCapture: true,
  },
} satisfies Meta<typeof ProfilePrimaryCTA>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Loading: the stored subscription is still being checked, so the CTA holds
 * the listen action instead of flashing the alerts capture.
 */
export const LoadingSubscriptionCheck: Story = {
  decorators: [CheckingNotificationsFrame],
};

/** Empty: no social links, so the CTA falls back to the listen action. */
export const EmptyNoSocialLinks: Story = {
  args: { showCapture: false },
};

/** Partial: a tickets link outranks every other next action. */
export const PartialTicketsLink: Story = {
  args: {
    showCapture: false,
    socialLinks: [socialLink('bandsintown', 'https://bandsintown.com/a/1')],
  },
};

/** Partial: a merch link becomes the next action when there are no tickets. */
export const PartialShopLink: Story = {
  args: {
    showCapture: false,
    socialLinks: [socialLink('bandcamp', 'https://timwhite.bandcamp.com')],
  },
};

/** Partial: a visitor who prefers Spotify gets the Spotify hand-off. */
export const PartialSpotifyPreferred: Story = {
  args: {
    showCapture: false,
    spotifyPreferred: true,
    socialLinks: [socialLink('spotify', 'https://open.spotify.com/artist/4u')],
  },
};

/** Long content: an artist name far past one line beside the listen action. */
export const LongContentArtistName: Story = {
  args: {
    showCapture: false,
    artist: {
      ...PROFILE_STORY_ARTIST,
      name: 'The Extraordinarily Long Named Independent Collective Featuring Many Guests',
    },
  },
};

/** Right-to-left: the listen CTA in an Arabic document direction. */
export const RtlArabicDocument: Story = {
  args: { showCapture: false },
  decorators: [RtlFrame],
};
