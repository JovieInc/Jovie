import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { PublicContact } from '@/types/contacts';
import { AboutSection } from './AboutSection';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

const bookingContact: PublicContact = {
  id: 'contact-1',
  role: 'bookings',
  roleLabel: 'Booking',
  territorySummary: 'Worldwide',
  territoryCount: 1,
  channels: [{ type: 'email', encoded: 'bW9va0BleGFtcGxlLmNvbQ==' }],
};

const meta = {
  title: 'Profile/AboutSection',
  component: AboutSection,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: [
        'disabled',
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
} satisfies Meta<typeof AboutSection>;

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

export const Empty: StoryObj<typeof meta> = {
  args: {
    artist: {
      ...PROFILE_STORY_ARTIST,
      tagline: null,
      location: null,
      hometown: null,
      active_since_year: null,
    },
    genres: [],
    contacts: [],
  },
};
