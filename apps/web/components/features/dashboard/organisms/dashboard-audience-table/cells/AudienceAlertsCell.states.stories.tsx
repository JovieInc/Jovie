import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AudienceMember } from '@/types';
import { AudienceAlertsCell } from './AudienceAlertsCell';

/**
 * Certification states for the audience alerts cell. The defaults live in
 * AudienceAlertsCell.stories.tsx.
 */

const member = {
  id: 'aud-states',
  type: 'sms',
  displayName: 'Sasha Fan',
  hasActiveAlerts: true,
  activeAlertChannels: ['sms', 'email', 'push'],
} as unknown as AudienceMember;

const meta = {
  title:
    'Dashboard/Organisms/DashboardAudienceTable/Cells/AudienceAlertsCell/States',
  component: AudienceAlertsCell,
  parameters: { layout: 'centered' },
  args: { member },
} satisfies Meta<typeof AudienceAlertsCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no confirmed alert subscriptions, so only screen-reader text. */
export const EmptyNoAlerts: Story = {
  args: {
    member: { ...member, hasActiveAlerts: false, activeAlertChannels: [] },
  },
};

/** Long content: every alert channel is active at once. */
export const LongContentAllChannels: Story = {};

const RtlCellDecorator: Decorator = function RtlCellDecorator(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

/** Right-to-left: the chips in a right-to-left table row. */
export const RtlAllChannels: Story = { decorators: [RtlCellDecorator] };
