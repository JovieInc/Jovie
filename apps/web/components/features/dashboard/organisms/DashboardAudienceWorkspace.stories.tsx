import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import type { AudienceMember } from '@/types';
import { DashboardAudienceWorkspace } from './DashboardAudienceWorkspace';
import { DEFAULT_AUDIENCE_FILTERS } from './dashboard-audience-table/types';

/**
 * DashboardAudienceWorkspace is a thin re-export of DashboardAudienceTable
 * (see `./dashboard-audience-table`, already storied). This adjacent story
 * exists only to satisfy the per-file coverage ratchet for this re-export
 * path — it mirrors a subset of the canonical stories rather than
 * duplicating the full matrix.
 */
const mockMembers: AudienceMember[] = [
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

const meta: Meta<typeof DashboardAudienceWorkspace> = {
  title: 'Dashboard/Organisms/DashboardAudienceWorkspace',
  component: DashboardAudienceWorkspace,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    withDashboardProviders,
    Story => (
      <TableMetaProvider>
        <div className='h-180 bg-surface-1 text-primary-token'>
          <Story />
        </div>
      </TableMetaProvider>
    ),
  ],
  args: {
    total: 1,
    subscriberCount: 1,
    filters: DEFAULT_AUDIENCE_FILTERS,
    direction: 'desc',
    onSortChange: () => {},
    onViewChange: () => {},
    onFiltersChange: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Members: Story = {
  args: {
    mode: 'members',
    view: 'all',
    rows: mockMembers,
    sort: 'lastSeen',
  },
};

export const Subscribers: Story = {
  args: {
    mode: 'subscribers',
    view: 'identified',
    rows: mockMembers,
    sort: 'createdAt',
  },
};
