import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MoreHorizontal } from 'lucide-react';
import { fn } from 'storybook/test';
import { DrawerHero } from './DrawerHero';

const meta = {
  title: 'Shell/DrawerHero',
  component: DrawerHero,
  parameters: {
    layout: 'centered',
  },
  args: {
    title: 'Lost in the Light',
    subtitle: 'Bahamas',
    artwork: (
      <div className='grid h-16 w-16 place-items-center rounded-lg bg-surface-2 text-caption text-tertiary-token'>
        LI
      </div>
    ),
    meta: <span>Single</span>,
    trailing: <span>jov.ie/bahamas/lost-in-the-light</span>,
  },
} satisfies Meta<typeof DrawerHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const StableRail: Story = {
  args: {
    density: 'rail',
    stableLayout: true,
    title:
      'A Very Long Release Title That Still Needs Predictable Drawer Geometry',
    subtitle: 'Bahamas · Earthtones',
    metaOverflow: 'scroll',
    meta: (
      <>
        <span>Scheduled</span>
        <span>Spotify</span>
        <span>Apple Music</span>
      </>
    ),
    trailing: null,
  },
};

export const WithActions: Story = {
  args: {
    onPlay: fn(),
    playLabel: 'Play Lost in the Light',
    onMenu: fn(),
    statusBadge: (
      <span className='inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-caption text-secondary-token'>
        <MoreHorizontal className='h-3 w-3' />
        Live
      </span>
    ),
  },
};
