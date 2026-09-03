import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { House, SquarePen } from 'lucide-react';
import {
  getSidebarNavIconClassName,
  getSidebarNavRowClassName,
  SidebarNavItem,
} from './SidebarNavItem';

const meta: Meta<typeof SidebarNavItem> = {
  title: 'Shell/SidebarNavItem',
  component: SidebarNavItem,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-60 bg-sidebar p-3'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SidebarNavItem>;

export const Active: Story = {
  args: {
    collapsed: false,
    item: { label: 'Inbox', icon: House, active: true },
  },
};

export const ActiveCollapsed: Story = {
  args: {
    collapsed: true,
    item: { label: 'Inbox', icon: House, active: true },
  },
};

export const EnabledPrimaryCreate: Story = {
  render: () => (
    <Button
      type='button'
      variant='ghost'
      className={getSidebarNavRowClassName({ tone: 'primary' })}
    >
      <SquarePen
        className={getSidebarNavIconClassName({ tone: 'primary' })}
        strokeWidth={2}
      />
      <span>New Chat</span>
    </Button>
  ),
};
