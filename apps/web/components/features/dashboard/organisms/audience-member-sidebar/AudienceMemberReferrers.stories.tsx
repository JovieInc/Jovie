import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ComponentType } from 'react';
import type { AudienceMember } from '@/types';
import { AudienceMemberReferrers } from './AudienceMemberReferrers';

const member = {
  id: 'aud-1',
  type: 'email',
  displayName: 'Avery Stone',
  visits: 8,
  latestActions: [
    {
      label: 'link_click',
      sourceLabel: 'Instagram bio link',
      sourceKind: 'qr',
      sourceLinkCode: 'ig123',
      timestamp: '2026-08-31T17:05:00.000Z',
    },
  ],
  referrerHistory: [
    { url: 'https://instagram.com', timestamp: '2026-08-31T17:00:00.000Z' },
  ],
  utmParams: { source: 'newsletter', medium: 'email' },
  lastSeenAt: '2026-08-31T18:20:00.000Z',
} as unknown as AudienceMember;

function withRail(Story: ComponentType) {
  return (
    <div className='w-80 max-w-full bg-base p-4 text-primary-token'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Dashboard/Audience/MemberSidebar/AudienceMemberReferrers',
  component: AudienceMemberReferrers,
  parameters: { layout: 'centered' },
  decorators: [withRail],
  args: { member },
} satisfies Meta<typeof AudienceMemberReferrers>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: no actions, UTM or referrers have been recorded. */
export const EmptyNoSources: Story = {
  args: {
    member: {
      ...member,
      latestActions: [],
      referrerHistory: [],
      utmParams: {},
    } as unknown as AudienceMember,
  },
};

/** Partial: a UTM source with no medium, and no tracked source link. */
export const PartialUtmOnly: Story = {
  args: {
    member: {
      ...member,
      latestActions: [],
      referrerHistory: [],
      utmParams: { source: 'newsletter' },
    } as unknown as AudienceMember,
  },
};

/** Long content: very long source labels and referrer URLs truncate. */
export const LongContentSources: Story = {
  args: {
    member: {
      ...member,
      referrerHistory: [
        {
          url: 'https://example.com/a/very/long/referrer/path/that/keeps/going/and/going/and/going',
          timestamp: '2026-08-31T17:00:00.000Z',
        },
      ],
    } as unknown as AudienceMember,
  },
};

/** Rtl: the source list in a right-to-left drawer. */
export const RtlSources: Story = {
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
