import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH } from '@/data/marketing/penContracts';
import { MarketingSectionFrame } from './MarketingSectionFrame';

describe('MarketingSectionFrame', () => {
  it('wraps children in a landing-width Linear section without an eyebrow', () => {
    const { container } = render(
      <MarketingSectionFrame className='feature-split'>
        <p>section body</p>
      </MarketingSectionFrame>
    );

    const section = container.firstElementChild;
    expect(section?.tagName).toBe('SECTION');
    expect(section).toHaveClass('section-spacing-linear', 'feature-split');
    expect(screen.getByText('section body').parentElement).toHaveClass(
      'homepage-section-intro'
    );
    expect(
      section?.querySelector(
        `[data-pen-contract="${MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH.landing}"]`
      )
    ).toBeTruthy();
    expect(screen.queryByText('Inside Jovie')).not.toBeInTheDocument();
  });

  it('renders a left-aligned eyebrow above the section intro', () => {
    render(
      <MarketingSectionFrame eyebrow='Inside Jovie'>
        <p>connected release work</p>
      </MarketingSectionFrame>
    );

    const eyebrow = screen.getByText('Inside Jovie');
    expect(eyebrow).toHaveClass('homepage-section-eyebrow');
    expect(eyebrow.parentElement).not.toHaveClass('md:text-right');
  });

  it('reverses the landing grid and right-aligns the eyebrow', () => {
    render(
      <MarketingSectionFrame eyebrow='The platform' reverse>
        <p>copy column</p>
        <p>media column</p>
      </MarketingSectionFrame>
    );

    const eyebrow = screen.getByText('The platform');
    expect(eyebrow.parentElement).toHaveClass('md:text-right');
    expect(screen.getByText('copy column').parentElement).toHaveClass(
      'md:flex',
      'md:flex-row-reverse'
    );
  });
});
