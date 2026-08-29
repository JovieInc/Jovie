import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { LoadingSkeleton, Skeleton } from './skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'UI/Atoms/Skeleton',
  component: Skeleton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Loading shimmer uses .skeleton on --color-skeleton-base / --color-skeleton-shimmer. LoadingSkeleton is the single status owner. See packages/ui/docs/loading-states.md.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    className: 'h-4 w-48',
  },
};

export const LoadingShimmer: Story = {
  args: {
    className: 'h-10 w-64',
    shimmer: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Canonical loading-shimmer state with animated gradient.',
      },
    },
  },
};

export const StaticPlaceholder: Story = {
  args: {
    className: 'h-10 w-64',
    shimmer: false,
  },
};

export const ReducedMotion: Story = {
  args: {
    className: 'h-10 w-64',
    shimmer: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Reduced motion keeps the reserved box and loading meaning; only the shimmer animation is removed.',
      },
    },
  },
};

export const MultiLine: Story = {
  render: () => (
    <LoadingSkeleton
      lines={3}
      height='h-4'
      width='w-64'
      label='Loading profile details'
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'LoadingSkeleton is the single role=status / aria-busy / aria-live owner. Decorative lines stay aria-hidden.',
      },
    },
  },
};

export const LoadingToContent: Story = {
  render: () => (
    <div className='grid w-72 grid-cols-2 gap-6'>
      <div className='grid gap-2'>
        <span className='text-2xs text-tertiary-token'>Loading</span>
        <div className='h-4 w-48'>
          <LoadingSkeleton height='h-4' width='w-48' label='Loading title' />
        </div>
      </div>
      <div className='grid gap-2'>
        <span className='text-2xs text-tertiary-token'>Loaded</span>
        <p className='h-4 w-48 truncate text-sm text-primary-token'>
          Loaded title
        </p>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Declared h-4 w-48 geometry is reserved in both the loading and loaded slots.',
      },
    },
  },
};

export const IdentityRow: Story = {
  render: () => (
    <div className='flex w-72 items-center gap-3'>
      <Skeleton className='size-10 shrink-0' rounded='full' />
      <div className='min-w-0 flex-1'>
        <LoadingSkeleton lines={2} height='h-3' label='Loading identity' />
      </div>
    </div>
  ),
};
