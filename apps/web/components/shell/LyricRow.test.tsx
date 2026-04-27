import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LyricRow } from './LyricRow';

const baseProps = {
  line: { startSec: 30, text: 'You were humming a tune I forgot' },
  index: 2,
  isFocused: false,
  isActive: false,
  editing: false,
  onFocus: () => {},
  onSeek: () => {},
  onStamp: () => {},
  onChangeText: () => {},
};

describe('LyricRow', () => {
  it('renders the line text in display mode', () => {
    render(<LyricRow {...baseProps} />);
    expect(
      screen.getByText('You were humming a tune I forgot')
    ).toBeInTheDocument();
  });

  it('seeks on click in display mode', () => {
    const onSeek = vi.fn();
    render(<LyricRow {...baseProps} onSeek={onSeek} />);
    fireEvent.click(screen.getByText('You were humming a tune I forgot'));
    expect(onSeek).toHaveBeenCalledOnce();
  });

  it('renders an editable input in edit mode with the time stamp', () => {
    render(<LyricRow {...baseProps} editing />);
    const input = screen.getByLabelText('Lyric line 3') as HTMLInputElement;
    expect(input.value).toBe('You were humming a tune I forgot');
    expect(screen.getByTitle(/Stamp this line/)).toBeInTheDocument();
    expect(screen.getByText('0:30')).toBeInTheDocument();
  });

  it('calls onStamp when the time-stamp button is clicked in edit mode', () => {
    const onStamp = vi.fn();
    render(<LyricRow {...baseProps} editing onStamp={onStamp} />);
    fireEvent.click(screen.getByTitle(/Stamp this line/));
    expect(onStamp).toHaveBeenCalledOnce();
  });
});
