import '../../styles/system-b-app.css';
import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import SettingsLayout from '@/app/app/(shell)/settings/layout';
import { RailToggleButton } from '@/components/atoms/RailToggleButton';
import { DashboardHeader } from '@/components/features/dashboard/organisms/DashboardHeader';
import { SettingsSection } from '@/components/features/dashboard/organisms/SettingsSection';
import { RightDrawer } from '@/components/molecules/drawer/RightDrawer';
import { useRailPreview } from '@/components/shell/useRailPreview';
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

export const ChatAmbientGradient: Story = {
  args: { chatAmbientGradient: true, containerClassName: 'h-dvh' },
};

/** Suspense placeholder: the frame paints without the live landmark id or
 * frame attribute while the signed-in shell resolves. */
export const LoadingPlaceholder: Story = {
  args: {
    placeholder: true,
    header: <header className='px-3 py-2'>Loading workspace</header>,
    main: (
      <div className='p-3' aria-busy='true'>
        Loading chat
      </div>
    ),
  },
};

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

function InspectorFixture({
  withPreview = false,
}: {
  readonly withPreview?: boolean;
}) {
  const [pinned, setPinned] = useState(false);
  // Production wiring (PreviewPanelContext + ProfileContactSidebar): hover or
  // focus on the toggle previews the rail as an overlay; a press pins it and
  // the route yields.
  const { isPreview, isFloating, dismissPreview } = useRailPreview({
    side: 'right',
    pinned,
    enabled: withPreview,
  });
  const open = pinned || isPreview;
  const presentation = isFloating ? 'overlay' : 'push';
  const setOpen = (next: boolean | ((value: boolean) => boolean)) => {
    dismissPreview();
    setPinned(value => (typeof next === 'function' ? next(value) : next));
  };
  return (
    <SidebarProvider defaultOpen={false}>
      <AppShellFrame
        containerClassName='h-dvh'
        sidebar={<Sidebar collapsible='icon'>Navigation</Sidebar>}
        header={
          <div className='flex h-(--app-shell-header-height) items-center justify-between px-3'>
            <span>Work</span>
            <RailToggleButton
              side='right'
              open={open}
              pinned={pinned}
              previewTrigger={withPreview}
              openLabel={isPreview ? 'Pin details' : 'Collapse details'}
              closedLabel='Expand details'
              controlsId='story-inspector'
              onToggle={() => setOpen(value => (isPreview ? true : !value))}
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
                data-testid='story-route-notes'
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
            presentation={presentation}
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
              <p>
                {presentation === 'push'
                  ? 'The open inspector is a column: the route yields its width.'
                  : 'A transient preview floats over the route below its header.'}
              </p>
            </div>
          </RightDrawer>
        }
      />
    </SidebarProvider>
  );
}

/** Open/pinned inspector pushes the route (founder call 2026-11-08). */
export const PushInspector: Story = {
  render: () => <InspectorFixture />,
};

/** Hover/focus on the toggle previews the rail over the route (no push);
 * pressing it pins the rail and the route yields with the same motion. */
export const PreviewOverlayInspector: Story = {
  render: () => <InspectorFixture withPreview />,
};
