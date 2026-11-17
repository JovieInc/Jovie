import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ComponentType } from 'react';
import type { AudienceMember } from '@/types';
import { AudienceMemberActivityFeed } from './AudienceMemberActivityFeed';

const member: AudienceMember = {
  id: 'aud-1',
  type: 'email',
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
  ],
  referrerHistory: [],
  utmParams: {},
  email: 'avery@example.com',
  phone: null,
  emailVisibleToArtist: true,
  spotifyConnected: true,
  purchaseCount: 1,
  tipAmountTotalCents: 500,
  tipCount: 1,
  tags: ['superfan'],
  deviceType: 'mobile',
  lastSeenAt: '2026-08-31T18:20:00.000Z',
};

function withRail(Story: ComponentType) {
  return (
    <div className='w-80 max-w-full bg-base p-4 text-primary-token'>
      <Story />
    </div>
  );
}

function withRtl(Story: ComponentType) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/** State coverage for the audience member activity timeline. */
const meta = {
  title: 'Features/Dashboard/AudienceMemberActivityFeed States',
  component: AudienceMemberActivityFeed,
  parameters: { layout: 'centered' },
  decorators: [withRail],
  args: { member },
} satisfies Meta<typeof AudienceMemberActivityFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: an unknown event label and a long source truncate in the rail. */
export const LongContentLabels: Story = {
  args: {
    member: {
      ...member,
      latestActions: [
        {
          label:
            'Opened the extended deluxe edition pre-save campaign landing page from a shared story link',
          sourceLabel: 'An exceptionally long referral source name',
          timestamp: '2026-08-31T18:20:00.000Z',
        },
      ],
    },
  },
};

/** Right-to-left: the timeline inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [withRtl],
};
