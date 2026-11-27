import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardStoryProviders } from '@/.storybook/dashboard-fixtures';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import type { AudienceMember } from '@/types';
import { DashboardAudienceTableUnified } from './DashboardAudienceTableUnified';
import { DEFAULT_AUDIENCE_FILTERS } from './types';

function buildMember(overrides: Partial<AudienceMember>): AudienceMember {
  return {
    id: 'aud-state',
    type: 'email',
    displayName: 'Maya Okafor',
    locationLabel: '',
    geoCity: null,
    geoCountry: null,
    visits: 1,
    engagementScore: 50,
    intentLevel: 'medium',
    latestActions: [],
    referrerHistory: [],
    utmParams: {},
    email: 'maya@example.com',
    emailVisibleToArtist: true,
    phone: null,
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

const baseArgs = {
  mode: 'members',
  view: 'all',
  total: 1,
  sort: 'lastSeen',
  direction: 'desc',
  onSortChange: () => undefined,
  onViewChange: () => undefined,
  onFiltersChange: () => undefined,
  filters: DEFAULT_AUDIENCE_FILTERS,
  subscriberCount: 0,
} as const;

function WithAudienceProviders({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <DashboardStoryProviders>
      <TableMetaProvider>
        <div className='h-180 bg-surface-1 text-primary-token'>{children}</div>
      </TableMetaProvider>
    </DashboardStoryProviders>
  );
}

const meta: Meta<typeof DashboardAudienceTableUnified> = {
  title: 'Dashboard/Audience/DashboardAudienceTableUnified/States',
  component: DashboardAudienceTableUnified,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function WithProviders(Story) {
      return (
        <WithAudienceProviders>
          <Story />
        </WithAudienceProviders>
      );
    },
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a member with no location, device, last seen date or tags. */
export const Partial: Story = {
  args: { ...baseArgs, rows: [buildMember({})] },
};

/** Long content: a very long name and address that must truncate in the row. */
export const LongContent: Story = {
  args: {
    ...baseArgs,
    rows: [
      buildMember({
        displayName:
          'Alexandria Montgomery-Featherstonehaugh de la Cruz y Villanueva',
        email: 'alexandria.montgomery.featherstonehaugh.delacruz@example.com',
        locationLabel:
          'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch',
      }),
    ],
  },
};

/** Rtl: an Arabic name in a right-to-left page. */
export const Rtl: Story = {
  args: {
    ...baseArgs,
    rows: [
      buildMember({ displayName: 'ليلى الحسن', email: 'layla@example.com' }),
    ],
  },
  decorators: [
    function WithRtl(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
