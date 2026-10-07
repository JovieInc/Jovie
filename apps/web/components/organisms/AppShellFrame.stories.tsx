import '../../styles/system-b-app.css';
import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import SettingsLayout from '@/app/app/(shell)/settings/layout';
import { RailToggleButton } from '@/components/atoms/RailToggleButton';
import { DashboardHeader } from '@/components/features/dashboard/organisms/DashboardHeader';
import { SettingsSection } from '@/components/features/dashboard/organisms/SettingsSection';
import { RightDrawer } from '@/components/molecules/drawer/RightDrawer';
import { AppShellFrame } from './AppShellFrame';
import { Sidebar, SidebarProvider } from './sidebar';

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
          // Icon collapsible matches the production UnifiedSidebar contract:
          // collapsing leaves a visible icon rail rather than a 0-width mount,
          // which is the composition the desktop titlebar geometry targets.
          <Sidebar collapsible='icon'>
            <div className='p-3'>Jovie</div>
          </Sidebar>
        }
        header={
          <DashboardHeader
            breadcrumbs={[{ label: 'New Chat' }]}
            action={<Button type='button'>Help</Button>}
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
        main={<Button type='button'>Route header action</Button>}
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
              headerAction={<Button type='button'>Save</Button>}
            >
              <p>Account settings</p>
            </SettingsSection>
          </SettingsLayout>
        }
      />
    </SidebarProvider>
  ),
};

function OverlayInspectorFixture() {
  const [open, setOpen] = useState(false);
  return (
    <SidebarProvider defaultOpen={false}>
      <AppShellFrame
        containerClassName='h-dvh'
        sidebar={<Sidebar collapsible='icon'>Navigation</Sidebar>}
        header={
          <div className='flex h-12 items-center justify-between px-3'>
            <span>Work</span>
            <RailToggleButton
              side='right'
              open={open}
              openLabel='Collapse details'
              closedLabel='Expand details'
              controlsId='story-inspector'
              onToggle={() => setOpen(value => !value)}
            />
          </div>
        }
        main={
          <div
            data-testid='story-route-scroll'
            className='h-full overflow-auto'
          >
            <label className='block p-4'>
              Notes
              <textarea
                className='block w-full'
                defaultValue='Keep this draft'
              />
            </label>
            <div className='p-4' style={{ height: 1600 }}>
              Scrollable work content
            </div>
          </div>
        }
        rightPanel={
          <RightDrawer
            id='story-inspector'
            data-testid='story-inspector'
            isOpen={open}
            width={400}
            ariaLabel='Work details'
            onKeyDown={event => {
              if (event.key === 'Escape') setOpen(false);
            }}
          >
            <div className='h-full overflow-auto p-4'>
              <Button type='button' onClick={() => setOpen(false)}>
                Close details
              </Button>
              <label className='block py-4'>
                Detail notes
                <input
                  className='block w-full'
                  defaultValue='Inspector draft'
                />
              </label>
              <p>Context stays inside the content panel, below its header.</p>
            </div>
          </RightDrawer>
        }
      />
    </SidebarProvider>
  );
}

export const OverlayInspector: Story = {
  render: () => <OverlayInspectorFixture />,
};
