import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerInlineNote } from './DrawerInlineNote';

const meta = {
  title: 'Molecules/Drawer/DrawerInlineNote',
  component: DrawerInlineNote,
  parameters: {
    layout: 'centered',
  },
  args: {
    message: 'No links added yet.',
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DrawerInlineNote>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ErrorTone: Story = {
  args: {
    tone: 'error',
    message: 'Failed to load links.',
  },
};

/** The one-line note a drawer section shows when its list is empty. */
export const EmptyListNote: Story = {
  args: {
    message: 'No contacts added yet.',
    inset: 'flush',
  },
};

export const LongContent: Story = {
  args: {
    message:
      'Links from Spotify, Apple Music, YouTube Music, Tidal, Deezer, Amazon Music and SoundCloud will show here once the catalog sync finishes for this release.',
  },
};

export const Rtl: Story = {
  args: {
    message: 'لم تتم إضافة أي روابط بعد.',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
