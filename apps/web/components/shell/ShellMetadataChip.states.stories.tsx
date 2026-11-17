import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Calendar } from 'lucide-react';
import { ShellMetadataChip } from './ShellMetadataChip';

/** Rendered states of the shell metadata chip. */
const meta = {
  title: 'Shell/ShellMetadataChip/States',
  component: ShellMetadataChip,
  parameters: { layout: 'centered' },
  args: { children: 'Draft' },
} satisfies Meta<typeof ShellMetadataChip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the danger tone used for overdue or failed metadata. */
export const ErrorDangerTone: Story = {
  args: { tone: 'danger', children: 'Overdue' },
};

/** Partial: an icon with no status dot, as release date chips render. */
export const PartialIconWithoutDot: Story = {
  args: {
    tone: 'soon',
    icon: <Calendar aria-hidden='true' className='h-2.5 w-2.5' />,
    children: 'Drops Apr 27',
  },
};

/** Long content: a long label stays on one line inside a narrow row. */
export const LongContentLabel: Story = {
  args: {
    tone: 'warning',
    dotClassName: 'bg-warning/70',
    children: 'Waiting on distributor metadata review',
  },
};

/** RTL: the dot and label mirror inside a right-to-left row. */
export const RtlLabel: Story = {
  args: {
    tone: 'neutral',
    dotClassName: 'bg-primary-token/35',
    children: 'مسودة',
  },
  render: function RtlLabelRender(args) {
    return (
      <div dir='rtl'>
        <ShellMetadataChip {...args} />
      </div>
    );
  },
};
