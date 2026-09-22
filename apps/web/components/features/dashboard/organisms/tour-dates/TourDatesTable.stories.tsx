import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { TourDatesTable } from './TourDatesTable';

const tourDates: TourDateViewModel[] = [
  {
    id: 'td_1',
    profileId: 'profile_1',
    externalId: null,
    provider: 'manual',
    eventType: 'tour',
    confirmationStatus: 'confirmed',
    reviewedAt: null,
    title: 'The Echo',
    startDate: '2026-11-14',
    startTime: '20:00',
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
  } as TourDateViewModel,
];

const meta: Meta<typeof TourDatesTable> = {
  title: 'Dashboard/TourDates/TourDatesTable',
  component: TourDatesTable,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    tourDates,
    onEdit: () => undefined,
    onDelete: () => undefined,
  },
};

export const Empty: Story = {
  args: {
    tourDates: [],
    onEdit: () => undefined,
    onDelete: () => undefined,
  },
};
