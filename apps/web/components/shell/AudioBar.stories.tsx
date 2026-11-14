import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn } from 'storybook/test';
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

export const Compact: Story = {
  args: { waveformOn: false },
  play: ({ canvasElement }) => {
    const slider = canvasElement.querySelector<HTMLInputElement>(
      'input[aria-label="Seek Track Waveform"]'
    );
    slider?.focus();
    expect(slider).not.toHaveFocus();
    expect(slider?.closest('[inert]')).not.toBeNull();
  },
};

export const LyricsOpen: Story = {
  args: { lyricsActive: true },
};

export const ExpandedWithFacts: Story = {
  args: {
    waveformOn: true,
    track: {
      id: 'lost-in-the-light',
      title: 'Lost in the Light',
      artist: 'Bahamas',
      hasLyrics: true,
      bpm: 118,
      musicalKey: '8A',
    },
  },
};

export const ExpandedWithoutFacts: Story = {
  args: { waveformOn: true },
};

/** Waveform open on a track with no cue markers yet. */
export const EmptyCues: Story = {
  args: { waveformOn: true, cues: [] },
};

/** Only the required transport: no shuffle, previous, next or loop
 *  handlers, and a track without lyrics or analyzed facts. */
export const PartialTransport: Story = {
  args: {
    onShuffle: undefined,
    onPrevious: undefined,
    onNext: undefined,
    onCycleLoop: undefined,
    track: {
      id: 'untitled-demo',
      title: 'Untitled demo',
      artist: 'Bahamas',
    },
  },
};

export const LongContent: Story = {
  args: {
    waveformOn: true,
    cues: [
      { at: 12, label: 'Intro with the extended a cappella vocal and pads' },
      {
        at: 48,
        label: 'Second chorus into the long instrumental breakdown section',
      },
      { at: 86, label: 'Outro with the reprise of the opening synth line' },
    ],
    track: {
      id: 'midnight-drive',
      title:
        'Midnight Drive Through the Neon City (Extended Club Mix featuring the Late Night Strings)',
      artist: 'The Long Weekend Collective',
      hasLyrics: true,
      bpm: 174,
      musicalKey: 'F♯ minor (11A)',
    },
  },
};

export const Rtl: Story = {
  args: {
    waveformOn: true,
    cues: [{ at: 40, label: 'المقطع الثاني' }],
    track: {
      id: 'layali',
      title: 'ليالي المدينة الطويلة',
      artist: 'فرقة الشرق',
      hasLyrics: true,
      bpm: 96,
      musicalKey: '4A',
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
