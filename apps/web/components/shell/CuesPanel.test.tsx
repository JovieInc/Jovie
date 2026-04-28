import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CuesPanel } from './CuesPanel';
import type { Cue } from './cues.types';

const SAMPLE_CUES: readonly Cue[] = [
  { at: 0, kind: 'intro', label: 'Intro' },
  { at: 32, kind: 'verse', label: 'Verse 1' },
  { at: 84, kind: 'chorus', label: 'Chorus' },
];

describe('CuesPanel', () => {
  it('renders the title and cue count', () => {
    render(<CuesPanel cues={SAMPLE_CUES} durationSec={213} />);
    expect(screen.getByText('Cues')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders a row for every cue', () => {
    render(<CuesPanel cues={SAMPLE_CUES} durationSec={213} />);
    expect(screen.getAllByRole('button').length).toBe(3);
    expect(screen.getByText('Intro')).toBeInTheDocument();
    expect(screen.getByText('Chorus')).toBeInTheDocument();
  });

  it('formats cue times as m:ss', () => {
    render(<CuesPanel cues={SAMPLE_CUES} durationSec={213} />);
    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getByText('0:32')).toBeInTheDocument();
    expect(screen.getByText('1:24')).toBeInTheDocument();
  });

  it('fires onSeek with the cue time when a row is clicked', () => {
    const onSeek = vi.fn();
    render(<CuesPanel cues={SAMPLE_CUES} durationSec={213} onSeek={onSeek} />);
    fireEvent.click(screen.getByRole('button', { name: /Verse 1/ }));
    expect(onSeek).toHaveBeenCalledWith(32);
  });

  it('disables rows when no onSeek is supplied', () => {
    render(<CuesPanel cues={SAMPLE_CUES} durationSec={213} />);
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).toBeDisabled();
    }
  });

  it('uses a custom title when provided', () => {
    render(<CuesPanel cues={SAMPLE_CUES} durationSec={213} title='Sections' />);
    expect(screen.getByText('Sections')).toBeInTheDocument();
  });
});
