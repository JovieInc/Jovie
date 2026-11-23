import '../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SidebarOPresence } from './SidebarOPresence';

const meta = {
  title: 'Shell/SidebarOPresence',
  component: SidebarOPresence,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='group w-56 bg-sidebar text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SidebarOPresence>;

export default meta;
type Story = StoryObj<typeof meta>;

/** At rest: the O alone. The status slot is laid out but invisible. */
export const Idle: Story = {};

/** The desktop updater is checking or downloading (after the 400 ms delay). */
export const Updating: Story = { args: { updating: true } };

/** The OV skin draws the same O in the OV variant. */
export const Ovie: Story = {
  args: { variant: 'ov', href: '/app/ov' },
};

const player = {
  title: 'Never Say A Word',
  artist: 'Tim White',
  isPlaying: true,
  onToggle: fn(),
  onExpand: fn(),
};

/** A track is loaded and playing: the O is the pause button, title beside it. */
export const Playing: Story = { args: { player } };

/** Paused: the O is the play glyph. */
export const Paused: Story = {
  args: { player: { ...player, isPlaying: false } },
};

/** A long title truncates inside the same slot; the row never grows. */
export const LongContent: Story = {
  args: {
    player: {
      ...player,
      title:
        'Midnight Drive Through the Neon City (Extended Club Mix featuring the Late Night Strings)',
      artist:
        'The Long Weekend Collective, Avery Stone and the Northern Lights',
    },
  },
};

/** The full player is the transport: the O stays, inert and hidden. */
export const FullPlayerOpen: Story = { args: { player, inert: true } };
