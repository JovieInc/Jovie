import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { AudioBar } from './AudioBar';

const meta = {
  title: 'Shell/AudioBar',
  component: AudioBar,
  parameters: { layout: 'fullscreen' },
  args: {
    isPlaying: false,
    onPlay: fn(),
    onSeek: fn(),
    onShuffle: fn(),
    onPrevious: fn(),
    onNext: fn(),
    onCollapse: fn(),
    onDismiss: fn(),
    currentTime: 78,
    duration: 213,
    cues: [],
    loopMode: 'off',
    onCycleLoop: fn(),
    waveformOn: true,
    onToggleWaveform: fn(),
    lyricsActive: false,
    onOpenLyrics: fn(),
    track: {
      id: 'lost-in-the-light',
      title: 'Lost in the Light',
      artist: 'Bahamas',
      hasLyrics: true,
    },
  },
} satisfies Meta<typeof AudioBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Paused: Story = {};

export const Playing: Story = {
  args: { isPlaying: true },
};

export const LyricsOpen: Story = {
  args: { lyricsActive: true },
};
