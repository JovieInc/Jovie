import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  withDashboardProviders,
  withNuqsTestingAdapter,
} from '@/.storybook/dashboard-fixtures';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import type { AudienceMember } from '@/types';
import { DashboardAudienceClient } from './DashboardAudienceClient';
import { DEFAULT_AUDIENCE_FILTERS } from './dashboard-audience-table/types';

/**
 * DashboardAudienceClient's infinite-scroll query passes `initialRows`
 * straight through as react-query `initialData`, and its cache strategy
 * sets `refetchOnMount: false` — so with `initialData` present, no network
 * request fires on mount and the story renders `initialRows` directly.
 */
const initialRows: AudienceMember[] = [
  {
    id: 'aud-1',
    type: 'email',
    displayName: 'Sasha Fan',
    locationLabel: 'Los Angeles, US',
    geoCity: 'Los Angeles',
    geoCountry: 'US',
    visits: 12,
    engagementScore: 87,
    intentLevel: 'high',
    latestActions: [
      { label: 'Visited profile', timestamp: new Date().toISOString() },
    ],
    referrerHistory: [],
    utmParams: {},
    email: 'sasha@example.com',
    phone: null,
    spotifyConnected: false,
    purchaseCount: 0,
    tipAmountTotalCents: 3500,
    tipCount: 5,
    tags: ['superfan'],
    deviceType: 'mobile',
    lastSeenAt: new Date().toISOString(),
  },
];

const meta = {
  title: 'Dashboard/Organisms/DashboardAudienceClient',
  component: DashboardAudienceClient,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    withDashboardProviders,
    withNuqsTestingAdapter,
    Story => (
      <TableMetaProvider>
        <div className='h-180 bg-surface-1 text-primary-token'>
          <Story />
        </div>
      </TableMetaProvider>
    ),
  ],
  args: {
    initialRows,
    total: initialRows.length,
    // Required by DashboardAudienceClientProps but unused: the inner
    // component strips them (`Omit<..., 'page' | 'pageSize'>`) now that
    // rows load via infinite scroll instead of classic pagination.
    page: 1,
    pageSize: 10,
    subscriberCount: initialRows.length,
    totalAudienceCount: initialRows.length,
    filters: DEFAULT_AUDIENCE_FILTERS,
    direction: 'desc',
    profileId: 'story-profile',
    profileUrl: 'https://jov.ie/sashawaves',
  },
} satisfies Meta<typeof DashboardAudienceClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Members: Story = {
  args: {
    mode: 'members',
    view: 'all',
    sort: 'lastSeen',
  },
};

export const Subscribers: Story = {
  args: {
    mode: 'subscribers',
    view: 'identified',
    sort: 'createdAt',
  },
};

export const Empty: Story = {
  args: {
    mode: 'members',
    view: 'all',
    sort: 'lastSeen',
    initialRows: [],
    total: 0,
    subscriberCount: 0,
    totalAudienceCount: 0,
  },
};
