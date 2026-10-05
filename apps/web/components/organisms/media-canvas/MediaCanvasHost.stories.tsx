import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect } from 'react';
import { PersistentAudioBar } from '@/components/organisms/PersistentAudioBar';
import { MediaCanvasHost } from './MediaCanvasHost';
import { closeMediaCanvas, openMediaCanvas } from './media-canvas-state';

const items = [
  {
    kind: 'image' as const,
    src: 'https://picsum.photos/seed/shared-canvas/1600/900',
    alt: 'Shared evidence capture',
  },
  {
    kind: 'video' as const,
    src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    alt: 'Shared walkthrough recording',
  },
];

function OpenHost() {
  useEffect(() => {
    openMediaCanvas(items);
    return closeMediaCanvas;
  }, []);

  return (
    <div className='min-h-dvh bg-base'>
      <PersistentAudioBar />
      <MediaCanvasHost />
    </div>
  );
}

const meta = {
  title: 'Organisms/MediaCanvas/MediaCanvasHost',
  component: MediaCanvasHost,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof MediaCanvasHost>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OpenMediaList: Story = {
  render: () => <OpenHost />,
};

export const Closed: Story = {};
