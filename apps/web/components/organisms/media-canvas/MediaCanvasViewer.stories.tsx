import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { type MediaCanvasItem, MediaCanvasViewer } from './MediaCanvasViewer';

const items: readonly MediaCanvasItem[] = [
  {
    kind: 'image',
    src: 'https://picsum.photos/seed/evidence-a/1600/900',
    alt: 'Registry capture, desktop',
    label: 'founder-review-desktop.png',
  },
  {
    kind: 'video',
    src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    poster: 'https://picsum.photos/seed/evidence-b/1600/900',
    alt: 'Walkthrough recording',
    label: 'walkthrough.mp4',
  },
  {
    kind: 'image',
    src: 'https://picsum.photos/seed/evidence-c/900/1600',
    alt: 'Registry capture, mobile',
    label: 'founder-review-mobile.png',
  },
];

function ViewerHarness({ start }: { readonly start: number | null }) {
  const [index, setIndex] = useState<number | null>(start);
  return (
    <div>
      <button
        type='button'
        onClick={() => setIndex(0)}
        className='rounded-md border border-subtle px-3 py-1.5 text-sm'
      >
        Open viewer
      </button>
      <MediaCanvasViewer
        items={items}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setIndex(null)}
      />
    </div>
  );
}

const meta: Meta<typeof MediaCanvasViewer> = {
  title: 'Organisms/MediaCanvas/MediaCanvasViewer',
  component: MediaCanvasViewer,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof MediaCanvasViewer>;

export const Open: Story = {
  render: () => <ViewerHarness start={0} />,
};

export const Closed: Story = {
  render: () => <ViewerHarness start={null} />,
};

function SingleItemHarness() {
  const [index, setIndex] = useState<number | null>(0);
  return (
    <MediaCanvasViewer
      items={[items[0]]}
      index={index}
      onIndexChange={setIndex}
      onClose={() => setIndex(null)}
    />
  );
}

export const SingleItem: Story = {
  render: () => <SingleItemHarness />,
};

export const VideoTransport: Story = {
  render: () => <ViewerHarness start={1} />,
};
