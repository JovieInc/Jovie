import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';
import { TourModePanel } from './TourModePanel';

const meta: Meta<typeof TourModePanel> = {
  title: 'Profile/TourModePanel',
  component: TourModePanel,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  args: {
    artist: PROFILE_STORY_ARTIST,
    tourDates: [],
  },
};

export default meta;

type Story = StoryObj<typeof TourModePanel>;

function storyTourDate(
  overrides: Partial<TourDateViewModel> = {}
): TourDateViewModel {
  return {
    id: 'tour-1',
    profileId: 'artist-1',
    externalId: null,
    provider: 'manual',
    eventType: 'tour',
    confirmationStatus: 'confirmed',
    reviewedAt: null,
    title: null,
    startDate: '2030-08-20T20:00:00.000Z',
    startTime: null,
    timezone: 'America/Los_Angeles',
    venueName: 'The Novo',
    city: 'Los Angeles',
    region: 'CA',
    country: 'US',
    latitude: null,
    longitude: null,
    ticketUrl: 'https://tickets.example.com/the-novo',
    ticketStatus: 'available',
    lastSyncedAt: null,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
    ...overrides,
  };
}

// The profile stage: the panel's on-media text is drawn for this surface.
const onProfileStage: NonNullable<Story['decorators']> = [
  Story => (
    <div className='profile-viewport w-sm max-w-full bg-(--profile-stage-bg) p-4'>
      <Story />
    </div>
  ),
];

export const Empty: Story = {};

export const Upcoming: Story = {
  decorators: onProfileStage,
  args: {
    tourDates: [
      storyTourDate(),
      storyTourDate({
        id: 'tour-2',
        startDate: '2030-08-22T20:00:00.000Z',
        venueName: 'Fox Theater',
        city: 'Oakland',
        ticketUrl: 'https://tickets.example.com/fox-theater',
      }),
    ],
  },
};

// Dates announced before tickets, sold out, cancelled, or with no region.
export const PartialTicketInfo: Story = {
  decorators: onProfileStage,
  args: {
    tourDates: [
      storyTourDate({ ticketUrl: null }),
      storyTourDate({
        id: 'tour-2',
        startDate: '2030-08-22T20:00:00.000Z',
        venueName: 'Fox Theater',
        city: 'Oakland',
        ticketStatus: 'sold_out',
      }),
      storyTourDate({
        id: 'tour-3',
        startDate: '2030-09-02T20:00:00.000Z',
        venueName: 'Paradiso',
        city: 'Amsterdam',
        region: null,
        country: 'NL',
        ticketStatus: 'cancelled',
      }),
    ],
  },
};

export const LongContent: Story = {
  decorators: onProfileStage,
  args: {
    tourDates: [
      storyTourDate({
        venueName:
          'The Grand Ballroom At The Historic Paramount Theatre And Performing Arts Center',
        city: 'Saint-Remy-en-Bouzemont-Saint-Genest-et-Isson',
        region: 'Grand Est',
        country: 'FR',
      }),
      storyTourDate({
        id: 'tour-2',
        startDate: '2030-08-22T20:00:00.000Z',
        venueName:
          'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch Community Hall',
        city: 'Llanfairpwllgwyngyll',
        region: 'Anglesey',
        ticketUrl: null,
      }),
    ],
  },
};

export const Rtl: Story = {
  decorators: [
    Story => (
      <div
        dir='rtl'
        lang='ar'
        className='profile-viewport w-sm max-w-full bg-(--profile-stage-bg) p-4'
      >
        <Story />
      </div>
    ),
  ],
  args: {
    tourDates: [
      storyTourDate({
        venueName: 'مسرح دار الأوبرا',
        city: 'القاهرة',
        region: null,
        country: 'EG',
      }),
    ],
  },
};
