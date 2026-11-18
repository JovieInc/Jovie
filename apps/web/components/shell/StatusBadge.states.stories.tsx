import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatusBadge } from './StatusBadge';

/** Rendered states of the release status badge. */
const meta = {
  title: 'Shell/StatusBadge/States',
  component: StatusBadge,
  parameters: { layout: 'centered' },
  args: { status: 'scheduled' },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** RTL: the leading dot moves to the right edge in a right-to-left row. */
export const RtlScheduled: Story = {
  render: function RtlScheduledRender(args) {
    return (
      <div dir='rtl'>
        <StatusBadge {...args} />
      </div>
    );
  },
};
