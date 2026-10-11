import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AudienceMember } from '@/types';
import { AudienceStateCell } from './AudienceStateCell';
import { NowMsProvider } from './NowMsContext';

const baseMember: AudienceMember = {
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
  phone: null,
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: 'mobile',
  lastSeenAt: new Date().toISOString(),
};

const meta = {
  title: 'Dashboard/Organisms/DashboardAudienceTable/Cells/AudienceStateCell',
  component: AudienceStateCell,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <NowMsProvider>
        <Story />
      </NowMsProvider>
    ),
  ],
  args: {
    member: baseMember,
    mode: 'members',
  },
} satisfies Meta<typeof AudienceStateCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};

export const Dormant: Story = {
  args: {
    member: {
      ...baseMember,
      lastSeenAt: new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString(),
      latestActions: [],
    },
  },
};

export const SubscriberMode: Story = {
  args: {
    mode: 'subscribers',
  },
};
