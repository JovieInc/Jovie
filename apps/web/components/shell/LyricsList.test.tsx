import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LyricsList, type LyricsListLine } from './LyricsList';

const SAMPLE_LINES: readonly LyricsListLine[] = [
  { at: 6, text: 'Walking through the static of a city that forgets' },
  { at: 14, text: 'Every name it whispered, every promise that it kept' },
  { at: 26, text: 'I was lost in the light' },
];

describe('LyricsList', () => {
  it('renders the default title and a row per line', () => {
    render(<LyricsList lines={SAMPLE_LINES} />);
    expect(screen.getByText('Lyrics')).toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBe(3);
  });

  it('formats line times as m:ss', () => {
    render(<LyricsList lines={SAMPLE_LINES} />);
    expect(screen.getByText('0:06')).toBeInTheDocument();
    expect(screen.getByText('0:14')).toBeInTheDocument();
    expect(screen.getByText('0:26')).toBeInTheDocument();
  });

  it('hides the edit button when onEdit is omitted', () => {
    render(<LyricsList lines={SAMPLE_LINES} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('fires onEdit when the edit button is clicked', () => {
    const onEdit = vi.fn();
    render(<LyricsList lines={SAMPLE_LINES} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('fires onSeek with the line at-time when a row is clicked', () => {
    const onSeek = vi.fn();
    render(<LyricsList lines={SAMPLE_LINES} onSeek={onSeek} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: /Walking through the static/,
      })
    );
    expect(onSeek).toHaveBeenCalledWith(6);
  });

  it('disables rows when onSeek is omitted', () => {
    render(<LyricsList lines={SAMPLE_LINES} />);
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).toBeDisabled();
    }
  });

  it('uses a custom title and edit label when provided', () => {
    render(
      <LyricsList
        lines={SAMPLE_LINES}
        onEdit={() => undefined}
        title='Track lyrics'
        editLabel='Open editor'
      />
    );
    expect(screen.getByText('Track lyrics')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open editor' })
    ).toBeInTheDocument();
  });
});
