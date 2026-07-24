import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';

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
    <div className='flex items-center gap-6 bg-base p-6'>
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
          With prefers-reduced-motion: Static progress ring (no rotation)
        </p>
      </div>
      <div className='p-4 bg-gray-100 dark:bg-gray-800 rounded-lg'>
        <p className='text-sm mb-2 font-medium'>How it works:</p>
        <ul className='text-sm text-gray-600 dark:text-gray-400 list-disc pl-5 space-y-1'>
          <li>Spin animation for users without a reduced-motion preference</li>
          <li>Static progress ring when prefers-reduced-motion is enabled</li>
          <li>Uses motion-reduce:animate-none to stop rotation</li>
          <li>
            Resets transform optimization with motion-reduce:will-change-auto
          </li>
          <li>Transitions are disabled via motion-reduce:transition-none</li>
          <li>
            The ring remains visible so the in-flight status is still clear
          </li>
        </ul>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        'With prefers-reduced-motion: Static progress ring (no rotation)'
      )
    ).toBeInTheDocument();
    await expect(
      canvas.queryByText(/slower spin animation/i)
    ).not.toBeInTheDocument();
  },
};
