import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Pin, Share2, Star } from 'lucide-react';
import { fn } from 'storybook/test';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerCardActionBar } from './DrawerCardActionBar';

const primaryActions: DrawerHeaderAction[] = [
  { id: 'pin', label: 'Pin', icon: Pin, onClick: fn() },
  { id: 'share', label: 'Share', icon: Share2, onClick: fn() },
];

const overflowActions: DrawerHeaderAction[] = [
  { id: 'favorite', label: 'Favorite', icon: Star, onClick: fn() },
];

const meta = {
  title: 'Molecules/Drawer/DrawerCardActionBar',
  component: DrawerCardActionBar,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='relative w-80 bg-surface-0'>
        <Story />
      </div>
    ),
  ],
  args: {
    primaryActions,
    overflowActions,
    onClose: fn(),
  },
} satisfies Meta<typeof DrawerCardActionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CardTopRight: Story = {
  args: {
    overflowTriggerPlacement: 'card-top-right',
  },
};

export const NoOverflow: Story = {
  args: {
    overflowActions: [],
    onClose: undefined,
  },
};

export const Empty: Story = {
  args: {
    primaryActions: [],
    overflowActions: [],
    onClose: undefined,
  },
};
