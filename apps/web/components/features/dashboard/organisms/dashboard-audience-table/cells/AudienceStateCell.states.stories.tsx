import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AudienceMember } from '@/types';
import { AudienceStateCell } from './AudienceStateCell';
import { NowMsProvider } from './NowMsContext';

const member: AudienceMember = {
  id: 'aud-1',
  type: 'email',
  displayName: 'Sasha Fan',
  locationLabel: 'Los Angeles, US',
  geoCity: 'Los Angeles',
  geoCountry: 'US',
  visits: 12,
  engagementScore: 85,
  intentLevel: 'high',
  latestActions: [
    { label: 'Visited profile', timestamp: new Date().toISOString() },
  ],
  referrerHistory: [],
  utmParams: {},
  email: 'sasha.fan@example.com',
  emailVisibleToArtist: true,
  phone: null,
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: 'mobile',
  lastSeenAt: new Date().toISOString(),
};

/** State coverage for the audience state badge. */
const meta = {
  title:
    'Dashboard/Organisms/DashboardAudienceTable/Cells/AudienceStateCell States',
  component: AudienceStateCell,
  parameters: { layout: 'centered' },
  decorators: [
    function MetaDecorator(Story) {
      return (
        <NowMsProvider>
          <Story />
        </NowMsProvider>
      );
    },
  ],
  args: { member, mode: 'members' },
} satisfies Meta<typeof AudienceStateCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a fan with no actions, visits or last-seen time. */
export const EmptyActivity: Story = {
  args: {
    member: {
      ...member,
      visits: 0,
      engagementScore: 0,
      intentLevel: 'low',
      latestActions: [],
      lastSeenAt: null,
    },
  },
};

/** Right-to-left: the badge inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
