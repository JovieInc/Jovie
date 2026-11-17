import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { AudienceMember } from '@/types';
import { AudienceTableStableProvider } from '../AudienceTableContext';
import { AudienceActionCell } from './AudienceActionCell';

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
  emailVisibleToArtist: true,
  phone: null,
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

/** State coverage for the audience row message action. */
const meta = {
  title:
    'Dashboard/Organisms/DashboardAudienceTable/Cells/AudienceActionCell States',
  component: AudienceActionCell,
  parameters: { layout: 'centered' },
  decorators: [
    function MetaDecorator(Story) {
      return (
        <AudienceTableStableProvider
          value={{
            toggleSelect: () => {},
            setOpenMenuRowId: () => {},
            getContextMenuItems: () => [],
            onExportMember: () => {},
            onBlockMember: () => {},
            onViewProfile: () => {},
            onSendNotification: () => {},
            getTouringCity: () => null,
            hiddenMetadataColumns: {
              location: false,
              source: false,
              engagement: false,
              lastSeen: false,
            },
          }}
        >
          <div className='w-32'>
            <Story />
          </div>
        </AudienceTableStableProvider>
      );
    },
  ],
  args: { member },
} satisfies Meta<typeof AudienceActionCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a very long fan name stays in the accessible label only. */
export const LongContentDisplayName: Story = {
  args: { member: { ...member, displayName: LONG_NAME } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: `Message ${LONG_NAME}` })
    ).toBeVisible();
  },
};

/** Right-to-left: the action stays end-aligned in an RTL document. */
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
    await expect(
      canvas.getByRole('button', { name: 'Message سارة المعجبة' })
    ).toBeVisible();
  },
};
