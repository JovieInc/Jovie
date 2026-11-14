import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SeekBar } from './SeekBar';

const meta = {
  title: 'Atoms/SeekBar',
  component: SeekBar,
  parameters: {
    layout: 'centered',
  },
  args: {
    currentTime: 45,
    duration: 180,
    onSeek: fn(),
  },
  decorators: [
    Story => (
      <div className='w-64'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SeekBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NearEnd: Story = {
  args: {
    currentTime: 165,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const NoDuration: Story = {
  name: 'No duration (auto-disabled)',
  args: {
    currentTime: 0,
    duration: 0,
  },
};

// Stream metadata has not arrived: the position is known, the length is not.
export const PartialUnknownDuration: Story = {
  args: {
    currentTime: 12,
    duration: Number.NaN,
  },
};

// A three-hour mix: the thumb still tracks the fraction played.
export const LongTrack: Story = {
  args: {
    currentTime: 5400,
    duration: 10800,
  },
};

export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
