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
