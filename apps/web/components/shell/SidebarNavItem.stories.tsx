import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { House, SquarePen } from 'lucide-react';
import { SidebarNavItem } from './SidebarNavItem';

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

// Elevated create treatment for the New Chat primary action (canonical
// composition used by the shell + dashboard rail consumers).
export const EnabledPrimaryCreate: Story = {
  render: () => (
    <SidebarNavItem
      collapsed={false}
      item={{ label: 'New Chat', icon: SquarePen }}
    />
  ),
};
