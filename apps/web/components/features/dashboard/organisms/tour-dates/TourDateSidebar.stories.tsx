import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fn } from 'storybook/test';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { TourDateSidebar } from './TourDateSidebar';

const storyQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
  },
});

const tourDate: TourDateViewModel = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  profileId: 'profile_123',
  externalId: null,
  provider: 'manual',
  eventType: 'tour',
  confirmationStatus: 'confirmed',
  reviewedAt: null,
  title: 'Summer Tour 2026',
  startDate: '2026-06-15T20:00:00Z',
  startTime: '8:00 PM',
  timezone: 'America/Los_Angeles',
  venueName: 'The Wiltern',
  city: 'Los Angeles',
  region: 'CA',
  country: 'USA',
  latitude: 34.05,
  longitude: -118.24,
  ticketUrl: 'https://ticketmaster.com/event/abc',
  ticketStatus: 'available',
  lastSyncedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const meta = {
  title: 'Features/Dashboard/TourDates/TourDateSidebar',
  component: TourDateSidebar,
  parameters: {
    jovie: {
      uncoveredProps: ['isLoading'],
    },
  },
  args: {
    tourDate,
    profileId: 'profile_123',
    onClose: fn(),
  },
  decorators: [
    Story => (
      <QueryClientProvider client={storyQueryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof TourDateSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Selected: Story = {};

export const Empty: Story = {
  args: {
    tourDate: null,
  },
};
