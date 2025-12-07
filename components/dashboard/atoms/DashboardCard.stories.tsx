import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardCard } from './DashboardCard';

const meta: Meta<typeof DashboardCard> = {
  title: 'Dashboard/Atoms/DashboardCard',
  component: DashboardCard,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'default',
        'interactive',
        'settings',
        'analytics',
        'empty-state',
      ],
    },
    padding: {
      control: 'select',
      options: ['default', 'large', 'compact'],
    },
    hover: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof DashboardCard>;

export const Default: Story = {
  args: {
    variant: 'default',
    padding: 'default',
    children: (
      <div>
        <h3 className='font-semibold mb-2'>Card Title</h3>
        <p className='text-secondary text-sm'>
          This is a default dashboard card.
        </p>
      </div>
    ),
    className: 'w-80',
  },
};

export const Interactive: Story = {
  args: {
    variant: 'interactive',
    padding: 'default',
    onClick: () => console.log('Card clicked'),
    children: (
      <div>
        <h3 className='font-semibold mb-2'>Interactive Card</h3>
        <p className='text-secondary text-sm'>Click me to trigger an action.</p>
      </div>
    ),
    className: 'w-80',
  },
};

export const Settings: Story = {
  args: {
    variant: 'settings',
    padding: 'default',
    children: (
      <div>
        <h3 className='font-semibold mb-2'>Settings Card</h3>
        <p className='text-secondary text-sm'>
          Configure your preferences here.
        </p>
      </div>
    ),
    className: 'w-80',
  },
};

export const Analytics: Story = {
  args: {
    variant: 'analytics',
    padding: 'large',
    children: (
      <div>
        <p className='text-sm text-secondary mb-1'>Total Views</p>
        <p className='text-3xl font-bold'>12,345</p>
        <p className='text-sm text-green-600 mt-1'>+12% from last week</p>
      </div>
    ),
    className: 'w-64',
  },
};

export const EmptyState: Story = {
  args: {
    variant: 'empty-state',
    padding: 'large',
    children: (
      <div className='text-center'>
        <p className='text-lg mb-2'>No data yet</p>
        <p className='text-secondary text-sm'>
          Start by adding your first link.
        </p>
      </div>
    ),
    className: 'w-80',
  },
};

export const CompactPadding: Story = {
  args: {
    variant: 'default',
    padding: 'compact',
    children: (
      <div className='flex items-center justify-between'>
        <span className='font-medium'>Quick Action</span>
        <span className='text-secondary'>→</span>
      </div>
    ),
    className: 'w-80',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className='grid grid-cols-2 gap-4 w-[600px]'>
      <DashboardCard variant='default'>
        <p className='font-medium'>Default</p>
      </DashboardCard>
      <DashboardCard variant='interactive' onClick={() => {}}>
        <p className='font-medium'>Interactive</p>
      </DashboardCard>
      <DashboardCard variant='settings'>
        <p className='font-medium'>Settings</p>
      </DashboardCard>
      <DashboardCard variant='analytics'>
        <p className='font-medium'>Analytics</p>
      </DashboardCard>
    </div>
  ),
};
