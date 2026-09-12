import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { House, SquarePen } from 'lucide-react';
import { expect } from 'storybook/test';
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

export const EnabledPrimaryCreate: Story = {
  args: {
    collapsed: false,
    tone: 'primary',
    item: { label: 'New Chat', icon: SquarePen },
  },
  play: async ({ canvasElement }) => {
    const label = canvasElement.querySelector('button span');
    await expect(label).toBeInTheDocument();
    await expect(label).toHaveTextContent('New Chat');
    await expect(label?.className).not.toContain('mask-image:linear-gradient');
    await expect(label?.className).not.toContain(
      '-webkit-mask-image:linear-gradient'
    );
  },
};
