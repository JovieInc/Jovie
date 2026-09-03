import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatusBadge } from './StatusBadge';

const PlaceholderIcon = () => (
  <svg
    aria-hidden='true'
    viewBox='0 0 16 16'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.5'
    className='h-3.5 w-3.5'
  >
    <circle cx='8' cy='8' r='6' />
  </svg>
);

const meta = {
  title: 'Atoms/StatusBadge',
  component: StatusBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: 'Active',
    variant: 'blue',
    size: 'md',
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      <StatusBadge size='sm'>Small</StatusBadge>
      <StatusBadge>Medium</StatusBadge>
      <StatusBadge size='lg'>Large</StatusBadge>
    </div>
  ),
};

export const Tones: Story = {
  render: () => (
    <div className='flex flex-wrap items-center gap-2'>
      <StatusBadge variant='blue'>Queued</StatusBadge>
      <StatusBadge variant='green'>Live</StatusBadge>
      <StatusBadge variant='purple'>Review</StatusBadge>
      <StatusBadge variant='orange'>Warning</StatusBadge>
      <StatusBadge variant='red'>Error</StatusBadge>
      <StatusBadge variant='gray'>Muted</StatusBadge>
    </div>
  ),
};

export const WithIcon: Story = {
  args: {
    children: 'Verified',
    icon: <PlaceholderIcon />,
    variant: 'green',
  },
};

export const DynamicStatus: Story = {
  args: {
    children: 'Syncing',
    dynamic: true,
    variant: 'orange',
  },
};
