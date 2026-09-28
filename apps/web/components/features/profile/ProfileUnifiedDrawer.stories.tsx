import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { PublicContact } from '@/types/contacts';
import { ProfileUnifiedDrawer } from './ProfileUnifiedDrawer';
import {
  PROFILE_STORY_ARTIST,
  PROFILE_STORY_CONTENT_PREFS,
  profileStoryNoop,
} from './profile-story-fixture';

const bookingContact: PublicContact = {
  id: 'contact-1',
  role: 'bookings',
  roleLabel: 'Booking',
  territorySummary: 'Worldwide',
  territoryCount: 1,
  channels: [{ type: 'email', encoded: 'bW9va0BleGFtcGxlLmNvbQ==' }],
};

const meta = {
  title: 'Profile/ProfileUnifiedDrawer',
  component: ProfileUnifiedDrawer,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: [
        'shareContext',
        'primaryChannel',
        'pressPhotos',
        'allowPhotoDownloads',
        'creditSegments',
        'tourDates',
        'releases',
        'presentation',
        'enableDynamicEngagement',
        'subscribeTwoStep',
        'genres',
      ],
    },
  },
  args: {
    open: true,
    onOpenChange: profileStoryNoop,
    view: 'pay',
    onViewChange: profileStoryNoop,
    artist: PROFILE_STORY_ARTIST,
    socialLinks: [
      { platform: 'venmo', url: 'https://venmo.com/demo' } as never,
    ],
    contacts: [bookingContact],
    dsps: [],
    isSubscribed: false,
    contentPrefs: PROFILE_STORY_CONTENT_PREFS,
    onTogglePref: profileStoryNoop,
    onUnsubscribe: profileStoryNoop,
    isUnsubscribing: false,
    hasTip: true,
    hasContacts: false,
    hasTourDates: false,
    hasReleases: false,
  },
} satisfies Meta<typeof ProfileUnifiedDrawer>;

export default meta;

export const Menu: StoryObj<typeof meta> = {};

export const AboutDestination: StoryObj<typeof meta> = {
  args: {
    view: 'about',
    creditSegments: [
      { type: 'text', text: "Tim White's credited collaborators include " },
      { type: 'artist', text: 'Guest Vocalist', href: '/guestvocalist' },
      { type: 'text', text: '.' },
    ],
  },
};

export const PayNow: StoryObj<typeof meta> = {};
