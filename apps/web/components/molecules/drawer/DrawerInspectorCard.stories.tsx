import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerInspectorCard } from './DrawerInspectorCard';
import { DrawerPropertyRow } from './DrawerPropertyRow';

const meta = {
  title: 'Molecules/Drawer/DrawerInspectorCard',
  component: DrawerInspectorCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-surface-0'>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Details',
    children: (
      <>
        <DrawerPropertyRow label='ISRC'>USRC17607839</DrawerPropertyRow>
        <DrawerPropertyRow label='UPC'>888880123456</DrawerPropertyRow>
      </>
    ),
  },
} satisfies Meta<typeof DrawerInspectorCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NotCollapsible: Story = {
  args: {
    collapsible: false,
  },
};

export const StartsCollapsed: Story = {
  args: {
    defaultOpen: false,
  },
};

export const WithActions: Story = {
  args: {
    actions: (
      <button
        type='button'
        className='text-2xs text-secondary-token hover:text-primary-token'
      >
        Edit
      </button>
    ),
  },
};
