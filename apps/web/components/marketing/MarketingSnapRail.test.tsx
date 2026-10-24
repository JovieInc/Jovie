import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { MarketingSnapRail } from './MarketingSnapRail';

vi.mock('@/lib/hooks/useReducedMotion', () => ({ useReducedMotion: vi.fn() }));

describe('MarketingSnapRail controls', () => {
  it.each([true, false])(
    'keeps glass controls and scroll boundaries usable with reduced motion %s',
    reducedMotion => {
      vi.mocked(useReducedMotion).mockReturnValue(reducedMotion);
      render(
        <MarketingSnapRail
          ariaLabel='Profile previews'
          showDesktopControls={false}
          showMobileControls
        >
          <article>First profile</article>
          <article>Second profile</article>
        </MarketingSnapRail>
      );
      const rail = screen.getByRole('region', { name: 'Profile previews' });
      const scrollBy = vi.fn();
      Object.defineProperties(rail, {
        clientWidth: { value: 400 },
        scrollWidth: { value: 1000 },
        scrollLeft: { value: 0, writable: true },
        scrollBy: { value: scrollBy },
      });
      fireEvent.resize(window);
      const previous = screen.getByRole('button', { name: 'Scroll Left' });
      const next = screen.getByRole('button', { name: 'Scroll Right' });
      expect(previous).toBeDisabled();
      expect(next).toBeEnabled();
      expect(next).toHaveAttribute('aria-controls', rail.id);
      expect(next).toHaveClass('ds-glass');
      fireEvent.click(next);
      expect(scrollBy).toHaveBeenCalledWith({
        left: 320,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
      rail.scrollLeft = 600;
      fireEvent.scroll(rail);
      expect(next).toBeDisabled();
      expect(previous).toBeEnabled();
      expect(previous).toHaveClass('ds-glass');
      fireEvent.click(previous);
      expect(scrollBy).toHaveBeenLastCalledWith({
        left: -320,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    }
  );
});
