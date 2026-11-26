import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardStoryProviders } from '@/.storybook/dashboard-fixtures';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import { DashboardAudienceTableUnified } from './DashboardAudienceTableUnified';
import type { AudienceRow } from './types';
import { DEFAULT_AUDIENCE_FILTERS } from './types';

const DAY = 24 * 60 * 60 * 1000;
const STORY_NOW = Date.parse('2026-11-20T12:00:00.000Z');

function row(overrides: Partial<AudienceRow> & { id: string }): AudienceRow {
  return {
    type: 'anonymous',
    displayName: null,
    locationLabel: '',
    geoCity: null,
    geoCountry: null,
    visits: 1,
    engagementScore: 50,
    intentLevel: 'medium',
    latestActions: [],
    referrerHistory: [],
    utmParams: {},
    email: null,
    phone: null,
    emailVisibleToArtist: false,
    spotifyConnected: false,
    purchaseCount: 0,
    tipAmountTotalCents: 0,
    tipCount: 0,
    tags: [],
    deviceType: null,
    lastSeenAt: null,
    ...overrides,
  };
}

/** Realistic mix: named, emailed, located, referred and device-only rows. */
const POPULATED_ROWS: AudienceRow[] = [
  row({
    id: 'a1',
    type: 'email',
    displayName: 'Sasha Fan',
    email: 'sasha@example.com',
    emailVisibleToArtist: true,
    engagementScore: 92,
    intentLevel: 'high',
    visits: 14,
    hasActiveAlerts: true,
    activeAlertChannels: ['email', 'push'],
    lastSeenAt: new Date(STORY_NOW - 3 * 60 * 60 * 1000).toISOString(),
  }),
  row({
    id: 'a2',
    geoCity: 'Los Angeles',
    geoCountry: 'US',
    locationLabel: 'Los Angeles, US',
    engagementScore: 64,
    visits: 5,
    lastSeenAt: new Date(STORY_NOW - 1 * DAY).toISOString(),
  }),
  row({
    id: 'a3',
    referrerHistory: [{ url: 'https://www.instagram.com/' }],
    engagementScore: 38,
    lastSeenAt: new Date(STORY_NOW - 2 * DAY).toISOString(),
  }),
  row({
    id: 'a4',
    type: 'email',
    displayName: 'Noor Ali',
    email: 'noor@example.com',
    emailVisibleToArtist: true,
    deviceType: 'mobile',
    engagementScore: 20,
    lastSeenAt: new Date(STORY_NOW - 7 * DAY).toISOString(),
  }),
  row({
    id: 'a5',
    deviceType: 'desktop',
    engagementScore: 0,
    lastSeenAt: new Date(STORY_NOW - 31 * DAY).toISOString(),
  }),
  row({
    id: 'a6',
    type: 'spotify',
    displayName: 'Jules Park',
    spotifyConnected: true,
    engagementScore: 78,
    intentLevel: 'high',
    lastSeenAt: new Date(STORY_NOW - 26 * 60 * 1000).toISOString(),
  }),
];

const meta: Meta<typeof DashboardAudienceTableUnified> = {
  title: 'Dashboard/Audience/DashboardAudienceTableUnified',
  component: DashboardAudienceTableUnified,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <DashboardStoryProviders>
        <TableMetaProvider>
          <Story />
        </TableMetaProvider>
      </DashboardStoryProviders>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    mode: 'members',
    view: 'all',
    rows: [],
    total: 0,
    sort: 'lastSeen',
    direction: 'desc',
    onSortChange: () => undefined,
    onViewChange: () => undefined,
    onFiltersChange: () => undefined,
    filters: DEFAULT_AUDIENCE_FILTERS,
    subscriberCount: 0,
  },
};

/** Linear-parity density: compact rows, quiet status, no row numbers, no empty columns. */
export const Populated: Story = {
  args: {
    mode: 'members',
    view: 'all',
    rows: POPULATED_ROWS,
    total: POPULATED_ROWS.length,
    sort: 'lastSeen',
    direction: 'desc',
    onSortChange: () => undefined,
    onViewChange: () => undefined,
    onFiltersChange: () => undefined,
    filters: DEFAULT_AUDIENCE_FILTERS,
    subscriberCount: 2,
  },
};
