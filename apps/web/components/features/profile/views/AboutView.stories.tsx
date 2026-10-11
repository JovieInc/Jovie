import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { PublicContact } from '@/types/contacts';
import { PROFILE_STORY_ARTIST } from '../profile-story-fixture';
import { AboutView } from './AboutView';

const bookingContact: PublicContact = {
  id: 'contact-1',
  role: 'bookings',
  roleLabel: 'Booking',
  territorySummary: 'Worldwide',
  territoryCount: 1,
  channels: [{ type: 'email', encoded: 'bW9va0BleGFtcGxlLmNvbQ==' }],
};

const meta = {
  title: 'Profile/Views/AboutView',
  component: AboutView,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: [
        'genres',
        'pressPhotos',
        'allowPhotoDownloads',
        'bioSegments',
      ],
    },
  },
  args: {
    artist: PROFILE_STORY_ARTIST,
  },
  decorators: [
    Story => (
      <div className='bg-base p-6'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AboutView>;

export default meta;

export const WithCreditsAndContacts: StoryObj<typeof meta> = {
  args: {
    creditSegments: [
      { type: 'text', text: "Tim White's credited collaborators include " },
      { type: 'artist', text: 'Guest Vocalist', href: '/guestvocalist' },
      { type: 'text', text: ' on "' },
      {
        type: 'release',
        text: 'Neon Circuit',
        href: '/timwhite/neon-circuit',
      },
      { type: 'text', text: '".' },
    ],
    contacts: [bookingContact],
  },
};

export const Sparse: StoryObj<typeof meta> = {
  args: {
    contacts: [],
  },
};
