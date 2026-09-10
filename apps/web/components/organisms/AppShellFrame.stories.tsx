import '../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import SettingsLayout from '@/app/app/(shell)/settings/layout';
import { DashboardHeader } from '@/components/features/dashboard/organisms/DashboardHeader';
import { SettingsSection } from '@/components/features/dashboard/organisms/SettingsSection';
import { AppShellFrame } from './AppShellFrame';
import { SidebarProvider } from './sidebar/context';
import { Sidebar } from './sidebar/Sidebar';

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

export const HeaderAlignment: Story = {
  render: () => (
    <SidebarProvider>
      <AppShellFrame
        sidebar={
          <Sidebar collapsible='offcanvas'>
            <div className='p-3'>Jovie</div>
          </Sidebar>
        }
        header={
          <DashboardHeader
            breadcrumbs={[{ label: 'New Chat' }]}
            action={<button type='button'>Help</button>}
          />
        }
        main={<div className='p-4'>Main content</div>}
      />
    </SidebarProvider>
  ),
};

export const RouteOwnedHeader: Story = {
  render: () => (
    <SidebarProvider>
      <AppShellFrame
        sidebar={<Sidebar collapsible='offcanvas'>Jovie</Sidebar>}
        main={<button type='button'>Route header action</button>}
      />
    </SidebarProvider>
  ),
};

export const SettingsHeaderAlignment: Story = {
  render: () => (
    <SidebarProvider>
      <AppShellFrame
        sidebar={<Sidebar collapsible='offcanvas'>Jovie</Sidebar>}
        main={
          <SettingsLayout>
            <SettingsSection
              id='account'
              title='Account'
              description='Security, theme, and notifications.'
              headerAction={<button type='button'>Save</button>}
            >
              <p>Account settings</p>
            </SettingsSection>
          </SettingsLayout>
        }
      />
    </SidebarProvider>
  ),
};
