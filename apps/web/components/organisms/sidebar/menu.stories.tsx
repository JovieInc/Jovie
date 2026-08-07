import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarProvider } from './context';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from './menu';

const meta = {
  title: 'Organisms/Sidebar/menu',
  component: SidebarMenuButton,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <SidebarProvider>
        <div className='w-56 p-4'>
          <SidebarMenu>
            <SidebarMenuItem>
              <Story />
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof SidebarMenuButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Overview',
  },
};

export const Active: Story = {
  args: {
    children: 'Library',
    isActive: true,
  },
};

export const Disabled: Story = {
  args: {
    children: 'Earnings',
    disabled: true,
  },
};
