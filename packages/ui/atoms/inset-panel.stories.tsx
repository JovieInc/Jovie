import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  ArrowUpRight,
  BookOpen,
  Keyboard,
  MessageSquare,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { IconButton } from './icon-button';
import {
  InsetPanel,
  InsetPanelHeader,
  InsetPanelProgress,
  InsetPanelRow,
  InsetPanelSectionLabel,
  InsetPanelSeparator,
} from './inset-panel';

const meta: Meta<typeof InsetPanel> = {
  title: 'UI/Atoms/InsetPanel',
  component: InsetPanel,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The menu surface as a static panel: even inset on every side, one fixed icon column, one label edge, right-aligned muted trailing content. Shares its geometry with CommonDropdown so a menu and a panel next to each other line up exactly.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    tone: { control: { type: 'select' }, options: ['plain', 'gradient'] },
  },
  decorators: [
    Story => (
      <div className='w-64'>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Rows share one icon column and one label edge; shortcuts sit right. */
export const Default: Story = {
  render: args => (
    <InsetPanel {...args}>
      <InsetPanelRow icon={<BookOpen />}>Docs</InsetPanelRow>
      <InsetPanelRow icon={<MessageSquare />}>Contact us</InsetPanelRow>
      <InsetPanelRow icon={<Keyboard />} trailing='⌘ /'>
        Keyboard shortcuts
      </InsetPanelRow>
      <InsetPanelRow icon={<Settings />} trailing='G then S'>
        Settings
      </InsetPanelRow>
      <InsetPanelSeparator />
      <InsetPanelSectionLabel>What&apos;s new</InsetPanelSectionLabel>
      <InsetPanelRow>Mobile diffs</InsetPanelRow>
      <InsetPanelRow>Full changelog</InsetPanelRow>
    </InsetPanel>
  ),
};

/** Header with a muted count, a full-width progress bar, then rows. */
export const HeaderWithProgress: Story = {
  render: args => (
    <InsetPanel {...args} asChild>
      <section aria-label='Getting started'>
        <InsetPanelHeader title='Getting started' meta='2 of 6' />
        <InsetPanelProgress value={33} label='Setup progress' />
        <InsetPanelRow asChild icon={<Sparkles />}>
          <a href='#connect'>Connect imported tools</a>
        </InsetPanelRow>
        <InsetPanelRow asChild icon={<Sparkles />} trailing={<ArrowUpRight />}>
          <a href='#daily'>Set up a daily update</a>
        </InsetPanelRow>
      </section>
    </InsetPanel>
  ),
};

/** The subtle token-built gradient used by the sidebar footer panels. */
export const Gradient: Story = {
  args: { tone: 'gradient' },
  render: args => (
    <InsetPanel {...args} asChild>
      <section aria-label="What's new">
        <InsetPanelHeader
          title="What's new"
          trailing={
            <IconButton size='sm' ariaLabel="Dismiss what's new">
              <X className='size-3' />
            </IconButton>
          }
        />
        <InsetPanelRow asChild icon={<Sparkles />} trailing={<ArrowUpRight />}>
          <a href='#changelog'>Your latest releases</a>
        </InsetPanelRow>
      </section>
    </InsetPanel>
  ),
};

/** A button row: the row itself is the action, with no nested pill. */
export const ActionRow: Story = {
  args: { tone: 'gradient' },
  render: args => (
    <InsetPanel {...args} asChild>
      <section aria-label='App update'>
        <InsetPanelRow icon={<Sparkles />} onClick={() => {}}>
          Restart to update
        </InsetPanelRow>
      </section>
    </InsetPanel>
  ),
};

/** A disabled action row stays in place and stops responding. */
export const DisabledRow: Story = {
  render: args => (
    <InsetPanel {...args} asChild>
      <section aria-label='App update'>
        <InsetPanelRow icon={<Sparkles />} onClick={() => {}} disabled>
          Downloading update
        </InsetPanelRow>
      </section>
    </InsetPanel>
  ),
};

/** A panel with a header and no rows yet keeps its inset and outline. */
export const EmptyNoRows: Story = {
  render: args => (
    <InsetPanel {...args}>
      <InsetPanelHeader title='Nothing here yet' />
    </InsetPanel>
  ),
};

/** Rows without an icon or trailing content keep the shared label edge. */
export const PartialRows: Story = {
  render: args => (
    <InsetPanel {...args}>
      <InsetPanelRow icon={<BookOpen />}>Docs</InsetPanelRow>
      <InsetPanelRow>Contact us</InsetPanelRow>
      <InsetPanelRow trailing='⌘ /'>Keyboard shortcuts</InsetPanelRow>
    </InsetPanel>
  ),
};

/** A long label truncates before the trailing slot instead of wrapping. */
export const LongContent: Story = {
  render: args => (
    <InsetPanel {...args}>
      <InsetPanelHeader
        title='Release pages now show every streaming service and presave countdowns'
        meta='12 of 240'
      />
      <InsetPanelRow icon={<Sparkles />} trailing='⌥ ⇧ Q'>
        Release pages now show every streaming service, presave countdowns and
        per-territory analytics
      </InsetPanelRow>
    </InsetPanel>
  ),
};

/** Right-to-left: the icon column and gutter mirror with the reading order. */
export const Rtl: Story = {
  render: args => (
    <div dir='rtl' lang='ar'>
      <InsetPanel {...args}>
        <InsetPanelHeader title='ما الجديد' meta='١ من ٣' />
        <InsetPanelRow icon={<Settings />} trailing='G S'>
          الإعدادات
        </InsetPanelRow>
      </InsetPanel>
    </div>
  ),
};
