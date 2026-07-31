import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarketingSnapRail } from '@/components/marketing/MarketingSnapRail';

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

describe('MarketingSnapRail', () => {
  it('renders a snap horizon with prev/next controls and children', () => {
    render(
      <MarketingSnapRail
        ariaLabel='Outcome Showcase'
        previousLabel='Scroll Outcomes Left'
        nextLabel='Scroll Outcomes Right'
        scrollerTestId='artist-profile-outcomes-grid'
      >
        <article>Card one</article>
        <article>Card two</article>
      </MarketingSnapRail>
    );

    expect(screen.getByLabelText('Outcome Showcase')).toBeTruthy();
    expect(screen.getByTestId('artist-profile-outcomes-grid')).toBeTruthy();
    expect(
      screen.getAllByLabelText('Scroll Outcomes Left').length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByLabelText('Scroll Outcomes Right').length
    ).toBeGreaterThan(0);
    expect(screen.getByText('Card one')).toBeTruthy();
    expect(screen.getByText('Card two')).toBeTruthy();
  });

  it('scrolls the rail when next is activated', () => {
    render(
      <MarketingSnapRail
        ariaLabel='Cards'
        nextLabel='Next cards'
        scrollerTestId='rail-scroller'
      >
        <article>One</article>
      </MarketingSnapRail>
    );

    const scroller = screen.getByTestId('rail-scroller');
    const scrollBy = vi.fn();
    Object.defineProperty(scroller, 'clientWidth', {
      configurable: true,
      value: 400,
    });
    scroller.scrollBy = scrollBy as typeof scroller.scrollBy;

    fireEvent.click(screen.getAllByLabelText('Next cards')[0]!);

    expect(scrollBy).toHaveBeenCalledWith({
      left: 320,
      behavior: 'auto',
    });
  });
});
