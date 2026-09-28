import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WorkspaceLockScreen } from './WorkspaceLockScreen';

const meta = {
  title: 'Features/WorkspaceLock/WorkspaceLockScreen',
  component: WorkspaceLockScreen,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof WorkspaceLockScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Locked: Story = {
  render: () => (
    <div className='h-96 w-[32rem]'>
      <WorkspaceLockScreen />
    </div>
  ),
};
