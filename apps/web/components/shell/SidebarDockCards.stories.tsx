import '../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DesktopUpdateControl } from '@/components/organisms/desktop-update/DesktopUpdateControl';
import type { DesktopUpdateControlState } from '@/lib/desktop/desktop-update-control-state';
import { DockUpdateCard, DockWhatsNewCard } from './SidebarDockCards';

/** The update slot, filled with the desktop app's one update control. */
const control = (state: DesktopUpdateControlState) => (
  <DesktopUpdateControl
    state={state}
    onDownload={fn()}
    onRestart={fn()}
    onRetry={fn()}
  />
);

/** The cards at the width they get inside the open sidebar. */
const meta = {
  title: 'Shell/SidebarDockCards',
  component: DockUpdateCard,
  parameters: { layout: 'centered', themes: { themeOverride: 'dark' } },
  decorators: [
    Story => (
      <div className='flex w-56 flex-col gap-1 bg-sidebar px-3 py-3 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: { children: control({ kind: 'available', version: '2' }) },
} satisfies Meta<typeof DockUpdateCard>;
export default meta;
type Story = StoryObj<typeof meta>;

const light = { themes: { themeOverride: 'light' } };

/** An available update offers the download. */
export const UpdateAvailable: Story = {};
/** A ready update has one action: restart. */
export const UpdateReady: Story = {
  args: { children: control({ kind: 'ready', version: '2' }) },
};
export const UpdateDownloading: Story = {
  args: {
    children: control({ kind: 'downloading', version: '2', percent: 42 }),
  },
};
export const UpdateFailed: Story = {
  args: {
    children: control({ kind: 'failed', retry: 'check', version: '2' }),
  },
};
/** Nothing to show yet: the slot keeps its 32px footprint. */
export const EmptyUpdateSlot: Story = { args: { children: null } };

export const WhatsNew: Story = {
  render: () => (
    <DockWhatsNewCard
      title='Your latest releases'
      onOpen={fn()}
      onDismiss={fn()}
    />
  ),
};
/** A long release title truncates before the trailing arrow. */
export const LongContentWhatsNew: Story = {
  render: () => (
    <DockWhatsNewCard
      title='Release pages now show every streaming service, presave countdowns and per-territory analytics'
      onOpen={fn()}
      onDismiss={fn()}
    />
  ),
};
export const Stacked: Story = {
  render: args => (
    <>
      <DockUpdateCard {...args} />
      <DockWhatsNewCard
        title='Your latest releases'
        onOpen={fn()}
        onDismiss={fn()}
      />
    </>
  ),
};
export const Rtl: Story = {
  ...Stacked,
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};

export const UpdateAvailableLight: Story = {
  ...UpdateAvailable,
  parameters: light,
};
export const UpdateReadyLight: Story = { ...UpdateReady, parameters: light };
export const WhatsNewLight: Story = { ...WhatsNew, parameters: light };
export const StackedLight: Story = { ...Stacked, parameters: light };
