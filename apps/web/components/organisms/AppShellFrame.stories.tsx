import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { chatNavItem } from '@/components/features/dashboard/dashboard-nav/config';
import { NavMenuItem } from '@/components/features/dashboard/dashboard-nav/NavMenuItem';
import { DashboardHeader } from '@/components/features/dashboard/organisms/DashboardHeader';
import { AppShellFrame } from './AppShellFrame';
import { Sidebar, SidebarMenu, SidebarProvider } from './sidebar';

const meta: Meta<typeof AppShellFrame> = {
  title: 'Organisms/AppShellFrame',
  component: AppShellFrame,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    sidebar: <aside className='h-full w-56 p-4'>Navigation</aside>,
    header: <header className='px-3 py-2'>Library</header>,
    main: <div className='p-3'>Main content</div>,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithInspector: Story = {
  args: {
    rightPanel: <aside className='h-full w-80 p-3'>Entity details</aside>,
  },
};

export const DesktopNavigation: Story = {
  decorators: [
    Story => (
      <SidebarProvider defaultOpen>
        <Story />
      </SidebarProvider>
    ),
  ],
  args: {
    sidebar: (
      <Sidebar collapsible='offcanvas'>
        <SidebarMenu>
          <NavMenuItem item={chatNavItem} isActive />
        </SidebarMenu>
      </Sidebar>
    ),
    header: <DashboardHeader breadcrumbs={[{ label: 'New Chat' }]} />,
    main: <div className='p-3'>Conversation</div>,
  },
};
