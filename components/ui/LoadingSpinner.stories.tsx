import type { Meta, StoryObj } from '@storybook/react';
import { LoadingSpinner } from './LoadingSpinner';

const meta: Meta<typeof LoadingSpinner> = {
  title: 'UI/LoadingSpinner',
  component: LoadingSpinner,
  args: {
    size: 'md',
  },
};

export default meta;

type Story = StoryObj<typeof LoadingSpinner>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div className='flex items-center gap-6'>
      <LoadingSpinner size='sm' />
      <LoadingSpinner size='md' />
      <LoadingSpinner size='lg' />
    </div>
  ),
};

export const Tones: Story = {
  render: () => (
    <div className='flex items-center gap-6 bg-black p-6'>
      <LoadingSpinner tone='inverse' />
      <LoadingSpinner tone='muted' />
      <LoadingSpinner />
    </div>
  ),
};
