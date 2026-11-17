import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { WaitlistMetrics } from './WaitlistMetrics';

/** State coverage for the waitlist status counts; the default lives in WaitlistMetrics.stories.tsx. */
const meta = {
  title: 'Features/Admin/WaitlistMetrics States',
  component: WaitlistMetrics,
  parameters: { layout: 'fullscreen' },
  args: {
    metrics: {
      total: 1842,
      waitlisted: 1842,
      invited: 620,
      signedUp: 411,
      emailFailures: 7,
    },
  },
} satisfies Meta<typeof WaitlistMetrics>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: very large counts in every status card. */
export const LongContentLargeCounts: Story = {
  args: {
    metrics: {
      total: 12_345_678,
      waitlisted: 9_876_543,
      invited: 1_234_567,
      signedUp: 987_654,
      emailFailures: 123_456,
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText((9_876_543).toLocaleString())
    ).toBeVisible();
  },
};

/** Right-to-left: the counts inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Waitlisted')).toBeVisible();
  },
};
