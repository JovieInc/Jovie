import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  STATUS_GLYPH_STATE_SPECS,
  STATUS_GLYPH_STATES,
  StatusGlyph,
  type StatusGlyphFill,
  type StatusGlyphState,
} from './status-glyph';

const EXPECTED_FILL: Record<StatusGlyphState, StatusGlyphFill> = {
  todo: 'empty',
  in_progress: 'half',
  in_review: 'three-quarter',
  done: 'check',
  canceled: 'x',
  blocked: 'empty',
  warning: 'full',
  success: 'check',
  error: 'x',
};

describe('StatusGlyph', () => {
  it('covers every declared state in the spec map', () => {
    expect(Object.keys(STATUS_GLYPH_STATE_SPECS).sort()).toEqual(
      [...STATUS_GLYPH_STATES].sort()
    );
  });

  it.each(STATUS_GLYPH_STATES)(
    'renders the correct glyph for state "%s"',
    state => {
      const { container } = render(<StatusGlyph state={state} />);
      const glyph = container.querySelector('[data-status-glyph]');
      expect(glyph).not.toBeNull();
      expect(glyph?.getAttribute('data-status-glyph')).toBe(state);
      expect(container.querySelector('svg')?.getAttribute('data-fill')).toBe(
        EXPECTED_FILL[state]
      );
    }
  );

  it.each(STATUS_GLYPH_STATES)(
    'exposes an aria-label for state "%s"',
    state => {
      render(<StatusGlyph state={state} />);
      const el = screen.getByRole('img');
      expect(el.getAttribute('aria-label') ?? '').not.toEqual('');
    }
  );

  it('renders no visible status word unless label is passed', () => {
    for (const state of STATUS_GLYPH_STATES) {
      const { container, unmount } = render(<StatusGlyph state={state} />);
      expect(container.textContent ?? '').toEqual('');
      unmount();
    }
  });

  it('renders the label as visible text when passed', () => {
    render(<StatusGlyph state='done' label='Live' />);
    expect(screen.getByText('Live')).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Live');
  });

  it('keeps red and green tones reserved for error and success', () => {
    for (const state of STATUS_GLYPH_STATES) {
      const tone = STATUS_GLYPH_STATE_SPECS[state].tone;
      if (state === 'error' || state === 'success') continue;
      expect(tone).not.toContain('error');
      expect(tone).not.toContain('success');
    }
    expect(STATUS_GLYPH_STATE_SPECS.error.tone).toContain('error');
    expect(STATUS_GLYPH_STATE_SPECS.success.tone).toContain('success');
  });
});
