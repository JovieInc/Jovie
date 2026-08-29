import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingSectionFrame } from './MarketingSectionFrame';

describe('MarketingSectionFrame', () => {
  it('renders children in the canonical landing-width section frame', () => {
    const { container } = render(
      <MarketingSectionFrame>
        <h2>Release control</h2>
      </MarketingSectionFrame>
    );

    const section = container.querySelector('section');
    expect(section).toHaveClass('section-spacing-linear');
    expect(section?.querySelector('.mx-auto')).toHaveClass(
      'w-full',
      'max-w-public-content'
    );
    expect(
      screen.getByRole('heading', { name: 'Release control' })
    ).toBeInTheDocument();
  });

  it('renders the optional eyebrow and reverses the intro layout when requested', () => {
    const { container } = render(
      <MarketingSectionFrame
        eyebrow='Artist profiles'
        reverse
        className='section-frame-hook'
      >
        <p>Show the next useful action.</p>
      </MarketingSectionFrame>
    );

    const section = container.querySelector('section');
    expect(section).toHaveClass('section-frame-hook');
    expect(screen.getByText('Artist profiles')).toHaveClass(
      'homepage-section-eyebrow'
    );
    expect(section?.querySelector('.homepage-section-intro')).toHaveClass(
      'md:flex',
      'md:flex-row-reverse'
    );
  });

  it('does not leave an eyebrow footprint when no eyebrow is supplied', () => {
    const { container } = render(
      <MarketingSectionFrame>
        <p>Copy-only section.</p>
      </MarketingSectionFrame>
    );

    expect(container.querySelector('.homepage-section-eyebrow')).toBeNull();
  });
});
