import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerButton } from './DrawerButton';
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
        <DrawerPropertyRow label='ISRC' value='USRC17607839' />
        <DrawerPropertyRow label='UPC' value='888880123456' />
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
      <DrawerButton tone='ghost' size='sm'>
        Edit
      </DrawerButton>
    ),
  },
};
