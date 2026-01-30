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
        <LoadingSkeleton height='h-8' width='w-64' rounded='md' />
        <p className='text-sm mt-2 text-gray-600 dark:text-gray-400'>
          With prefers-reduced-motion: Static skeleton (no animation)
        </p>
      </div>
      <div className='p-4 bg-gray-100 dark:bg-gray-800 rounded-lg'>
        <p className='text-sm mb-2 font-medium'>How it works:</p>
        <ul className='text-sm text-gray-600 dark:text-gray-400 list-disc pl-5 space-y-1'>
          <li>Animated shimmer effect for most users</li>
          <li>
            Static background when prefers-reduced-motion is enabled (no
            animation)
          </li>
          <li>Uses motion-reduce:animate-none utility class</li>
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
