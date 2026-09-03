import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AudienceMember } from '@/types';
import { AudienceMemberActivityFeed } from './AudienceMemberActivityFeed';

const audienceMember = {
  id: 'story-audience-member',
  type: 'anonymous',
  displayName: 'Avery Stone',
  locationLabel: 'Brooklyn, NY',
  geoCity: 'Brooklyn',
  geoCountry: 'US',
  visits: 8,
  engagementScore: 82,
  intentLevel: 'high',
  latestActions: [
    {
      label: 'profile_view',
      sourceLabel: 'Instagram',
      confidence: 'verified',
      timestamp: '2026-08-31T18:20:00.000Z',
    },
    {
      label: 'link_click',
      sourceLabel: 'Listen Now',
      timestamp: '2026-08-31T17:05:00.000Z',
    },
    {
      label: 'follow',
      timestamp: '2026-08-31T16:30:00.000Z',
    },
  ],
  referrerHistory: [],
  utmParams: {},
  email: 'avery@example.com',
  phone: null,
  spotifyConnected: true,
  purchaseCount: 1,
  tipAmountTotalCents: 500,
  tipCount: 1,
  tags: ['superfan'],
  deviceType: 'mobile',
  lastSeenAt: '2026-08-31T18:20:00.000Z',
} satisfies AudienceMember;

const meta = {
  title: 'Features/Dashboard/AudienceMemberActivityFeed',
  component: AudienceMemberActivityFeed,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-[20rem] max-w-[calc(100vw-2rem)] bg-base p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    member: audienceMember,
  },
} satisfies Meta<typeof AudienceMemberActivityFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RecentActions: Story = {};

export const Empty: Story = {
  args: {
    member: {
      ...audienceMember,
      latestActions: [],
    },
  },
};
