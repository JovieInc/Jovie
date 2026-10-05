import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { PersistentAudioBar } from '@/components/organisms/PersistentAudioBar';
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

function ViewerHarness({
  start,
  media = items,
  theme = 'dark',
}: {
  readonly start: number | null;
  readonly media?: readonly MediaCanvasItem[];
  readonly theme?: 'light' | 'dark';
}) {
  const [index, setIndex] = useState<number | null>(start);
  const { setTheme } = useTheme();

  useEffect(() => setTheme(theme), [setTheme, theme]);

  return (
    <div className='flex h-dvh flex-col bg-base p-2'>
      <main className='grid min-h-0 flex-1 place-items-center rounded-(--app-shell-radius) bg-(--app-shell-content-surface) text-secondary-token shadow-(--app-shell-shadow)'>
        <button
          type='button'
          onClick={() => setIndex(0)}
          className='rounded-md border border-subtle px-3 py-1.5 text-sm'
        >
          Open viewer
        </button>
      </main>
      <PersistentAudioBar />
      <MediaCanvasViewer
        items={media}
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

export const PhotoDark: Story = {
  render: () => <ViewerHarness start={0} />,
};

export const PhotoLight: Story = {
  render: () => <ViewerHarness start={0} theme='light' />,
};

export const VideoDark: Story = {
  render: () => <ViewerHarness start={1} />,
};

export const VideoLight: Story = {
  render: () => <ViewerHarness start={1} theme='light' />,
};

export const Closed: Story = {
  render: () => <ViewerHarness start={null} />,
};

export const SingleItem: Story = {
  render: () => <ViewerHarness start={0} media={[items[0]]} />,
};

export const Empty: Story = {
  render: () => <ViewerHarness start={0} media={[]} />,
};
