import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ComponentType } from 'react';
import { expect, within } from 'storybook/test';
import type { AudienceMember } from '@/types';
import { AudienceMemberDetails } from './AudienceMemberDetails';

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

const meta = {
  title: 'Features/Dashboard/Audience/AudienceMemberDetails',
  component: AudienceMemberDetails,
  parameters: { layout: 'centered' },
  decorators: [withRail],
  args: { member },
} satisfies Meta<typeof AudienceMemberDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    member: {
      ...member,
      phone: '+15551234567',
      utmParams: { source: 'instagram', medium: 'social', campaign: 'tour' },
    },
  },
};

/** Empty: an anonymous visitor with no location, device, contact or UTM data. */
export const Empty: Story = {
  args: {
    member: {
      ...member,
      type: 'anonymous',
      displayName: null,
      locationLabel: '',
      deviceType: null,
      visits: 0,
      email: null,
      lastSeenAt: null,
      intentLevel: 'low',
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByText('Unknown')).toHaveLength(2);
  },
};

/** Error: a malformed encoded location falls back to the raw label. */
export const ErrorMalformedLocation: Story = {
  args: { member: { ...member, locationLabel: 'S%E3o Paulo' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('S%E3o Paulo')).toBeVisible();
  },
};

/** Long content: long location, campaign and email values wrap in the rail. */
export const LongContentValues: Story = {
  args: {
    member: {
      ...member,
      locationLabel:
        'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch, Wales, United Kingdom',
      utmParams: {
        campaign:
          'deluxe-edition-presave-campaign-worldwide-launch-week-story-swipe-up',
      },
      email:
        'avery.stone.official.superfan.mailing.list@international-music-collective.example.com',
    },
  },
};

/** Right-to-left: the property rows inside an RTL document. */
export const RtlDocument: Story = {
  args: { member: { ...member, locationLabel: 'القاهرة، مصر' } },
  decorators: [withRtl],
};
