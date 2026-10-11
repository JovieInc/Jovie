import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AudienceMember } from '@/types';
import { AudienceTableStableProvider } from '../AudienceTableContext';
import { AudienceActionCell } from './AudienceActionCell';

const identifiedMember: AudienceMember = {
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
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: 'mobile',
  lastSeenAt: '2026-09-25T00:00:00.000Z',
};

const anonymousMember: AudienceMember = {
  ...identifiedMember,
  displayName: null,
  email: null,
};

const meta = {
  title: 'Dashboard/Organisms/DashboardAudienceTable/Cells/AudienceActionCell',
  component: AudienceActionCell,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
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
        <Story />
      </AudienceTableStableProvider>
    ),
  ],
  args: {
    member: identifiedMember,
  },
} satisfies Meta<typeof AudienceActionCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Messageable: Story = {};

export const AnonymousFan: Story = {
  args: {
    member: anonymousMember,
  },
};
