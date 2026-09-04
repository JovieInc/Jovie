import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { LoadingSkeleton, Skeleton } from './skeleton';

const ROUNDED_VARIANTS = ['none', 'sm', 'md', 'lg', 'full'] as const;

const meta: Meta<typeof Skeleton> = {
  title: 'UI/Atoms/Skeleton',
  component: Skeleton,
  parameters: {
    layout: 'centered',
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
};

export const StaticPlaceholder: Story = {
  args: {
    className: 'h-10 w-64',
    shimmer: false,
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
        story: 'LoadingSkeleton wrapper exposes aria-busy for assistive tech.',
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

export const CertificationMatrix: Story = {
  render: () => (
    <div
      className='grid w-72 gap-4'
      data-testid='skeleton-certification-matrix'
    >
      {ROUNDED_VARIANTS.map(rounded => (
        <div className='grid gap-2' key={rounded}>
          <span className='text-xs text-secondary-token'>{rounded}</span>
          <Skeleton className='h-6 w-full' rounded={rounded} shimmer />
          <Skeleton className='h-6 w-full' rounded={rounded} shimmer={false} />
        </div>
      ))}
    </div>
  ),
};

export const LoadingCertificationMatrix: Story = {
  render: () => (
    <div
      className='grid w-80 grid-cols-5 gap-3'
      data-testid='loading-skeleton-certification-matrix'
    >
      {ROUNDED_VARIANTS.map(rounded => (
        <LoadingSkeleton
          height='h-5'
          key={`announced-${rounded}`}
          label={`Loading ${rounded} certification content`}
          lines={3}
          rounded={rounded}
          width='w-full'
        />
      ))}
      {ROUNDED_VARIANTS.map(rounded => (
        <LoadingSkeleton
          announce={false}
          height='h-8'
          key={`silent-${rounded}`}
          lines={1}
          rounded={rounded}
          width='w-full'
        />
      ))}
    </div>
  ),
};
