import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { AudienceMember } from '@/types';
import { AudienceFanCell } from './AudienceFanCell';

const member: AudienceMember = {
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

const LONG_NAME =
  'Alexandria Montgomery-Fitzgerald of the Extremely Long Fan Club Name';
const LONG_EMAIL =
  'alexandria.montgomery.fitzgerald.superfan.mailing.list@example-music-label.com';

/** State coverage for the audience identity cell on the one-line people row. */
const meta = {
  title:
    'Dashboard/Organisms/DashboardAudienceTable/Cells/AudienceFanCell States',
  component: AudienceFanCell,
  parameters: { layout: 'centered' },
  render: function MetaRender(args) {
    return (
      <div className='w-64'>
        <AudienceFanCell {...args} />
      </div>
    );
  },
  args: { member },
} satisfies Meta<typeof AudienceFanCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long name and email clamp to one line inside the cell. */
export const LongContentIdentity: Story = {
  args: { member: { ...member, displayName: LONG_NAME, email: LONG_EMAIL } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_NAME)).toBeVisible();
  },
};

/** Right-to-left: an Arabic name in an RTL document. */
export const RtlDocument: Story = {
  args: { member: { ...member, displayName: 'سارة المعجبة' } },
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('سارة المعجبة')).toBeVisible();
  },
};
