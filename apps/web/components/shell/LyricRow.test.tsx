import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

describe('JOV-5466 token retire', () => {
  it('does not keep retired --linear-app-* tokens', () => {
    const source = readFileSync(resolve(__dirname, './LyricRow.tsx'), 'utf8');
    expect(source).not.toMatch(/--linear-app-/);
  });
});

describe('Ion accent polish (glm/lyrics-player)', () => {
  it('stamps selected/focused edit rows with the Ion accent, not raw cyan', () => {
    const source = readFileSync(resolve(__dirname, './LyricRow.tsx'), 'utf8');
    expect(source).not.toMatch(/cyan-/);
    expect(source).toContain('data-[selected]:bg-accent/[0.06]');
    expect(source).toContain('data-[selected]:before:bg-accent/85');
    expect(source).toContain(
      'bg-accent/15 text-accent border border-accent/30'
    );
  });

  it('keeps lyric line rhythm on the canonical leading scale', () => {
    const source = readFileSync(resolve(__dirname, './LyricRow.tsx'), 'utf8');
    expect(source).not.toMatch(/leading-\[/);
    expect(source).toContain('text-3xl leading-tight font-display');
    expect(source).toContain('text-xl leading-snug font-display');
  });

  it('seeks from a focus-ringed button in display mode', () => {
    render(<LyricRow {...baseProps} />);
    const button = screen.getByText(
      'You were humming a tune I forgot'
    ) as HTMLButtonElement;
    expect(button.tagName).toBe('BUTTON');
    expect(button.className).toContain('focus-visible:ring-ring/55');
  });
});

describe('LyricRow contrast (JOV-8873)', () => {
  it('renders inactive lines with the secondary token at full opacity', () => {
    render(<LyricRow {...baseProps} />);
    const button = screen.getByText('You were humming a tune I forgot');
    expect(button).toHaveClass('text-secondary-token');
    expect(button).not.toHaveClass('opacity-60');
  });
});
