import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AudienceMember } from '@/types';
import { AudienceAlertsCell } from './AudienceAlertsCell';

const baseMember: AudienceMember = {
  id: 'aud-1',
  type: 'sms',
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
  phone: '+15550100',
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: 'mobile',
  lastSeenAt: '2026-09-25T00:00:00.000Z',
  hasActiveAlerts: true,
  activeAlertChannels: ['sms', 'email'],
};

const meta = {
  title: 'Dashboard/Organisms/DashboardAudienceTable/Cells/AudienceAlertsCell',
  component: AudienceAlertsCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    member: baseMember,
  },
} satisfies Meta<typeof AudienceAlertsCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MultipleChannels: Story = {};

export const SingleChannel: Story = {
  args: {
    member: { ...baseMember, activeAlertChannels: ['push'] },
  },
};

export const NoAlerts: Story = {
  args: {
    member: { ...baseMember, hasActiveAlerts: false, activeAlertChannels: [] },
  },
};
