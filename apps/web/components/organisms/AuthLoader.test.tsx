import { JOVIE_O_CSS } from '@jovie/ui/brand/jovie-o-motion';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAND_MARK_MUTED_CLASS } from '@/lib/brand/tokens';
import {
  inspectLoadingOwners,
  loadingOwnerIssueCodes,
} from '@/tests/utils/loading-owner';

import { AuthLoader } from './AuthLoader';

const LOADING_MESSAGE_DELAY_MS = 2000;

function layoutBearingSignature(container: HTMLElement): string {
  return Array.from(container.querySelectorAll('*'))
    .map(element =>
      [
        element.tagName,
        element.getAttribute('role') ?? '',
        element.getAttribute('data-testid') ?? '',
        (element.getAttribute('class') ?? '').replace(/opacity-\d+/g, ''),
      ].join('|')
    )
    .join('\n');
}

describe('AuthLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes exactly one polite busy loading owner', () => {
    const { container } = render(<AuthLoader />);
    const owner = screen.getByRole('status', { name: 'Loading' });

    expect(owner).toHaveAttribute('aria-busy', 'true');
    expect(owner).toHaveAttribute('aria-live', 'polite');
    expect(owner).toHaveAttribute('data-testid', 'auth-loader');
    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([]);
    expect(owner.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('keeps the delayed visual message in layout and only changes opacity', () => {
    const { container } = render(<AuthLoader />);
    const message = container.querySelector('p');

    expect(message).toHaveClass(
      'text-xs',
      'text-tertiary-token',
      'transition-opacity',
      'duration-subtle',
      'opacity-0'
    );
    expect(message).toHaveTextContent('Loading...');

    const before = layoutBearingSignature(container);

    act(() => {
      vi.advanceTimersByTime(LOADING_MESSAGE_DELAY_MS);
    });

    expect(message).toHaveClass('opacity-100');
    expect(message).not.toHaveClass('opacity-0');
    expect(layoutBearingSignature(container)).toEqual(before);
    expect(container.querySelectorAll('*')).toHaveLength(
      before.split('\n').length
    );
    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([]);
  });

  describe('muted mark (ovie-o-presence slice 2)', () => {
    it('draws exactly one decorative O in the muted value for both themes', () => {
      const { container } = render(<AuthLoader />);
      const marks = container.querySelectorAll('svg.jovie-o');

      expect(marks).toHaveLength(1);
      const mark = marks[0];
      expect(mark).toHaveAttribute('aria-hidden', 'true');
      expect(mark).toHaveAttribute('height', '24');
      expect(mark).toHaveClass('text-logo-muted', 'dark:text-quaternary-token');
      expect(BRAND_MARK_MUTED_CLASS).toBe(
        'text-logo-muted dark:text-quaternary-token'
      );
      // No color: no accent, spark or glow classes.
      expect(container.innerHTML).not.toMatch(
        /electric|spark|text-accent|bg-accent|blur/i
      );
    });

    it('turns while loading, then holds still after three turns (3.75 s)', () => {
      const { container } = render(<AuthLoader />);
      const mark = container.querySelector('svg.jovie-o');

      expect(mark).toHaveAttribute('data-jo-state', 'loading');
      act(() => {
        vi.advanceTimersByTime(3749);
      });
      expect(mark).toHaveAttribute('data-jo-state', 'loading');
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(mark).toHaveAttribute('data-jo-state', 'idle');
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(mark).toHaveAttribute('data-jo-state', 'idle');
    });

    it('moves only transform, and reduced motion leaves no running animation', () => {
      render(<AuthLoader />);
      const turnRule = JOVIE_O_CSS.match(
        /\[data-jo-state=loading\] \.jo-turn\{[^}]*\}/
      )?.[0];
      expect(turnRule).toContain('jo-turn');
      expect(JOVIE_O_CSS).toMatch(/@keyframes jo-turn\{to\{transform:rotate/);
      const reduced = JOVIE_O_CSS.slice(JOVIE_O_CSS.indexOf('@media'));
      expect(reduced).toContain('prefers-reduced-motion:reduce');
      expect(reduced).toContain('animation:none!important');
    });
  });
});
