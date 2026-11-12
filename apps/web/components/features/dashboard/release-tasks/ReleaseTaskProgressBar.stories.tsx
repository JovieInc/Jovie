import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseTaskProgressBar } from './ReleaseTaskProgressBar';

const meta = {
  title: 'Dashboard/ReleaseTasks/ReleaseTaskProgressBar',
  component: ReleaseTaskProgressBar,
  parameters: {
    layout: 'centered',
  },
  render: args => (
    <div className='w-72'>
      <ReleaseTaskProgressBar {...args} />
    </div>
  ),
  args: {
    done: 3,
    total: 8,
  },
} satisfies Meta<typeof ReleaseTaskProgressBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {};

export const WithOverdue: Story = {
  args: {
    done: 2,
    total: 8,
    overdueCount: 3,
  },
};

export const Complete: Story = {
  args: {
    done: 8,
    total: 8,
  },
};

/** Tasks exist but none are done yet: the bar is empty, the count reads 0. */
export const PartialNoneDone: Story = {
  args: {
    done: 0,
    total: 8,
  },
};

/** Large campaign counts with an overdue tally stay on one line. */
export const LongContentLargeCounts: Story = {
  args: {
    done: 1_234,
    total: 5_678,
    overdueCount: 987,
  },
  render: args => (
    <div className='w-48'>
      <ReleaseTaskProgressBar {...args} />
    </div>
  ),
};

export const RtlProgress: Story = {
  args: {
    done: 2,
    total: 8,
    overdueCount: 1,
  },
  render: args => (
    <div dir='rtl' lang='ar' className='w-72'>
      <ReleaseTaskProgressBar {...args} />
    </div>
  ),
};
