import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/organisms/Sidebar';

const meta: Meta<typeof Sidebar> = {
  title: 'Dashboard/Sidebar-08',
  component: Sidebar,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'New sidebar-08 style implementation for the dashboard layout.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Sidebar>;

const SidebarDemo = () => (
  <SidebarProvider>
    <div className='flex h-screen w-full'>
      <Sidebar variant='inset'>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size='lg'>
                <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground'>
                  <span className='text-lg font-bold'>J</span>
                </div>
                <div className='grid flex-1 text-left text-sm leading-tight'>
                  <span className='truncate font-semibold'>Jovie</span>
                  <span className='truncate text-xs'>Creator Dashboard</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <DashboardNav />
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className='flex items-center gap-2 px-2 py-1'>
                <div className='w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium'>
                  U
                </div>
                <div className='flex-1 text-sm'>
                  <div className='font-medium'>User Name</div>
                  <div className='text-xs text-muted-foreground'>
                    user@example.com
                  </div>
                </div>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <div className='flex-1 flex flex-col'>
        <div className='border-b p-4'>
          <h1 className='text-2xl font-bold'>Dashboard Content</h1>
          <p className='text-muted-foreground'>
            This demonstrates the new sidebar-08 implementation with preserved
            functionality.
          </p>
        </div>
        <div className='flex-1 p-4 space-y-4'>
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            <div className='rounded-lg border bg-card text-card-foreground shadow-sm p-6'>
              <div className='flex items-center space-y-0 pb-2'>
                <h3 className='tracking-tight text-sm font-medium'>Overview</h3>
              </div>
              <div className='text-2xl font-bold'>1,234</div>
              <p className='text-xs text-muted-foreground'>
                +20.1% from last month
              </p>
            </div>
            <div className='rounded-lg border bg-card text-card-foreground shadow-sm p-6'>
              <div className='flex items-center space-y-0 pb-2'>
                <h3 className='tracking-tight text-sm font-medium'>Links</h3>
              </div>
              <div className='text-2xl font-bold'>56</div>
              <p className='text-xs text-muted-foreground'>+5 this week</p>
            </div>
            <div className='rounded-lg border bg-card text-card-foreground shadow-sm p-6'>
              <div className='flex items-center space-y-0 pb-2'>
                <h3 className='tracking-tight text-sm font-medium'>
                  Analytics
                </h3>
              </div>
              <div className='text-2xl font-bold'>89%</div>
              <p className='text-xs text-muted-foreground'>
                +2% from last week
              </p>
            </div>
            <div className='rounded-lg border bg-card text-card-foreground shadow-sm p-6'>
              <div className='flex items-center space-y-0 pb-2'>
                <h3 className='tracking-tight text-sm font-medium'>Earnings</h3>
              </div>
              <div className='text-2xl font-bold'>$456</div>
              <p className='text-xs text-muted-foreground'>
                +12% from last month
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </SidebarProvider>
);

export const Default: Story = {
  render: () => <SidebarDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Default sidebar-08 implementation with navigation, header, and footer sections.',
      },
    },
  },
};

export const Collapsed: Story = {
  render: () => (
    <SidebarProvider defaultOpen={false}>
      <div className='flex h-screen w-full'>
        <Sidebar variant='inset'>
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size='lg'>
                  <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground'>
                    <span className='text-lg font-bold'>J</span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent>
            <DashboardNav />
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size='lg'>
                  <div className='w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium'>
                    U
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <div className='flex-1 flex flex-col'>
          <div className='border-b p-4'>
            <h1 className='text-2xl font-bold'>Collapsed Sidebar View</h1>
            <p className='text-muted-foreground'>
              The sidebar collapses to icon-only mode while preserving all
              functionality.
            </p>
          </div>
          <div className='flex-1 p-4'>
            <div className='rounded-lg border bg-card text-card-foreground shadow-sm p-6'>
              <h3 className='text-lg font-semibold mb-2'>Features:</h3>
              <ul className='space-y-1 text-sm text-muted-foreground'>
                <li>• Tooltips show on hover for collapsed items</li>
                <li>• Keyboard shortcut (Ctrl/Cmd + B) to toggle</li>
                <li>• Mobile responsive with slide-out sheet</li>
                <li>• Persistent state across sessions</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Collapsed sidebar showing icon-only mode with tooltips.',
      },
    },
  },
};
