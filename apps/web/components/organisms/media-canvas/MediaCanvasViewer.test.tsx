import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMediaCanvasTransportSnapshot,
  mediaCanvasTransport,
  resetAudioChromeSnapshot,
} from '@/components/organisms/audio-chrome-state';
import { type MediaCanvasItem, MediaCanvasViewer } from './MediaCanvasViewer';

const pausePlaybackForInterruption = vi.fn();
const resumePlaybackAfterInterruption = vi.fn();

vi.mock(
  '@/components/organisms/release-sidebar/useTrackAudioPlayer',
  async importOriginal => {
    const mod =
      await importOriginal<
        typeof import('@/components/organisms/release-sidebar/useTrackAudioPlayer')
      >();
    return {
      ...mod,
      pausePlaybackForInterruption: () => pausePlaybackForInterruption(),
      resumePlaybackAfterInterruption: () => resumePlaybackAfterInterruption(),
    };
  }
);

const items: readonly MediaCanvasItem[] = [
  { kind: 'image', src: '/a.png', alt: 'First capture' },
  { kind: 'video', src: '/b.mp4', poster: '/b.jpg', alt: 'Walkthrough' },
  { kind: 'image', src: '/c.png', alt: 'Last capture' },
];

function Harness({ start }: { readonly start: number | null }) {
  const [index, setIndex] = useState<number | null>(start);
  return (
    <MediaCanvasViewer
      items={items}
      index={index}
      onIndexChange={setIndex}
      onClose={() => setIndex(null)}
    />
  );
}

describe('MediaCanvasViewer', () => {
  // jsdom lacks the native dialog API; restore it so mocks don't leak.
  const originalShowModal = HTMLDialogElement.prototype.showModal;
  const originalClose = HTMLDialogElement.prototype.close;

  beforeEach(() => {
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
  });

  afterEach(() => {
    HTMLDialogElement.prototype.showModal = originalShowModal;
    HTMLDialogElement.prototype.close = originalClose;
    resetAudioChromeSnapshot();
    pausePlaybackForInterruption.mockClear();
    resumePlaybackAfterInterruption.mockClear();
  });

  it('steps with arrow keys, clamps at both ends, and closes', () => {
    render(<Harness start={0} />);
    const dialog = screen.getByTestId('media-canvas-viewer');
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAccessibleName('First capture (1 of 3)');

    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(dialog).toHaveAccessibleName('First capture (1 of 3)');

    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(dialog).toHaveAccessibleName('Walkthrough (2 of 3)');
    expect(dialog.querySelector('video')).toHaveAttribute('src', '/b.mp4');

    // Arrow keys step items even when the video itself holds focus — the
    // dock is the transport, so the element has no native seeking.
    fireEvent.keyDown(dialog.querySelector('video') as HTMLVideoElement, {
      key: 'ArrowRight',
    });
    expect(dialog).toHaveAccessibleName('Last capture (3 of 3)');

    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(dialog).toHaveAccessibleName('Last capture (3 of 3)');

    fireEvent.click(screen.getByRole('button', { name: 'Show First capture' }));
    expect(dialog).toHaveAccessibleName('First capture (1 of 3)');

    fireEvent.click(screen.getByRole('button', { name: 'Close Viewer' }));
    expect(dialog).not.toHaveAttribute('open');
  });

  it('stays closed without an index', () => {
    render(<Harness start={null} />);
    expect(screen.getByTestId('media-canvas-viewer')).not.toHaveAttribute(
      'open'
    );
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
  });

  it('registers a dock transport while open and unregisters on close', () => {
    render(<Harness start={0} />);
    expect(getMediaCanvasTransportSnapshot()).toMatchObject({
      title: 'First capture',
      index: 0,
      count: 3,
      isVideo: false,
      hasNext: true,
      hasPrevious: false,
    });

    // Dock next/previous step through photo and video items alike.
    act(() => mediaCanvasTransport.next());
    expect(screen.getByTestId('media-canvas-viewer')).toHaveAccessibleName(
      'Walkthrough (2 of 3)'
    );
    expect(getMediaCanvasTransportSnapshot()).toMatchObject({
      index: 1,
      isVideo: true,
    });
    act(() => mediaCanvasTransport.previous());
    expect(getMediaCanvasTransportSnapshot()).toMatchObject({ index: 0 });

    fireEvent.click(screen.getByRole('button', { name: 'Close Viewer' }));
    expect(getMediaCanvasTransportSnapshot()).toBeNull();
  });

  it('drives the video through the transport and pauses the audio track', () => {
    // jsdom's `paused`/`ended` getters ignore dispatched events, so the
    // play/pause spies pin the property per-instance to keep sync() honest.
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(function (this: HTMLMediaElement) {
        Object.defineProperty(this, 'paused', {
          value: false,
          configurable: true,
        });
        this.dispatchEvent(new Event('play'));
        return Promise.resolve();
      });
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(function (this: HTMLMediaElement) {
        Object.defineProperty(this, 'paused', {
          value: true,
          configurable: true,
        });
        this.dispatchEvent(new Event('pause'));
      });
    try {
      render(<Harness start={1} />);
      const video = screen
        .getByTestId('media-canvas-viewer')
        .querySelector('video') as HTMLVideoElement;
      const transport = screen.getByTestId('media-canvas-transport');

      // Play via the dock-facing transport command → video plays and the
      // audio track takes an interruption hold (single playback owner).
      act(() => mediaCanvasTransport.toggle());
      expect(play).toHaveBeenCalled();
      expect(pausePlaybackForInterruption).toHaveBeenCalledTimes(1);
      expect(getMediaCanvasTransportSnapshot()?.isPlaying).toBe(true);

      // Pause via the in-canvas transport bar releases the hold.
      fireEvent.click(
        transport.querySelector('button[aria-label="Pause video"]') ??
          screen.getByRole('button', { name: 'Pause video' })
      );
      expect(pause).toHaveBeenCalled();
      expect(resumePlaybackAfterInterruption).toHaveBeenCalledTimes(1);
      expect(getMediaCanvasTransportSnapshot()?.isPlaying).toBe(false);
      expect(video.paused).toBe(true);
    } finally {
      play.mockRestore();
      pause.mockRestore();
    }
  });
});
