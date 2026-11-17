import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { DrawerButton } from './DrawerButton';
import { DrawerSection } from './DrawerSection';

const meta = {
  title: 'Molecules/Drawer/DrawerSection',
  component: DrawerSection,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-surface-0'>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Metadata',
    children: (
      <p className='text-sm text-secondary-token'>Section content goes here.</p>
    ),
  },
} satisfies Meta<typeof DrawerSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};

export const Card: Story = {
  args: {
    surface: 'card',
  },
};

export const Collapsed: Story = {
  args: {
    defaultOpen: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Metadata' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  },
};

export const NotCollapsible: Story = {
  args: {
    collapsible: false,
  },
};

export const WithActions: Story = {
  args: {
    actions: (
      <DrawerButton tone='ghost' size='sm'>
        Edit
      </DrawerButton>
    ),
  },
};

/** A titled section whose owner has nothing to list yet. */
export const EmptySection: Story = {
  args: {
    title: 'Links',
    children: (
      <p className='text-xs text-tertiary-token'>No links added yet.</p>
    ),
  },
};

/** No title: no heading, no collapse toggle, content only. */
export const PartialUntitled: Story = {
  args: {
    title: undefined,
    surface: 'card',
  },
};

export const LongContent: Story = {
  args: {
    title:
      'Streaming links, presave destinations and territory-specific store pages',
    actions: (
      <DrawerButton tone='ghost' size='sm'>
        Edit
      </DrawerButton>
    ),
    children: (
      <p className='text-sm text-secondary-token'>
        Spotify, Apple Music, YouTube Music, Tidal, Deezer, Amazon Music,
        SoundCloud, Beatport, Bandcamp and Audiomack links appear here once the
        catalog sync finishes for every territory this release is distributed
        to.
      </p>
    ),
  },
};

export const Rtl: Story = {
  args: {
    title: 'البيانات الوصفية',
    children: (
      <p className='text-sm text-secondary-token'>يظهر محتوى القسم هنا.</p>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
