import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MediaTransportSnapshot } from '@/components/organisms/audio-chrome-state';
import { MediaCanvasTransport } from './MediaCanvasTransport';

function transport(
  overrides: Partial<MediaTransportSnapshot> = {}
): MediaTransportSnapshot {
  return {
    ownerId: 'canvas-test',
    itemId: 'video:/walkthrough.mp4',
    kind: 'video',
    label: 'Walkthrough',
    index: 1,
    itemCount: 3,
    status: 'paused',
    currentTime: 12,
    duration: 60,
    hasPrevious: true,
    hasNext: true,
    togglePlayback: vi.fn(),
    seek: vi.fn(),
    previous: vi.fn(),
    next: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

describe('MediaCanvasTransport', () => {
  it('drives video playback, seeking, and list navigation', () => {
    const snapshot = transport();
    render(<MediaCanvasTransport transport={snapshot} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Seek Track' }), {
      target: { value: '24' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next media item' }));

    expect(snapshot.togglePlayback).toHaveBeenCalledOnce();
    expect(snapshot.seek).toHaveBeenCalledWith(24);
    expect(snapshot.next).toHaveBeenCalledOnce();
    expect(screen.getByText('0:12')).toBeInTheDocument();
    expect(screen.getByText('1:00')).toBeInTheDocument();
  });

  it('disables playback and seeking for a photo while keeping navigation active', () => {
    const snapshot = transport({
      kind: 'image',
      status: 'ready',
      currentTime: 0,
      duration: 0,
      hasPrevious: false,
    });
    render(<MediaCanvasTransport transport={snapshot} />);

    expect(screen.getByTestId('media-canvas-transport')).toHaveAttribute(
      'data-state',
      'disabled'
    );
    expect(screen.getByRole('button', { name: 'Play video' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Seek Track' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Previous media item' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Next media item' })
    ).toBeEnabled();
  });
});
