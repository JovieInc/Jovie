import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { RowWaveform } from './RowWaveform';
import type { RowWaveformDatum } from './row-waveform.types';

const track: RowWaveformDatum = {
  id: 'track-1',
  title: 'Midnight Drive',
  durationSec: 214,
  waveformSeed: 42,
  cues: [
    { at: 0, kind: 'intro', label: 'Intro' },
    { at: 45, kind: 'chorus', label: 'Chorus' },
  ],
};

const meta = {
  title: 'Shell/RowWaveform',
  component: RowWaveform,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-base p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    track,
    currentTimeSec: 60,
    isCurrentTrack: true,
    onSeek: fn(),
  },
} satisfies Meta<typeof RowWaveform>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {};

export const NotCurrentTrack: Story = {
  args: {
    isCurrentTrack: false,
    currentTimeSec: 0,
  },
};
