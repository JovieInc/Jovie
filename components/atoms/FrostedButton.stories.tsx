import { DevicePhoneMobileIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FrostedButton } from './FrostedButton';

const meta: Meta<typeof FrostedButton> = {
  title: 'Atoms/FrostedButton',
  component: FrostedButton,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'gradient',
      values: [
        {
          name: 'gradient',
          value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        },
        { name: 'dark', value: '#1f2937' },
      ],
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'ghost', 'outline'],
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
    },
    shape: {
      control: { type: 'select' },
      options: ['default', 'circle', 'square'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <XMarkIcon className='h-5 w-5 text-gray-700 dark:text-gray-300' />
    ),
  },
};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: (
      <DevicePhoneMobileIcon className='h-5 w-5 text-gray-700 dark:text-gray-300' />
    ),
  },
};

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: (
      <XMarkIcon className='h-5 w-5 text-gray-700 dark:text-gray-300' />
    ),
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
    children: (
      <XMarkIcon className='h-4 w-4 text-gray-700 dark:text-gray-300' />
    ),
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
    children: (
      <DevicePhoneMobileIcon className='h-6 w-6 text-gray-700 dark:text-gray-300' />
    ),
  },
};

export const Circle: Story = {
  args: {
    shape: 'circle',
    children: (
      <XMarkIcon className='h-5 w-5 text-gray-700 dark:text-gray-300' />
    ),
  },
};

export const Square: Story = {
  args: {
    shape: 'square',
    children: (
      <XMarkIcon className='h-5 w-5 text-gray-700 dark:text-gray-300' />
    ),
  },
};

export const BackButton: Story = {
  args: {
    variant: 'default',
    shape: 'circle',
    'aria-label': 'Back to profile',
    children: (
      <svg
        className='w-5 h-5 text-gray-700 dark:text-gray-300'
        fill='none'
        stroke='currentColor'
        viewBox='0 0 24 24'
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={2}
          d='M10 19l-7-7m0 0l7-7m-7 7h18'
        />
      </svg>
    ),
  },
};

export const NotificationButton: Story = {
  args: {
    variant: 'default',
    shape: 'circle',
    'aria-label': 'Notifications',
    children: (
      <svg
        className='w-5 h-5 text-gray-700 dark:text-gray-300'
        fill='none'
        stroke='currentColor'
        viewBox='0 0 24 24'
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={2}
          d='M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9'
        />
      </svg>
    ),
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    children: (
      <XMarkIcon className='h-5 w-5 text-gray-700 dark:text-gray-300' />
    ),
  },
};
