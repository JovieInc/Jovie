import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LyricsView } from './LyricsView';

const lines = [
  { startSec: 6, text: 'I was sleeping in the back of the car' },
  { startSec: 18, text: 'Watching the highway turn into stars' },
  { startSec: 30, text: 'You were humming a tune I forgot' },
];

const baseProps = {
  track: { artist: 'Bahamas', title: 'Lost in the Light' },
  durationSec: 213,
  onSeek: () => {},
};

describe('LyricsView', () => {
  it('renders the lyrics list when lines are non-empty', () => {
    render(<LyricsView {...baseProps} currentTimeSec={20} lines={lines} />);
    expect(
      screen.getByText('I was sleeping in the back of the car')
    ).toBeInTheDocument();
  });

  it('focuses the lyrics entry point for empty and populated routes', () => {
    const { rerender } = render(
      <LyricsView {...baseProps} currentTimeSec={0} lines={[]} autoFocusView />
    );
    expect(screen.getByRole('region', { name: 'Lyrics' })).toHaveFocus();
    rerender(
      <LyricsView
        {...baseProps}
        currentTimeSec={0}
        lines={lines}
        autoFocusView
      />
    );
    expect(screen.getByRole('region', { name: 'Lyrics' })).toHaveFocus();
  });

  it('renders the empty state when lines is empty', () => {
    render(<LyricsView {...baseProps} currentTimeSec={0} lines={[]} />);
    expect(screen.getByText('No Lyrics Yet')).toBeInTheDocument();
  });

  it('shows the Transcribe button only when onTranscribe is provided', () => {
    const a = render(
      <LyricsView {...baseProps} currentTimeSec={0} lines={[]} />
    );
    expect(a.queryByText(/Transcribe with Jovie/)).toBeNull();
    a.unmount();

    const b = render(
      <LyricsView
        {...baseProps}
        currentTimeSec={0}
        lines={[]}
        onTranscribe={() => {}}
      />
    );
    expect(b.getByText(/Transcribe with Jovie/)).toBeInTheDocument();
  });
});

describe('JOV-5466 token retire', () => {
  it('does not keep retired --linear-app-* tokens', () => {
    const source = readFileSync(resolve(__dirname, './LyricsView.tsx'), 'utf8');
    expect(source).not.toMatch(/--linear-app-/);
  });

  it('keeps the empty-state heading bounded to two lines', () => {
    const source = readFileSync(resolve(__dirname, './LyricsView.tsx'), 'utf8');
    expect(source).toContain(
      'text-base font-display text-primary-token line-clamp-2'
    );
  });

  it('renders the empty-state primary CTA on canonical button tokens', () => {
    const source = readFileSync(resolve(__dirname, './LyricsView.tsx'), 'utf8');
    expect(source).not.toMatch(/bg-white|text-black/);
    expect(source).toContain('border-btn-primary bg-btn-primary');
    expect(source).toContain('text-btn-primary-foreground');
    expect(source).toContain(
      'hover:border-(--color-btn-primary-hover) hover:bg-(--color-btn-primary-hover)'
    );
  });

  it('fires the empty-state handlers from the PlainButton actions, axe-clean', async () => {
    const user = userEvent.setup();
    const onTranscribe = vi.fn();
    const onPaste = vi.fn();
    const { container } = render(
      <LyricsView
        {...baseProps}
        currentTimeSec={0}
        lines={[]}
        onTranscribe={onTranscribe}
        onPaste={onPaste}
      />
    );
    await expectNoA11yViolations(container);
    await user.click(
      screen.getByRole('button', { name: 'Transcribe with Jovie' })
    );
    await user.click(screen.getByRole('button', { name: 'Paste lyrics' }));
    expect(onTranscribe).toHaveBeenCalledOnce();
    expect(onPaste).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('button', { name: 'Paste lyrics' })
    ).toHaveAttribute('type', 'button');
  });

  it('has no axe violations with lyrics, and seeks from a line', async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    const { container } = render(
      <LyricsView
        {...baseProps}
        onSeek={onSeek}
        currentTimeSec={20}
        lines={lines}
      />
    );
    await expectNoA11yViolations(container);
    await user.click(screen.getByText('Watching the highway turn into stars'));
    expect(onSeek).toHaveBeenCalledWith(18);
  });
});
