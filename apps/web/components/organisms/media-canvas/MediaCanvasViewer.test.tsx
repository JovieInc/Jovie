import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type MediaCanvasItem, MediaCanvasViewer } from './MediaCanvasViewer';

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

    // A focused video keeps its own arrow-key seeking.
    fireEvent.keyDown(dialog.querySelector('video') as HTMLVideoElement, {
      key: 'ArrowRight',
    });
    expect(dialog).toHaveAccessibleName('Walkthrough (2 of 3)');

    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
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
});
