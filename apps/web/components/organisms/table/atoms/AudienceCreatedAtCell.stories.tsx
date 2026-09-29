import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { AudienceMember } from '@/types';
import { AudienceCreatedAtCell } from './AudienceCreatedAtCell';

const row: AudienceMember = {
  id: 'member-1',
  type: 'email',
  displayName: 'Jamie Rivera',
  locationLabel: 'Los Angeles, CA',
  geoCity: 'Los Angeles',
  geoCountry: 'US',
  visits: 4,
  engagementScore: 62,
  intentLevel: 'medium',
  latestActions: [],
  referrerHistory: [],
  utmParams: {},
  email: 'jamie@example.com',
  phone: null,
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: 'mobile',
  lastSeenAt: '2026-09-01T12:00:00.000Z',
};

const meta = {
  title: 'Organisms/Table/Atoms/AudienceCreatedAtCell',
  component: AudienceCreatedAtCell,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='group w-56'>
        <Story />
      </div>
    ),
  ],
  args: {
    row,
    lastSeenAt: '2026-08-01T12:00:00.000Z',
    isMenuOpen: false,
    onMenuOpenChange: fn(),
  },
} satisfies Meta<typeof AudienceCreatedAtCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MenuOpen: Story = {
  args: {
    isMenuOpen: true,
  },
};
