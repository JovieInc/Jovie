import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SkeletonCard } from './SkeletonCard';

const meta: Meta<typeof SkeletonCard> = {
  title: 'Molecules/SkeletonCard',
  component: SkeletonCard,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    showIcon: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof SkeletonCard>;

export const Default: Story = {
  args: {
    className: 'w-64',
    showIcon: true,
  },
};

export const WithoutIcon: Story = {
  args: {
    className: 'w-64',
    showIcon: false,
  },
};

export const Wide: Story = {
  args: {
    className: 'w-96',
    showIcon: true,
  },
};

export const Grid: Story = {
  render: () => (
    <div className='grid grid-cols-2 gap-4 w-[550px]'>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard showIcon={false} />
      <SkeletonCard showIcon={false} />
    </div>
  ),
};

export const LoadingDashboard: Story = {
  render: () => (
    <div className='space-y-4 w-80'>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  ),
};
