import '../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DockUpdateCard, DockWhatsNewCard } from './SidebarDockCards';

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
  args: {
    label: 'Update available',
    dismissible: true,
    onOpen: fn(),
    onDismiss: fn(),
  },
} satisfies Meta<typeof DockUpdateCard>;
export default meta;
type Story = StoryObj<typeof meta>;

const light = { themes: { themeOverride: 'light' } };

/** An available update can be dismissed. */
export const UpdateAvailable: Story = {};
/** A ready update has one action and no dismiss. */
export const UpdateReady: Story = {
  args: { label: 'Restart to update', dismissible: false },
};
export const UpdateDownloading: Story = {
  args: { label: 'Downloading 42%', dismissible: false },
};
export const UpdateFailed: Story = {
  args: { label: 'Update failed', dismissible: false },
};
/** No label yet: the slot keeps its 32px footprint. */
export const UpdateEmptyLabel: Story = {
  args: { label: null, dismissible: false },
};

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
export const WhatsNewLongContent: Story = {
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
