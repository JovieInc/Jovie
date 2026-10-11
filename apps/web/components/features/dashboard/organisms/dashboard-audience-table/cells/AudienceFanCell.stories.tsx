import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AudienceMember } from '@/types';
import { AudienceFanCell } from './AudienceFanCell';

const baseMember: AudienceMember = {
  id: 'aud-1',
  type: 'email',
  displayName: 'Sasha Fan',
  locationLabel: 'Los Angeles, US',
  geoCity: 'Los Angeles',
  geoCountry: 'US',
  visits: 12,
  engagementScore: 72,
  intentLevel: 'high',
  latestActions: [],
  referrerHistory: [],
  utmParams: {},
  email: 'sasha.fan@example.com',
  phone: null,
  emailVisibleToArtist: true,
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: 'mobile',
  lastSeenAt: '2026-09-25T00:00:00.000Z',
};

const meta = {
  title: 'Dashboard/Organisms/DashboardAudienceTable/Cells/AudienceFanCell',
  component: AudienceFanCell,
  parameters: {
    layout: 'centered',
  },
  render: args => (
    <div className='w-64'>
      <AudienceFanCell {...args} />
    </div>
  ),
  args: {
    member: baseMember,
  },
} satisfies Meta<typeof AudienceFanCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Identified: Story = {};

export const Anonymous: Story = {
  args: {
    member: {
      ...baseMember,
      displayName: null,
      email: null,
      spotifyConnected: false,
    },
  },
};

export const SpotifyConnected: Story = {
  args: {
    member: {
      ...baseMember,
      spotifyConnected: true,
    },
  },
};
