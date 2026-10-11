import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { NowMsProvider } from '@/components/features/dashboard/organisms/dashboard-audience-table/cells/NowMsContext';
import type { AudienceMember } from '@/types';
import { AudienceMobileCard } from './AudienceMobileCard';

const member: AudienceMember = {
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
  lastSeenAt: '2026-09-27T12:00:00.000Z',
};

const meta = {
  title: 'Organisms/Table/Atoms/AudienceMobileCard',
  component: AudienceMobileCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <NowMsProvider>
        <div className='w-80 rounded-lg border border-subtle bg-surface-0'>
          <Story />
        </div>
      </NowMsProvider>
    ),
  ],
  args: {
    member,
    mode: 'members',
    onTap: fn(),
    onAction: fn(),
  },
} satisfies Meta<typeof AudienceMobileCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = {
  args: {
    isSelected: true,
  },
};

export const AnonymousVisitor: Story = {
  args: {
    member: {
      ...member,
      type: 'anonymous',
      displayName: null,
      email: null,
    },
  },
};
