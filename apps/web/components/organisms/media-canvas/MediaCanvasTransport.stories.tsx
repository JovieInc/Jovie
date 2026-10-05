import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { MediaTransportSnapshot } from '@/components/organisms/audio-chrome-state';
import { MediaCanvasTransport } from './MediaCanvasTransport';

const videoTransport = {
  ownerId: 'storybook-canvas',
  itemId: 'video:walkthrough',
  kind: 'video',
  label: 'walkthrough.mp4',
  index: 1,
  itemCount: 3,
  status: 'paused',
  currentTime: 42,
  duration: 125,
  hasPrevious: true,
  hasNext: true,
  togglePlayback: fn(),
  seek: fn(),
  previous: fn(),
  next: fn(),
  retry: fn(),
} satisfies MediaTransportSnapshot;

const meta = {
  title: 'Organisms/MediaCanvas/MediaCanvasTransport',
  component: MediaCanvasTransport,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='bg-shell-frame p-4'>
        <div className='overflow-hidden rounded-xl border border-subtle bg-shell-dock'>
          <Story />
        </div>
      </div>
    ),
  ],
  args: { transport: videoTransport },
} satisfies Meta<typeof MediaCanvasTransport>;

export default meta;
type Story = StoryObj<typeof meta>;

export const VideoPaused: Story = {};

export const VideoPlaying: Story = {
  args: { transport: { ...videoTransport, status: 'playing' } },
};

export const VideoLoading: Story = {
  args: { transport: { ...videoTransport, status: 'loading' } },
};

export const VideoError: Story = {
  args: { transport: { ...videoTransport, status: 'error' } },
};

export const PhotoDisabled: Story = {
  args: {
    transport: {
      ...videoTransport,
      itemId: 'image:capture',
      kind: 'image',
      label: 'release-capture.png',
      index: 0,
      status: 'ready',
      currentTime: 0,
      duration: 0,
      hasPrevious: false,
      togglePlayback: undefined,
      seek: undefined,
    },
  },
};
