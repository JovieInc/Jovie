import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarBottomNowPlaying } from './SidebarBottomNowPlaying';

const meta = {
  title: 'Shell/SidebarBottomNowPlaying',
  component: SidebarBottomNowPlaying,
  parameters: { layout: 'centered' },
  args: {
    isPlaying: false,
    onPlay: () => undefined,
    track: {
      trackTitle: 'Never Say A Word',
      artistName: 'Tim White',
      artworkUrl: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    },
  },
} satisfies Meta<typeof SidebarBottomNowPlaying>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
