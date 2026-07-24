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
          'Loading shimmer uses .skeleton on JovieColor.surface1 (--color-skeleton-base). See packages/ui/docs/loading-states.md.',
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

export const MultiLine: Story = {
  render: () => <LoadingSkeleton lines={3} height='h-4' width='w-64' />,
  parameters: {
    docs: {
      description: {
        story: 'LoadingSkeleton wrapper exposes aria-busy for assistive tech.',
      },
    },
  },
};
