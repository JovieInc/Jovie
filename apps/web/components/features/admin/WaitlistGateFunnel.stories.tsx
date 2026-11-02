import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WaitlistGateFunnel } from './WaitlistGateFunnel';

const meta = {
  title: 'Features/Admin/WaitlistGateFunnel',
  component: WaitlistGateFunnel,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    funnel: {
      byRole: [
        { role: 'artist', count: 214 },
        { role: 'manager', count: 38 },
        { role: 'label', count: 9 },
        { role: 'producer_songwriter', count: 51 },
        { role: 'other', count: 17 },
      ],
      invite: {
        sent: 40,
        opened: 31,
        accountCreated: 24,
        goldenPathEntered: 22,
        goldenPathCompleted: 15,
      },
      p50HoursSentToGoldenPath: 19.5,
    },
  },
} satisfies Meta<typeof WaitlistGateFunnel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    funnel: {
      byRole: [],
      invite: {
        sent: 0,
        opened: 0,
        accountCreated: 0,
        goldenPathEntered: 0,
        goldenPathCompleted: 0,
      },
      p50HoursSentToGoldenPath: null,
    },
  },
};
