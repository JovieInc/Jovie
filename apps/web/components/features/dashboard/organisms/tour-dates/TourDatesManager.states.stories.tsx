import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { onlineManager } from '@tanstack/react-query';
import { expect, userEvent, within } from 'storybook/test';
import { ChatEntityPanelProvider } from '@/app/app/(shell)/chat/ChatEntityPanelContext';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { TourDatesManager } from './TourDatesManager';

const LONG_ARTIST_NAME =
  'Sasha Waves and the Extraordinarily Long Collaborative Orchestra of the Northern Coastline';
const LONG_VENUE_NAME =
  'The Grand Municipal Amphitheatre and Performing Arts Pavilion at Riverside Commons';

function createTourDate(
  overrides: Partial<TourDateViewModel> = {}
): TourDateViewModel {
  return {
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
    ...overrides,
  };
}

const tourDates = [
  createTourDate(),
  createTourDate({
    id: 'td_2',
    externalId: 'bit_2',
    startDate: '2030-11-21T04:00:00.000Z',
    venueName: 'The Fillmore',
    city: 'San Francisco',
    ticketUrl: null,
    ticketStatus: 'sold_out',
  }),
];

const withPanels: Decorator = Story => (
  <RightPanelProvider>
    <ChatEntityPanelProvider resetKey='profile_1'>
      <div className='h-120'>
        <Story />
      </div>
    </ChatEntityPanelProvider>
  </RightPanelProvider>
);

const withRtl: Decorator = Story => (
  <div dir='rtl'>
    <Story />
  </div>
);

const withNarrowColumn: Decorator = Story => (
  <div className='w-full max-w-md'>
    <Story />
  </div>
);

/** Pauses mutations so a started sync stays pending for the whole story. */
function pauseMutations() {
  onlineManager.setOnline(false);
  return () => {
    onlineManager.setOnline(true);
  };
}

function getHeaderSyncButton(canvasElement: HTMLElement) {
  return within(canvasElement).getAllByRole('button', { name: 'Sync' })[0];
}

const meta = {
  title: 'Features/Dashboard/TourDates/TourDatesManager States',
  component: TourDatesManager,
  parameters: { layout: 'fullscreen' },
  decorators: [withPanels],
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

/** Loading: a sync is in flight, so every sync control is disabled. */
export const LoadingSyncInFlight: Story = {
  beforeEach: pauseMutations,
  play: async ({ canvasElement }) => {
    await userEvent.click(getHeaderSyncButton(canvasElement));
    const buttons = await within(canvasElement).findAllByRole('button', {
      name: 'Sync',
    });
    for (const button of buttons) {
      await expect(button).toBeDisabled();
    }
  },
};

/** Empty: no API key and no dates, so the connect flow replaces the table. */
export const EmptyNotConnected: Story = {
  args: {
    initialTourDates: [],
    connectionStatus: {
      connected: false,
      hasApiKey: false,
      artistName: null,
      lastSyncedAt: null,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByPlaceholderText('Your Bandsintown API key')
    ).toBeVisible();
    await expect(canvas.queryByTestId('tour-dates-manager')).toBeNull();
  },
};

/** Error: the sync request rejects and the failure is announced in a toast. */
export const ErrorSyncFailed: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(getHeaderSyncButton(canvasElement));
    await expect(
      await within(document.body).findByText('Failed to sync tour dates')
    ).toBeVisible();
    await expect(getHeaderSyncButton(canvasElement)).toBeEnabled();
  },
};

/** Long content: a long artist name and venue names in a narrow column. */
export const LongContentArtistAndVenues: Story = {
  args: {
    initialTourDates: [
      createTourDate({ venueName: LONG_VENUE_NAME }),
      createTourDate({
        id: 'td_2',
        externalId: 'bit_2',
        title: null,
        venueName: `${LONG_VENUE_NAME} (Second Night)`,
      }),
    ],
    connectionStatus: {
      connected: true,
      hasApiKey: true,
      artistName: LONG_ARTIST_NAME,
      lastSyncedAt: null,
    },
  },
  decorators: [withNarrowColumn],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_ARTIST_NAME)).toBeInTheDocument();
    await expect(
      canvas.getAllByText(LONG_VENUE_NAME, { exact: false }).length
    ).toBeGreaterThan(0);
  },
};

/** Offline: with no connection the sync cannot leave the device and stays pending. */
export const OfflineSyncPaused: Story = {
  args: { initialTourDates: [] },
  beforeEach: pauseMutations,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No upcoming tour dates')).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Sync From Bandsintown' })
    );
    await expect(
      await canvas.findByRole('button', { name: 'Sync From Bandsintown' })
    ).toBeDisabled();
  },
};

/** Right-to-left: the connected manager inside an RTL document. */
export const RtlConnected: Story = {
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Tim White')).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Disconnect' })
    ).toBeEnabled();
  },
};
