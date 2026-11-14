import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import type { PublicContact } from '@/types/contacts';
import { ProfileUnifiedDrawer } from './ProfileUnifiedDrawer';
import {
  PROFILE_STORY_ARTIST,
  PROFILE_STORY_CONTENT_PREFS,
  profileStoryNoop,
} from './profile-story-fixture';

/**
 * Rendered states of the unified profile drawer. The default stories live in
 * ProfileUnifiedDrawer.stories.tsx.
 */
const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

function firstChannel(contact: PublicContact) {
  return contact.channels[0];
}

const meta = {
  title: 'Profile/ProfileUnifiedDrawer/States',
  component: ProfileUnifiedDrawer,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    onOpenChange: profileStoryNoop,
    view: 'menu',
    onViewChange: profileStoryNoop,
    artist: PROFILE_STORY_ARTIST,
    socialLinks: [],
    contacts: [],
    primaryChannel: firstChannel,
    dsps: [],
    isSubscribed: true,
    contentPrefs: PROFILE_STORY_CONTENT_PREFS,
    onTogglePref: profileStoryNoop,
    onUnsubscribe: profileStoryNoop,
    isUnsubscribing: false,
    hasTip: false,
    hasContacts: false,
    hasTourDates: false,
    hasReleases: false,
  },
} satisfies Meta<typeof ProfileUnifiedDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the contact view of a profile with no public contacts. */
export const EmptyContactView: Story = {
  args: { view: 'contact' },
};

/** Error: the pay view when the profile has no usable Venmo link. */
export const ErrorPaymentsUnavailable: Story = {
  args: { view: 'pay', hasTip: true },
};

/** Partial: the menu with only the share entry, no pay or contact. */
export const PartialMenuShareOnly: Story = {};

/** Partial: alert preferences with some topics on, and the turn-off action. */
export const PartialNotificationPreferences: Story = {
  args: { view: 'notifications' },
};

/** The alerts turn-off action while alerts are turning off. */
export const PartialTurningOffNotifications: Story = {
  args: { view: 'notifications', isUnsubscribing: true },
};

/** Long content: the About view with a long bio and a long contact role. */
export const LongContentAbout: Story = {
  args: {
    view: 'about',
    artist: {
      ...PROFILE_STORY_ARTIST,
      tagline:
        'Producer, songwriter, and after-hours romantic who has spent fifteen years building records in borrowed studios, late-night sessions and tour buses across three continents, with every collaboration collected into one long, unbroken set.',
      location: 'Los Angeles, California, United States of America',
    },
    genres: ['progressive house', 'melodic techno', 'deep house'],
  },
};

/** Right-to-left: the menu in an Arabic document direction. */
export const RtlArabicMenu: Story = {
  args: { hasTip: true },
  decorators: [RtlFrame],
};
