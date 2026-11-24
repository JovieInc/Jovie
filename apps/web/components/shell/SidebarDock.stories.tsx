import '../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { withSignedInSession } from '@/.storybook/signed-in-session';
import { DesktopUpdateControl } from '@/components/organisms/desktop-update/DesktopUpdateControl';
import { SidebarIdentityGroup } from '@/components/organisms/sidebar-identity-group';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';
import type { DesktopUpdateControlState } from '@/lib/desktop/desktop-update-control-state';
import {
  SidebarDock,
  type SidebarDockProps,
  type SidebarDockUpdateControl,
} from './SidebarDock';

const release = {
  id: 'dock-story-release',
  title: 'Your latest releases',
  date: '2026-10-15',
  summary: '',
  url: '/changelog',
  highlights: [],
  dogfood: [],
};
/** The dock's update slot, filled the way SidebarDockBridge fills it. */
const updateControl = (
  state: DesktopUpdateControlState,
  label: string
): SidebarDockUpdateControl => ({
  visible: true,
  label,
  urgent: state.kind === 'failed',
  node: (
    <DesktopUpdateControl
      state={state}
      onDownload={fn()}
      onRestart={fn()}
      onRetry={fn()}
    />
  ),
});
const update = updateControl(
  { kind: 'available', version: '2' },
  'Update available'
);
const failedUpdate = updateControl(
  { kind: 'failed', retry: 'check', version: '2' },
  'Update failed'
);
/** Root theme overrides exercise the same tokens as the authenticated shell. */
function DockPreview(args: SidebarDockProps) {
  const [installed, setInstalled] = useState(false);
  return (
    <div
      data-dock-preview
      className='group flex flex-col bg-sidebar text-primary-token'
      data-collapsible={args.collapsed ? 'icon' : undefined}
      style={{ height: 480, width: args.collapsed ? 52 : 224 }}
    >
      <nav className='min-h-0 flex-1 p-3'>
        <span data-testid='nav-anchor' className='text-xs'>
          Home
        </span>
      </nav>
      <SidebarDock
        {...args}
        install={
          installed
            ? undefined
            : args.install
              ? {
                  ...args.install,
                  onDismiss: () => setInstalled(true),
                  onInstall: () => setInstalled(true),
                }
              : undefined
        }
      >
        {status => (
          <SidebarIdentityGroup
            calm
            profileHref={undefined}
            dockStatus={status}
          />
        )}
      </SidebarDock>
    </div>
  );
}

const meta = {
  title: 'Shell/SidebarDock',
  component: SidebarDock,
  parameters: { layout: 'centered', themes: { themeOverride: 'dark' } },
  decorators: [
    withSignedInSession,
    Story => (
      <JovieAuthValuesProvider>
        <Story />
      </JovieAuthValuesProvider>
    ),
  ],
  args: { userId: 'dock-story' },
  render: DockPreview,
} satisfies Meta<typeof SidebarDock>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const WhatsNewOnly: Story = { args: { release } };
export const UpdateOnly: Story = { args: { updateControl: update } };
export const UpdateAndWhatsNew: Story = {
  args: { updateControl: update, release },
};
export const AllThree: Story = {
  args: {
    updateControl: update,
    release,
  },
};
export const WithInstall: Story = {
  args: {
    release,
    install: { onInstall: fn(), onDismiss: fn() },
  },
};
export const Collapsed: Story = {
  args: { updateControl: update, release, collapsed: true },
};
export const CollapsedEmpty: Story = { args: { collapsed: true } };
export const Downloading: Story = {
  args: {
    updateControl: updateControl(
      { kind: 'downloading', version: '2', percent: 42 },
      'Downloading update'
    ),
    release,
  },
};
export const Ready: Story = {
  args: {
    updateControl: updateControl(
      { kind: 'ready', version: '2' },
      'Restart to update'
    ),
    release,
  },
};
export const UpdateError: Story = {
  args: { updateControl: failedUpdate },
};
export const IOSInstall: Story = {
  args: { install: { isIOS: true, onInstall: fn(), onDismiss: fn() } },
};

export const ErrorUpdateFailed: Story = {
  args: {
    updateControl: failedUpdate,
  },
};
export const LongContent: Story = {
  args: {
    release: {
      ...release,
      title:
        'Release pages now show every streaming service, presave countdowns and per-territory analytics',
    },
  },
};
export const Rtl: Story = {
  args: {
    updateControl: update,
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};

const light = { themes: { themeOverride: 'light' } };
export const EmptyLight: Story = { ...Empty, parameters: light };
export const WhatsNewOnlyLight: Story = { ...WhatsNewOnly, parameters: light };
export const UpdateOnlyLight: Story = { ...UpdateOnly, parameters: light };
export const UpdateAndWhatsNewLight: Story = {
  ...UpdateAndWhatsNew,
  parameters: light,
};
export const AllThreeLight: Story = { ...AllThree, parameters: light };
export const WithInstallLight: Story = { ...WithInstall, parameters: light };
export const CollapsedLight: Story = { ...Collapsed, parameters: light };
export const CollapsedEmptyLight: Story = {
  ...CollapsedEmpty,
  parameters: light,
};
export const DownloadingLight: Story = { ...Downloading, parameters: light };
export const ReadyLight: Story = { ...Ready, parameters: light };
export const UpdateErrorLight: Story = { ...UpdateError, parameters: light };
export const IOSInstallLight: Story = { ...IOSInstall, parameters: light };
export const ErrorUpdateFailedLight: Story = {
  ...ErrorUpdateFailed,
  parameters: light,
};
export const LongContentLight: Story = { ...LongContent, parameters: light };
