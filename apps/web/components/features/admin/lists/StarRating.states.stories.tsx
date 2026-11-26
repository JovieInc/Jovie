import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StarRating } from './StarRating';

const meta = {
  title: 'Features/Admin/Lists/StarRating/States',
  component: StarRating,
  parameters: { layout: 'centered' },
  args: { label: 'Rating', onChange: () => undefined },
} satisfies Meta<typeof StarRating>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no rating chosen yet. */
export const EmptyUnrated: Story = { args: { value: null } };

/** Long content: a long accessible label for the group. */
export const LongContentLabel: Story = {
  args: {
    value: 3,
    label:
      'Rating for the spring outreach list of independent electronic artists',
  },
};

/** Right-to-left: stars in an RTL row. */
export const RtlRow: Story = {
  args: { value: 4, label: 'التقييم' },
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
