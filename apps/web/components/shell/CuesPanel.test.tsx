import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
    const header = screen.getByText('Cues');
    expect(header).toBeInTheDocument();
    expect(header.className).toContain('tracking-normal');
    expect(header.className).not.toMatch(/\buppercase\b/);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders a row for every cue', () => {
    render(<CuesPanel cues={SAMPLE_CUES} durationSec={213} />);
    expect(screen.getAllByRole('button').length).toBe(3);
    expect(screen.getAllByText('Intro')).toHaveLength(2);
    expect(screen.getAllByText('Chorus')).toHaveLength(2);
    expect(screen.getByText('Verse')).toBeInTheDocument();
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

  it('marks cues on the ribbon with the accent token, axe-clean', async () => {
    const { container } = render(
      <CuesPanel cues={SAMPLE_CUES} durationSec={213} onSeek={vi.fn()} />
    );
    const marks = container.querySelectorAll('span[style*="left"]');
    expect(marks).toHaveLength(3);
    for (const mark of marks) {
      expect(mark).toHaveClass('bg-accent/60');
      expect(mark.className).not.toMatch(/cyan/);
    }
    expect(screen.getByRole('button', { name: /Verse 1/ })).toHaveAttribute(
      'type',
      'button'
    );
    await expectNoA11yViolations(container);
  });

  it('renders disabled rows without a seek handler, axe-clean', async () => {
    const { container } = render(
      <CuesPanel cues={SAMPLE_CUES} durationSec={213} />
    );
    expect(screen.getAllByRole('button')[0]).toBeDisabled();
    await expectNoA11yViolations(container);
  });
});

describe('CuesPanel play glyph', () => {
  it('draws the play triangle through PlayIcon (JOV-12568)', () => {
    const source = readFileSync(resolve(__dirname, './CuesPanel.tsx'), 'utf8');

    expect(source).toContain('<PlayIcon');
    expect(source).toContain("from '@/components/atoms/PlayIcon'");
    expect(source).not.toContain('translate-x-px');
  });
});
