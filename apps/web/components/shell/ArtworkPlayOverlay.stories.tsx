import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ArtworkPlayOverlay } from './ArtworkPlayOverlay';

const meta = {
  title: 'Shell/ArtworkPlayOverlay',
  component: ArtworkPlayOverlay,
  parameters: {
    layout: 'centered',
  },
  // The overlay pins to the album art via absolute inset-0, so the story
  // stages it over a sized artwork tile like the sidebar now-playing rows.
  decorators: [
    Story => (
      <div className='relative h-16 w-16 overflow-hidden rounded-md bg-base'>
        <Story />
      </div>
    ),
  ],
  args: {
    onPlay: fn(),
  },
} satisfies Meta<typeof ArtworkPlayOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Paused: Story = {
  args: {
    isPlaying: false,
    visible: true,
  },
};

export const Playing: Story = {
  args: {
    isPlaying: true,
    visible: true,
  },
};

export const Hidden: Story = {
  args: {
    isPlaying: false,
    visible: false,
  },
};
