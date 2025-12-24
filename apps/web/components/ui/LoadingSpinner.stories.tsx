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

export const ReducedMotion: Story = {
  render: () => (
    <div className='space-y-6'>
      <div className='flex items-center justify-center gap-6'>
        <LoadingSpinner size='sm' />
        <LoadingSpinner size='md' />
        <LoadingSpinner size='lg' />
      </div>
      <div className='text-center'>
        <p className='text-sm text-gray-600 dark:text-gray-400'>
          With prefers-reduced-motion: Slower spin animation (1.2s instead of
          1s)
        </p>
      </div>
      <div className='p-4 bg-gray-100 dark:bg-gray-800 rounded-lg'>
        <p className='text-sm mb-2 font-medium'>How it works:</p>
        <ul className='text-sm text-gray-600 dark:text-gray-400 list-disc pl-5 space-y-1'>
          <li>Standard spin animation (1s) for most users</li>
          <li>
            Slower, less intense animation (1.2s) when prefers-reduced-motion is
            enabled
          </li>
          <li>
            Uses motion-reduce:animate-[spin_1.2s_linear_infinite] utility class
          </li>
          <li>Transitions are disabled via motion-reduce:transition-none</li>
          <li>
            Respects user accessibility preferences while maintaining feedback
          </li>
        </ul>
      </div>
    </div>
  ),
};
