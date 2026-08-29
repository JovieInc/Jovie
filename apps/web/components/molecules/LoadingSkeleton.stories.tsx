import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  ButtonSkeleton,
  CardSkeleton,
  LoadingSkeleton,
  ProfileSkeleton,
  SocialBarSkeleton,
  TableSkeleton,
} from './LoadingSkeleton';

const meta: Meta<typeof LoadingSkeleton> = {
  title: 'UI/LoadingSkeleton',
  component: LoadingSkeleton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    lines: {
      control: { type: 'number' },
    },
    height: {
      control: { type: 'text' },
    },
    width: {
      control: { type: 'text' },
    },
    rounded: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'full'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const MultiLine: Story = {
  args: {
    lines: 3,
  },
};

export const CustomSize: Story = {
  args: {
    height: 'h-8',
    width: 'w-64',
    rounded: 'md',
  },
};

export const CircleSkeleton: Story = {
  args: {
    height: 'h-12',
    width: 'w-12',
    rounded: 'full',
  },
};

export const Profile: Story = {
  render: () => <ProfileSkeleton />,
};

export const Button: Story = {
  render: () => <ButtonSkeleton />,
};

export const ButtonGeometryComparison: Story = {
  render: () => (
    <div className='w-100 space-y-4'>
      <div data-testid='button-skeleton-geometry'>
        <ButtonSkeleton />
      </div>
      <button
        className='block h-12 w-full max-w-sm rounded-lg bg-surface-1'
        data-testid='loaded-button-geometry'
        type='button'
      >
        Loaded action
      </button>
    </div>
  ),
};

export const SocialBar: Story = {
  render: () => <SocialBarSkeleton />,
};

export const Card: Story = {
  render: () => <CardSkeleton />,
};

export const Table: Story = {
  render: () => <TableSkeleton rows={3} columns={4} />,
};

export const ReducedMotion: Story = {
  render: () => (
    <div className='space-y-6'>
      <div className='text-center'>
        <LoadingSkeleton
          height='h-8'
          width='w-64'
          rounded='md'
          label='Loading reduced-motion preview'
        />
        <p className='mt-2 text-sm text-secondary-token'>
          With prefers-reduced-motion, the canonical base fill remains visible
          and shimmer animation is suppressed.
        </p>
      </div>
      <div className='rounded-lg bg-surface-0 p-4'>
        <p className='mb-2 text-sm font-medium text-primary-token'>
          How it works:
        </p>
        <ul className='list-disc space-y-1 pl-5 text-sm text-secondary-token'>
          <li>Animated shimmer effect for most users</li>
          <li>
            Canonical base fill when prefers-reduced-motion is enabled (no
            animation)
          </li>
          <li>Uses motion-reduce animation and background-image fallbacks</li>
          <li>
            Skeleton remains visible as a static placeholder while loading
          </li>
          <li>Respects user accessibility preferences</li>
        </ul>
      </div>
    </div>
  ),
};

export const LoadingStates: Story = {
  render: () => (
    <div className='space-y-8 max-w-md'>
      <div>
        <h3 className='text-lg font-medium mb-2'>Profile Loading</h3>
        <ProfileSkeleton />
      </div>

      <div>
        <h3 className='text-lg font-medium mb-2'>Card Loading</h3>
        <CardSkeleton />
      </div>

      <div>
        <h3 className='text-lg font-medium mb-2'>Form Loading</h3>
        <div className='space-y-4'>
          <LoadingSkeleton height='h-10' rounded='md' />
          <LoadingSkeleton height='h-10' rounded='md' />
          <LoadingSkeleton height='h-24' rounded='md' />
          <ButtonSkeleton />
        </div>
      </div>
    </div>
  ),
};
