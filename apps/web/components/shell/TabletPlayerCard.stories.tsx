import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TabletPlayerCard } from './TabletPlayerCard';

const meta = {
  title: 'Shell/TabletPlayerCard',
  component: TabletPlayerCard,
  parameters: { layout: 'centered' },
  args: {
    isPlaying: false,
    currentTime: 48,
    duration: 213,
    onPlay: () => undefined,
    track: {
      trackTitle: 'Never Say A Word',
      artistName: 'Tim White',
      artworkUrl: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    },
  },
} satisfies Meta<typeof TabletPlayerCard>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
