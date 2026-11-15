import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
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
  emailVisibleToArtist: true,
  phone: null,
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: 'mobile',
  lastSeenAt: '2026-09-01T12:00:00.000Z',
};

/** State coverage for the audience date cell with its row actions menu. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceCreatedAtCell States',
  component: AudienceCreatedAtCell,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    function HoverGroup(Story) {
      return (
        <div className='group w-56'>
          <Story />
        </div>
      );
    },
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

/** Empty: no date on record shows a dash. */
export const EmptyDate: Story = {
  args: {
    lastSeenAt: null,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('—')).toBeVisible();
  },
};

/** Right-to-left: the date and the actions menu inside an RTL document. */
export const RtlDate: Story = {
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
