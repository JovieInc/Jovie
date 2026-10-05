import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SeekBar } from './SeekBar';

const meta = {
  title: 'Molecules/SeekBar',
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
