import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { TourDatesTable } from './TourDatesTable';

const tourDate: TourDateViewModel = {
  id: 'td_1',
  profileId: 'profile_1',
  externalId: null,
  provider: 'manual',
  eventType: 'tour',
  confirmationStatus: 'confirmed',
  reviewedAt: null,
  title: null,
  startDate: '2026-11-14',
  startTime: '20:00',
  timezone: 'America/Los_Angeles',
  venueName: 'The Echo',
  city: 'Los Angeles',
  region: 'CA',
  country: 'US',
  latitude: null,
  longitude: null,
  ticketUrl: null,
  ticketStatus: 'available',
  lastSyncedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const meta = {
  title: 'Dashboard/TourDates/TourDatesTable/States',
  component: TourDatesTable,
  parameters: { layout: 'fullscreen' },
  args: { tourDates: [tourDate], onEdit: fn(), onDelete: fn(), onSync: fn() },
} satisfies Meta<typeof TourDatesTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: a sync is running, so the Sync action is disabled. */
export const Loading: Story = { args: { isSyncing: true } };

/** Empty: no tour dates yet. */
export const Empty: Story = { args: { tourDates: [] } };

/** Partial: a manual date with no time, ticket link or region. */
export const Partial: Story = {
  args: {
    tourDates: [
      { ...tourDate, startTime: null, region: null, ticketUrl: null },
    ],
  },
};

/** Long content: a venue and city that overflow their columns. */
export const LongContent: Story = {
  args: {
    tourDates: [
      {
        ...tourDate,
        venueName:
          'The Extraordinarily Long Named Amphitheatre and Convention Center',
        city: 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch',
        ticketUrl: 'https://example.com/tickets',
        provider: 'admin_import',
      },
    ],
  },
};

/** Rtl: right-to-left layout. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    tourDates: [{ ...tourDate, venueName: 'قاعة الحفلات', city: 'دبي' }],
  },
};
