import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OutreachKpis } from './OutreachKpis';

const meta = {
  title: 'Features/Admin/Outreach/OutreachKpis/States',
  component: OutreachKpis,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof OutreachKpis>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: five-digit counts in every tile. */
export const LongContentLargeCounts: Story = {
  args: {
    counts: { email: 12480, dm: 9031, manualReview: 1203, total: 22714 },
  },
};

/** Right-to-left: the embedded grid inside an RTL document. */
export const RtlEmbedded: Story = {
  args: {
    embedded: true,
    counts: { email: 24, dm: 9, manualReview: 3, total: 36 },
  },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
