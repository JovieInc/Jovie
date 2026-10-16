import '../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { withSignedInSession } from '@/.storybook/signed-in-session';
import { SidebarIdentityGroup } from '@/components/organisms/sidebar-identity-group';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';
import { SidebarDock, type SidebarDockProps } from './SidebarDock';

const release = {
  id: 'dock-story-release',
  title: 'Your latest releases',
  date: '2026-10-15',
  summary: '',
  url: '/changelog',
  highlights: [],
  dogfood: [],
};
const update = {
  state: 'available',
  version: '2',
  releaseDate: null,
  notesUrl: '/changelog',
} as const;
const audio = {
  track: {
    trackTitle: 'Never Say A Word',
    artistName: 'Tim White',
    artworkUrl: null,
  },
  isPlaying: true,
  onPlay: fn(),
  onDismiss: fn(),
};

/** Root theme overrides exercise the same tokens as the authenticated shell. */
function DockPreview(args: SidebarDockProps) {
  const [hidden, setHidden] = useState(false);
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
        audio={
          hidden
            ? undefined
            : args.audio
              ? { ...args.audio, onDismiss: () => setHidden(true) }
              : undefined
        }
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
  args: { userId: 'dock-story', onUpdate: fn() },
  render: DockPreview,
} satisfies Meta<typeof SidebarDock>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const AudioOnly: Story = { args: { audio } };
export const WhatsNewOnly: Story = { args: { release } };
export const WhatsNewAndAudio: Story = { args: { release, audio } };
export const UpdateOnly: Story = { args: { update } };
export const UpdateAndAudio: Story = { args: { update, audio } };
export const UpdateAndWhatsNew: Story = { args: { update, release } };
export const AllThree: Story = { args: { update, release, audio } };
export const WithInstall: Story = {
  args: {
    update,
    release,
    audio,
    install: { onInstall: fn(), onDismiss: fn() },
  },
};
export const Collapsed: Story = {
  args: { update, release, audio, collapsed: true },
};
export const CollapsedEmpty: Story = { args: { collapsed: true } };
export const Downloading: Story = {
  args: {
    update: {
      state: 'downloading',
      percent: 42,
      transferredBytes: 42,
      totalBytes: 100,
      bytesPerSecond: 1,
    },
    release,
    audio,
  },
};
export const Ready: Story = {
  args: { update: { state: 'ready', version: '2' }, release, audio },
};
export const UpdateError: Story = {
  args: { update: { state: 'error', message: 'Offline', retryable: true } },
};
export const IOSInstall: Story = {
  args: { install: { isIOS: true, onInstall: fn(), onDismiss: fn() } },
};

const light = { themes: { themeOverride: 'light' } };
export const EmptyLight: Story = { ...Empty, parameters: light };
export const AudioOnlyLight: Story = { ...AudioOnly, parameters: light };
export const WhatsNewOnlyLight: Story = { ...WhatsNewOnly, parameters: light };
export const WhatsNewAndAudioLight: Story = {
  ...WhatsNewAndAudio,
  parameters: light,
};
export const UpdateOnlyLight: Story = { ...UpdateOnly, parameters: light };
export const UpdateAndAudioLight: Story = {
  ...UpdateAndAudio,
  parameters: light,
};
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
