import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AvatarProgressRing } from './AvatarProgressRing';

const meta = {
  title: 'Molecules/AvatarProgressRing',
  component: AvatarProgressRing,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='relative h-24 w-24 rounded-full bg-surface-1'>
        <Story />
      </div>
    ),
  ],
  args: {
    progress: 45,
    size: 96,
    status: 'uploading',
  },
} satisfies Meta<typeof AvatarProgressRing>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Uploading: Story = {};

export const Success: Story = {
  args: {
    progress: 100,
    status: 'success',
  },
};

export const ErrorState: Story = {
  args: {
    progress: 60,
    status: 'error',
  },
};

export const Idle: Story = {
  args: {
    progress: 0,
    status: 'idle',
  },
};
