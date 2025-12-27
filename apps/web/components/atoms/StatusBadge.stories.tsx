import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatusBadge } from './StatusBadge';

// Sample icons
const CheckIcon = (
  <svg
    className='w-4 h-4'
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    aria-hidden='true'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M5 13l4 4L19 7'
    />
  </svg>
);

const LightningIcon = (
  <svg
    className='w-4 h-4'
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    aria-hidden='true'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M13 10V3L4 14h7v7l9-11h-7z'
    />
  </svg>
);

const meta: Meta<typeof StatusBadge> = {
  title: 'Atoms/StatusBadge',
  component: StatusBadge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['blue', 'green', 'purple', 'orange', 'red', 'gray'],
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'The Solution',
    variant: 'green',
    icon: CheckIcon,
  },
};

export const Blue: Story = {
  args: {
    children: 'How It Works',
    variant: 'blue',
    icon: LightningIcon,
  },
};

export const Purple: Story = {
  args: {
    children: 'Features',
    variant: 'purple',
    icon: CheckIcon,
  },
};

export const Orange: Story = {
  args: {
    children: 'Warning',
    variant: 'orange',
  },
};

export const Red: Story = {
  args: {
    children: 'Error',
    variant: 'red',
  },
};

export const Gray: Story = {
  args: {
    children: 'Neutral',
    variant: 'gray',
  },
};

export const WithoutIcon: Story = {
  args: {
    children: 'No Icon Badge',
    variant: 'blue',
  },
};

export const Small: Story = {
  args: {
    children: 'Small Badge',
    variant: 'green',
    icon: CheckIcon,
    size: 'sm',
  },
};

export const Large: Story = {
  args: {
    children: 'Large Badge',
    variant: 'purple',
    icon: LightningIcon,
    size: 'lg',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className='flex flex-wrap gap-4'>
      <StatusBadge variant='blue' icon={LightningIcon}>
        Blue Badge
      </StatusBadge>
      <StatusBadge variant='green' icon={CheckIcon}>
        Green Badge
      </StatusBadge>
      <StatusBadge variant='purple' icon={LightningIcon}>
        Purple Badge
      </StatusBadge>
      <StatusBadge variant='orange'>Orange Badge</StatusBadge>
      <StatusBadge variant='red'>Red Badge</StatusBadge>
      <StatusBadge variant='gray'>Gray Badge</StatusBadge>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      <StatusBadge variant='blue' icon={CheckIcon} size='sm'>
        Small
      </StatusBadge>
      <StatusBadge variant='green' icon={CheckIcon} size='md'>
        Medium
      </StatusBadge>
      <StatusBadge variant='purple' icon={CheckIcon} size='lg'>
        Large
      </StatusBadge>
    </div>
  ),
};

export const InContext: Story = {
  render: () => (
    <div className='max-w-2xl p-6 bg-gray-50 dark:bg-gray-900 rounded-lg'>
      <div className='mb-6 text-center'>
        <StatusBadge variant='green' icon={CheckIcon}>
          The Solution
        </StatusBadge>
      </div>
      <h2 className='text-3xl font-bold text-center mb-4'>
        Built for musicians, optimized for conversion
      </h2>
      <p className='text-gray-600 dark:text-gray-300 text-center'>
        Every element is designed to turn fans into streams. No distractions,
        just results.
      </p>
    </div>
  ),
};
