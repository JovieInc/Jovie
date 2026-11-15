import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { WaitlistGateFunnel } from './WaitlistGateFunnel';

/** State coverage for the waitlist gate funnel; Default and Empty live in WaitlistGateFunnel.stories.tsx. */
const meta = {
  title: 'Features/Admin/WaitlistGateFunnel States',
  component: WaitlistGateFunnel,
  parameters: { layout: 'fullscreen' },
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

/** Long content: very large counts and a multi-day median in every card. */
export const LongContentLargeCounts: Story = {
  args: {
    funnel: {
      byRole: [
        { role: 'artist', count: 1_234_567 },
        { role: 'manager', count: 456_789 },
        { role: 'label', count: 98_765 },
        { role: 'producer_songwriter', count: 345_678 },
        { role: 'other', count: 12_345 },
      ],
      invite: {
        sent: 987_654,
        opened: 876_543,
        accountCreated: 765_432,
        goldenPathEntered: 654_321,
        goldenPathCompleted: 543_210,
      },
      p50HoursSentToGoldenPath: 1_234,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText((1_234_567).toLocaleString())).toBeVisible();
    await expect(canvas.getByText('51.4d')).toBeVisible();
  },
};

/** Right-to-left: the funnel inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Invites Sent')).toBeVisible();
  },
};
