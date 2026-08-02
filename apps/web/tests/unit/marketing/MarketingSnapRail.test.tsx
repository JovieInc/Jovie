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
    Object.defineProperty(scroller, 'scrollWidth', {
      configurable: true,
      value: 800,
    });
    scroller.scrollBy = scrollBy as typeof scroller.scrollBy;
    fireEvent(window, new Event('resize'));

    const previousButton = screen.getAllByLabelText('Scroll Left')[0]!;
    const nextButton = screen.getAllByLabelText('Next cards')[0]!;
    expect(previousButton).toBeDisabled();
    expect(nextButton).toBeEnabled();

    fireEvent.click(nextButton);

    expect(scrollBy).toHaveBeenCalledWith({
      left: 320,
      behavior: 'auto',
    });

    Object.defineProperty(scroller, 'scrollLeft', {
      configurable: true,
      value: 400,
    });
    fireEvent.scroll(scroller);

    expect(previousButton).toBeEnabled();
    expect(nextButton).toBeDisabled();
  });

  it('exposes visible compact controls below desktop when requested', () => {
    render(
      <MarketingSnapRail
        ariaLabel='Adaptive Profile Comparison'
        nextLabel='Show Next Profile State'
        previousLabel='Show Previous Profile State'
        showMobileControls
        showDesktopControls={false}
      >
        <article>Profile state</article>
      </MarketingSnapRail>
    );

    expect(
      screen.getAllByLabelText('Show Previous Profile State')
    ).toHaveLength(1);
    expect(screen.getAllByLabelText('Show Next Profile State')).toHaveLength(1);
    expect(
      screen
        .getByLabelText('Show Next Profile State')
        ?.closest('.marketing-snap-rail__mobile-controls')
    ).toHaveClass('md:hidden');
  });
});
