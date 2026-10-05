import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMediaTransportSnapshot,
  resetMediaTransportSnapshot,
} from '@/components/organisms/audio-chrome-state';
import { MediaCanvasHost } from './MediaCanvasHost';
import { type MediaCanvasItem, MediaCanvasViewer } from './MediaCanvasViewer';
import { closeMediaCanvas, openMediaCanvas } from './media-canvas-state';

const { pauseTrackPlayback } = vi.hoisted(() => ({
  pauseTrackPlayback: vi.fn(),
}));

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  pauseTrackPlayback,
}));

const items: readonly MediaCanvasItem[] = [
  { kind: 'image', src: '/a.png', alt: 'First capture' },
  { kind: 'video', src: '/b.mp4', poster: '/b.jpg', alt: 'Walkthrough' },
  { kind: 'image', src: '/c.png', alt: 'Last capture' },
];

function Harness({
  start,
  media = items,
}: {
  readonly start: number | null;
  readonly media?: readonly MediaCanvasItem[];
}) {
  const [index, setIndex] = useState<number | null>(start);
  return (
    <MediaCanvasViewer
      items={media}
      index={index}
      onIndexChange={setIndex}
      onClose={() => setIndex(null)}
    />
  );
}

describe('MediaCanvasViewer', () => {
  // jsdom lacks the native dialog and media playback APIs.
  const originalShowModal = HTMLDialogElement.prototype.showModal;
  const originalClose = HTMLDialogElement.prototype.close;
  const originalPlay = HTMLMediaElement.prototype.play;
  const originalPause = HTMLMediaElement.prototype.pause;

  beforeEach(() => {
    pauseTrackPlayback.mockClear();
    closeMediaCanvas();
    resetMediaTransportSnapshot();
    HTMLDialogElement.prototype.showModal = vi.fn(function (
      this: HTMLDialogElement
    ) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (
      this: HTMLDialogElement
    ) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  afterEach(() => {
    closeMediaCanvas();
    resetMediaTransportSnapshot();
    HTMLDialogElement.prototype.showModal = originalShowModal;
    HTMLDialogElement.prototype.close = originalClose;
    HTMLMediaElement.prototype.play = originalPlay;
    HTMLMediaElement.prototype.pause = originalPause;
  });

  it('steps through every media kind with arrows and clamps at both ends', () => {
    render(<Harness start={0} />);
    const dialog = screen.getByTestId('media-canvas-viewer');
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAccessibleName('First capture (1 of 3)');

    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(dialog).toHaveAccessibleName('First capture (1 of 3)');

    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(dialog).toHaveAccessibleName('Walkthrough (2 of 3)');
    expect(dialog.querySelector('video')).toHaveAttribute('src', '/b.mp4');

    // Video seeking belongs to the dock now; arrows always browse the list.
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(dialog).toHaveAccessibleName('Last capture (3 of 3)');

    fireEvent.click(screen.getByRole('button', { name: 'Show First capture' }));
    expect(dialog).toHaveAccessibleName('First capture (1 of 3)');

    fireEvent.click(screen.getByRole('button', { name: 'Close Viewer' }));
    expect(dialog).not.toHaveAttribute('open');
  });

  it('publishes video playback, seek, and list controls to the shell dock', async () => {
    render(<Harness start={1} />);
    const video = screen.getByLabelText('Walkthrough') as HTMLVideoElement;
    expect(video).not.toHaveAttribute('controls');
    Object.defineProperty(video, 'duration', {
      configurable: true,
      value: 42,
    });
    video.currentTime = 5;

    fireEvent.loadedMetadata(video);
    fireEvent.playing(video);

    await waitFor(() => {
      expect(getMediaTransportSnapshot()?.status).toBe('playing');
    });
    expect(pauseTrackPlayback).toHaveBeenCalledOnce();

    act(() => getMediaTransportSnapshot()?.seek?.(12));
    expect(video.currentTime).toBe(12);

    act(() => getMediaTransportSnapshot()?.next());
    expect(screen.getByTestId('media-canvas-viewer')).toHaveAccessibleName(
      'Last capture (3 of 3)'
    );
  });

  it('exposes loading, error, and retry states for photos', async () => {
    render(<Harness start={0} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading media');
    const image = screen.getByRole('img', { name: 'First capture' });

    fireEvent.error(image);

    expect(await screen.findByTestId('media-canvas-error')).toBeInTheDocument();
    expect(getMediaTransportSnapshot()?.status).toBe('error');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.getByRole('img', { name: 'First capture' })).not.toBe(image);
    expect(screen.getByRole('status')).toHaveTextContent('Loading media');
  });

  it('renders an actionable empty state', () => {
    render(<Harness start={0} media={[]} />);

    expect(screen.getByTestId('media-canvas-viewer')).toHaveAttribute('open');
    expect(screen.getByTestId('media-canvas-empty')).toHaveTextContent(
      'No Media Yet'
    );
    expect(getMediaTransportSnapshot()).toBeNull();
  });

  it('opens a supplied list through the shell-level host API', () => {
    render(
      <>
        <button type='button' onClick={() => openMediaCanvas(items, 2)}>
          Open shared canvas
        </button>
        <MediaCanvasHost />
      </>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open shared canvas' }));

    expect(screen.getByTestId('media-canvas-viewer')).toHaveAccessibleName(
      'Last capture (3 of 3)'
    );
  });

  it('stays closed without an index', () => {
    render(<Harness start={null} />);
    expect(screen.getByTestId('media-canvas-viewer')).not.toHaveAttribute(
      'open'
    );
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
  });
});
