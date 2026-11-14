import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { OutreachKpis } from './OutreachKpis';

/** State coverage for the outreach KPI row: very large counts and RTL. */
const meta = {
  title: 'Features/Admin/Outreach/OutreachKpis States',
  component: OutreachKpis,
  parameters: { layout: 'padded' },
  args: { counts: { email: 24, dm: 9, manualReview: 3, total: 36 } },
} satisfies Meta<typeof OutreachKpis>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: seven-digit counts stay inside their cards. */
export const LongContentCounts: Story = {
  args: {
    counts: {
      email: 1_204_388,
      dm: 987_654,
      manualReview: 345_678,
      total: 2_537_720,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('2537720 total')).toBeVisible();
    await expect(canvas.getByText('1204388')).toBeVisible();
  },
};

function RtlDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/** Right-to-left: the header and metric cards inside an RTL document. */
export const RtlCounts: Story = {
  decorators: [RtlDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('36 total')).toBeVisible();
    await expect(canvas.getByText('Manual Review')).toBeVisible();
  },
};
