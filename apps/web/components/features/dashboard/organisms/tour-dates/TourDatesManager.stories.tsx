import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatEntityPanelProvider } from '@/app/app/(shell)/chat/ChatEntityPanelContext';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { TourDatesManager } from './TourDatesManager';

const tourDates: TourDateViewModel[] = [
  {
    id: 'td_1',
    profileId: 'profile_1',
    externalId: 'bit_1',
    provider: 'bandsintown',
    eventType: 'tour',
    confirmationStatus: 'confirmed',
    reviewedAt: null,
    title: 'Fall Tour',
    startDate: '2030-11-14T04:00:00.000Z',
    startTime: '8:00 PM',
    timezone: 'America/Los_Angeles',
    venueName: 'The Echo',
    city: 'Los Angeles',
    region: 'CA',
    country: 'US',
    latitude: null,
    longitude: null,
    ticketUrl: 'https://example.com/tickets/td_1',
    ticketStatus: 'available',
    lastSyncedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'td_2',
    profileId: 'profile_1',
    externalId: 'bit_2',
    provider: 'bandsintown',
    eventType: 'tour',
    confirmationStatus: 'confirmed',
    reviewedAt: null,
    title: 'Fall Tour',
    startDate: '2030-11-21T04:00:00.000Z',
    startTime: '9:00 PM',
    timezone: 'America/Los_Angeles',
    venueName: 'The Fillmore',
    city: 'San Francisco',
    region: 'CA',
    country: 'US',
    latitude: null,
    longitude: null,
    ticketUrl: null,
    ticketStatus: 'sold_out',
    lastSyncedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
];

const meta = {
  title: 'Features/Dashboard/TourDates/TourDatesManager',
  component: TourDatesManager,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <RightPanelProvider>
        <ChatEntityPanelProvider resetKey='profile_1'>
          <div className='h-120'>
            <Story />
          </div>
        </ChatEntityPanelProvider>
      </RightPanelProvider>
    ),
  ],
  args: {
    profileId: 'profile_1',
    initialTourDates: tourDates,
    connectionStatus: {
      connected: true,
      hasApiKey: true,
      artistName: 'Tim White',
      lastSyncedAt: '2026-11-07T18:00:00.000Z',
    },
  },
} satisfies Meta<typeof TourDatesManager>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};

export const ConnectedNoUpcomingDates: Story = {
  args: { initialTourDates: [] },
};
