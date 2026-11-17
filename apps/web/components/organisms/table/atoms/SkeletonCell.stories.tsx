import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SkeletonCell } from './SkeletonCell';

const meta = {
  title: 'Organisms/Table/Atoms/SkeletonCell',
  component: SkeletonCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    variant: 'text',
  },
} satisfies Meta<typeof SkeletonCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Text: Story = {};

export const Avatar: Story = {
  args: {
    variant: 'avatar',
  },
};

export const Badge: Story = {
  args: {
    variant: 'badge',
  },
};

export const Button: Story = {
  args: {
    variant: 'button',
  },
};

export const Release: Story = {
  args: {
    variant: 'release',
    width: '240px',
  },
};

export const MetaVariant: Story = {
  args: {
    variant: 'meta',
    width: '120px',
  },
};

export const LoadingReleaseRow: Story = {
  render: () => (
    <div className='flex w-96 items-center gap-4'>
      <SkeletonCell variant='release' width='200px' />
      <SkeletonCell variant='badge' />
      <SkeletonCell variant='meta' width='96px' />
    </div>
  ),
};

export const RtlReleaseRow: Story = {
  render: () => (
    <div dir='rtl' lang='ar' className='flex w-96 flex-col gap-2'>
      <span className='text-xs text-secondary-token'>جاري تحميل الإصدارات</span>
      <div className='flex items-center gap-4'>
        <SkeletonCell variant='release' width='200px' />
        <SkeletonCell variant='badge' />
        <SkeletonCell variant='meta' width='96px' />
      </div>
    </div>
  ),
};
