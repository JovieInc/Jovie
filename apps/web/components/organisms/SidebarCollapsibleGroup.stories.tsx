import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Star } from 'lucide-react';
import { expect, userEvent, within } from 'storybook/test';
import { SidebarCollapsibleGroup } from './SidebarCollapsibleGroup';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from './sidebar';
import { SidebarProvider } from './sidebar/context';

const meta = {
  title: 'Organisms/SidebarCollapsibleGroup',
  component: SidebarCollapsibleGroup,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <SidebarProvider>
        <div className='w-64 bg-surface-0 p-2'>
          <Story />
        </div>
      </SidebarProvider>
    ),
  ],
  args: {
    label: 'Playlists',
    children: (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton>Discover Weekly</SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton>Release Radar</SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    ),
  },
} satisfies Meta<typeof SidebarCollapsibleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'Playlists',
    });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  },
};

export const StartsClosed: Story = {
  args: {
    defaultOpen: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Playlists' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  },
};

export const WithIcon: Story = {
  args: {
    icon: Star,
  },
};
