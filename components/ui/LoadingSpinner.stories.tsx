import type { Meta, StoryObj } from '@storybook/react';
import { LoadingSpinner } from './LoadingSpinner';

const meta: Meta<typeof LoadingSpinner> = {
  title: 'UI/LoadingSpinner',
  component: LoadingSpinner,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
    },
    variant: {
      control: { type: 'select' },
      options: ['light', 'dark', 'auto'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const Medium: Story = {
  args: {
    size: 'md',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
  },
};

export const SVGSpinner: Story = {
  args: {
    size: 'lg',
  },
  render: args => (
    <div className='text-center space-y-4'>
      <LoadingSpinner {...args} />
      <p className='text-sm text-gray-600 dark:text-gray-400'>
        SVG-based spinner with reduced motion support
      </p>
    </div>
  ),
};

export const DarkAndLightVariants: Story = {
  render: () => (
    <div className='flex flex-col gap-8'>
      <div className='flex items-center gap-8'>
        <div className='text-center'>
          <div className='p-4 bg-white rounded-lg shadow'>
            <LoadingSpinner size='md' variant='dark' />
          </div>
          <p className='text-xs mt-2'>Dark Variant (Indigo)</p>
          <p className='text-xs text-gray-500'>For light backgrounds</p>
        </div>

        <div className='text-center'>
          <div className='p-4 bg-gray-900 rounded-lg shadow'>
            <LoadingSpinner size='md' variant='light' />
          </div>
          <p className='text-xs mt-2'>Light Variant (White)</p>
          <p className='text-xs text-gray-500'>For dark backgrounds</p>
        </div>
      </div>

      <div className='flex items-center gap-8'>
        <div className='text-center'>
          <button className='inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-800 rounded-lg shadow-sm'>
            <LoadingSpinner size='sm' variant='dark' />
            <span>Loading...</span>
          </button>
          <p className='text-xs mt-2'>In Light Button</p>
        </div>

        <div className='text-center'>
          <button className='inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg shadow-sm'>
            <LoadingSpinner size='sm' variant='light' />
            <span>Loading...</span>
          </button>
          <p className='text-xs mt-2'>In Dark Button</p>
        </div>
      </div>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      <div className='text-center'>
        <LoadingSpinner size='sm' />
        <p className='text-xs mt-1'>SM</p>
      </div>
      <div className='text-center'>
        <LoadingSpinner size='md' />
        <p className='text-xs mt-1'>MD</p>
      </div>
      <div className='text-center'>
        <LoadingSpinner size='lg' />
        <p className='text-xs mt-1'>LG</p>
      </div>
    </div>
  ),
};

export const InButton: Story = {
  render: () => (
    <button className='inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg'>
      <LoadingSpinner size='sm' variant='light' />
      <span>Loading...</span>
    </button>
  ),
};

export const InListenButton: Story = {
  render: () => (
    <button className='inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold'>
      <LoadingSpinner size='sm' variant='light' />
      <span>Opening...</span>
    </button>
  ),
};

export const InCard: Story = {
  render: () => (
    <div className='bg-white dark:bg-gray-900 rounded-lg p-6 shadow-lg text-center'>
      <LoadingSpinner size='lg' className='mb-4' />
      <h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-2'>
        Loading Artist Profile
      </h3>
      <p className='text-gray-600 dark:text-gray-400'>
        Please wait while we fetch the latest information...
      </p>
    </div>
  ),
};

export const ReducedMotion: Story = {
  render: () => (
    <div className='space-y-6'>
      <div className='text-center'>
        <LoadingSpinner size='lg' />
        <p className='text-sm mt-2 text-gray-600 dark:text-gray-400'>
          With prefers-reduced-motion: Slower animation
        </p>
      </div>
      <div className='p-4 bg-gray-100 dark:bg-gray-800 rounded-lg'>
        <p className='text-sm mb-2 font-medium'>How it works:</p>
        <ul className='text-sm text-gray-600 dark:text-gray-400 list-disc pl-5 space-y-1'>
          <li>Standard animation for most users</li>
          <li>
            Slower, less intense animation when prefers-reduced-motion is
            enabled
          </li>
          <li>
            Uses motion-reduce:animate-[spin_1.5s_linear_infinite] utility class
          </li>
          <li>Respects user accessibility preferences</li>
        </ul>
      </div>
    </div>
  ),
};
