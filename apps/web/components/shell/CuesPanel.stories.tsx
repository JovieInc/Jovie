import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { CuesPanel } from './CuesPanel';
import type { Cue } from './cues.types';

const cues: Cue[] = [
  { at: 0, kind: 'intro', label: 'Intro' },
  { at: 12, kind: 'verse', label: 'Verse 1' },
  { at: 45, kind: 'chorus', label: 'Chorus' },
  { at: 90, kind: 'drop', label: 'Drop' },
];

const meta = {
  title: 'Shell/CuesPanel',
  component: CuesPanel,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-base'>
        <Story />
      </div>
    ),
  ],
  args: {
    cues,
    durationSec: 214,
    onSeek: fn(),
  },
} satisfies Meta<typeof CuesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    cues: [],
  },
};

export const CustomTitle: Story = {
  args: {
    title: 'Song structure',
  },
};
