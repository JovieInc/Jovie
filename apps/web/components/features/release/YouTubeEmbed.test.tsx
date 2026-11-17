import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { YouTubeEmbed } from './YouTubeEmbed';

// jsdom never fetches iframe documents, so no YouTube content loads here;
// the frame's load event is fired by hand.
// axe audits the iframe element (its title included) but not its document.
const NO_FRAME_DOCUMENTS = { iframes: false } as const;
const skeleton = (container: HTMLElement) =>
  container.querySelector('.animate-pulse');

describe('YouTubeEmbed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows the on-media skeleton until the privacy-enhanced frame loads', async () => {
    const { container } = render(
      <YouTubeEmbed videoId='abc123' title='Music video preview' />
    );
    const frame = screen.getByTitle('Music video preview');
    expect(frame).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/abc123'
    );
    expect(frame).toHaveAttribute('loading', 'eager');
    expect(skeleton(container)).toHaveClass('bg-on-media/[0.05]');
    vi.useRealTimers();
    await expectNoA11yViolations(container, NO_FRAME_DOCUMENTS);

    fireEvent.load(frame);
    expect(skeleton(container)).toBeNull();
    await expectNoA11yViolations(container, NO_FRAME_DOCUMENTS);
  });

  it('reports a frame that never loads within eight seconds', () => {
    const onError = vi.fn();
    render(<YouTubeEmbed videoId='abc123' title='Video' onError={onError} />);
    act(() => {
      vi.advanceTimersByTime(7_999);
    });
    expect(onError).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onError).toHaveBeenCalledOnce();
  });

  it('does not report a frame that loaded in time', () => {
    const onError = vi.fn();
    render(<YouTubeEmbed videoId='abc123' title='Video' onError={onError} />);
    fireEvent.load(screen.getByTitle('Video'));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('shows the skeleton again and restarts the timeout for a new video', () => {
    const onError = vi.fn();
    const { container, rerender } = render(
      <YouTubeEmbed videoId='first' title='Video' onError={onError} />
    );
    fireEvent.load(screen.getByTitle('Video'));
    expect(skeleton(container)).toBeNull();

    rerender(<YouTubeEmbed videoId='second' title='Video' onError={onError} />);
    expect(skeleton(container)).not.toBeNull();
    expect(screen.getByTitle('Video')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/second'
    );
    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    expect(onError).toHaveBeenCalledOnce();
  });

  it('keeps its accessible name in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <YouTubeEmbed
          videoId='abc123'
          title='معاينة الفيديو الموسيقي'
          className='mt-4'
        />
      </div>
    );
    expect(screen.getByTitle('معاينة الفيديو الموسيقي')).toBeInTheDocument();
    expect(container.querySelector('.aspect-video')).toHaveClass('mt-4');
    vi.useRealTimers();
    await expectNoA11yViolations(container, NO_FRAME_DOCUMENTS);
  });
});
