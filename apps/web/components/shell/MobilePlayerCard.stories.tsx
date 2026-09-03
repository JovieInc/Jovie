import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MobilePlayerCard } from './MobilePlayerCard';

const meta = {
  title: 'Shell/MobilePlayerCard',
  component: MobilePlayerCard,
  parameters: { layout: 'centered' },
  args: {
    isPlaying: false,
    pct: 20,
    onPlay: () => undefined,
    track: {
      trackTitle: 'Never Say A Word',
      artistName: 'Tim White',
      artworkUrl: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    },
  },
} satisfies Meta<typeof MobilePlayerCard>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
