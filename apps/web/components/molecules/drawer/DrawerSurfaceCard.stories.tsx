import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerSurfaceCard } from './DrawerSurfaceCard';

const meta = {
  title: 'Molecules/Drawer/DrawerSurfaceCard',
  component: DrawerSurfaceCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-surface-0 p-3 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    children: 'Drawer surface',
    className: 'p-3',
  },
} satisfies Meta<typeof DrawerSurfaceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Flat: Story = {};

export const Card: Story = {
  args: {
    variant: 'card',
  },
};

export const NestedComposition: Story = {
  render: () => (
    <DrawerSurfaceCard variant='card' className='space-y-2 p-3'>
      <p className='text-sm font-medium'>Drawer group</p>
      <DrawerSurfaceCard className='p-2 text-sm text-secondary-token'>
        Flat child region
      </DrawerSurfaceCard>
    </DrawerSurfaceCard>
  ),
};

export const BusySemanticSection: Story = {
  args: {
    as: 'section',
    variant: 'card',
    'aria-busy': true,
    'data-right-rail-section': 'analytics',
    children: 'Loading analytics…',
  },
};
