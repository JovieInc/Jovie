import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Music } from 'lucide-react';
import { ContentMetricRow } from './ContentMetricRow';

/** Rendered states of the metric row, beside ContentMetricRow.stories.tsx. */
const meta = {
  title: 'Molecules/ContentMetricRow States',
  component: ContentMetricRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72 bg-surface-1 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Saves',
    value: '3,204',
  },
} satisfies Meta<typeof ContentMetricRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no saves yet, so the value reads zero. */
export const EmptyZeroValue: Story = {
  args: {
    icon: Music,
    value: 0,
  },
};

/** Partial: a label and value with no icon. */
export const PartialNoIcon: Story = {
  args: {
    label: 'Playlist adds',
    value: '412',
  },
};

/** Right-to-left: an Arabic label with its icon on a right-to-left page. */
export const RtlArabicRow: Story = {
  args: {
    icon: Music,
    label: 'الحفظ',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-72 bg-surface-1 p-3'>
        <Story />
      </div>
    ),
  ],
};
