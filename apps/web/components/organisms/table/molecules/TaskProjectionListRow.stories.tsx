import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TaskProjectionListRow } from './TaskProjectionListRow';

const meta = {
  title: 'Organisms/Table/TaskProjectionListRow',
  component: TaskProjectionListRow,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TaskProjectionListRow>;
export default meta;
type Story = StoryObj<typeof TaskProjectionListRow>;

export const Default: Story = {
  args: {
    testId: 'task-projection-row-story',
    leading: (
      <span
        className='text-app text-secondary-token'
        aria-hidden='true'
      >
        ◷
      </span>
    ),
    title: 'Cache Symphony workspaces on NVMe',
    metadata: (
      <div className='flex min-w-0 flex-wrap items-center gap-x-1.5 text-3xs text-tertiary-token'>
        <span className='font-medium text-accent-blue'>Running</span>
        <span className='font-semibold'>JOV-5544</span>
        <span>Attempt 2</span>
      </div>
    ),
    actionSlot: (
      <span className='text-3xs text-secondary-token'>
        queued → running
      </span>
    ),
  },
};

export const Selected: Story = {
  args: {
    ...Default.args,
    isSelected: true,
    actionSlot: (
      <span className='text-3xs text-secondary-token'>
        merge-queued → merged
      </span>
    ),
  },
};

export const MutedOpacity: Story = {
  args: {
    ...Default.args,
    title: 'Rotate stale runner tokens',
    opacity: 'muted',
    metadata: (
      <div className='flex min-w-0 flex-wrap items-center gap-x-1.5 text-3xs text-tertiary-token'>
        <span className='font-medium text-accent-green'>Merged</span>
        <span className='font-semibold'>JOV-5547</span>
      </div>
    ),
  },
};
