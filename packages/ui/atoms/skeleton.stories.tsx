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
          'Loading shimmer uses the semantic skeleton base token (--color-skeleton-base). Reduced motion keeps the base fill and removes animation. See packages/ui/docs/loading-states.md.',
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
        story:
          'Canonical loading-shimmer state with an animated gradient when motion is allowed; reduced motion keeps the tokenized base fill.',
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

export const Partial: Story = {
  render: () => (
    <div className='flex w-72 items-center gap-3'>
      <Skeleton className='size-10 shrink-0' rounded='full' />
      <div className='min-w-0 flex-1 space-y-2'>
        <p className='truncate text-sm font-medium text-primary-token'>
          Tim White
        </p>
        <LoadingSkeleton
          height='h-3'
          width='w-32'
          label='Loading listener stats'
        />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Partially loaded row: the name has arrived while the avatar and stats keep their reserved placeholders.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <div className='w-64'>
      <LoadingSkeleton
        lines={8}
        height='h-3'
        label='Loading the full release description'
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A long text placeholder stacks eight full-width lines inside a narrow column, ending on a shorter last line.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl' lang='ar' className='w-64'>
      <LoadingSkeleton lines={3} height='h-4' label='جارٍ تحميل الملف الشخصي' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'In a right-to-left container the shorter last line aligns to the start (right) edge, and the Arabic label is announced.',
      },
    },
  },
};
