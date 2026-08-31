import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarNowPlaying } from './SidebarNowPlaying';

const meta = {
  title: 'Shell/SidebarNowPlaying',
  component: SidebarNowPlaying,
  parameters: { layout: 'centered' },
  args: {
    isPlaying: false,
    playOverlayVisible: false,
    onPlay: () => undefined,
    track: {
      trackTitle: 'Never Say A Word',
      artistName: 'Tim White',
      artworkUrl: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    },
  },
} satisfies Meta<typeof SidebarNowPlaying>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
