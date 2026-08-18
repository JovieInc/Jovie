import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ReleaseTaskEmptyState } from './ReleaseTaskEmptyState';

const meta = {
  title: 'Dashboard/Release Tasks/ReleaseTaskEmptyState',
  component: ReleaseTaskEmptyState,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-2xl bg-surface-0 p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    onSetUp: fn(),
    isLoading: false,
  },
} satisfies Meta<typeof ReleaseTaskEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Generating: Story = {
  args: {
    isLoading: true,
  },
};
