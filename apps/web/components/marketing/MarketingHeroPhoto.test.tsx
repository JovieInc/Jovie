import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingHeroPhoto } from './MarketingHeroPhoto';

describe('MarketingHeroPhoto', () => {
  it('renders a decorative photo behind a legibility scrim', () => {
    const { container } = render(
      <MarketingHeroPhoto
        src='/images/marketing-hero/ai.webp'
        width={1600}
        height={1067}
        opacity={0.2}
      />
    );

    const wrapper = container.querySelector('.marketing-hero-photo');
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveStyle({ opacity: '0.2' });
    expect(
      container.querySelector('.marketing-hero-photo__scrim')
    ).toBeInTheDocument();
  });

  it('defaults to full strength', () => {
    const { container } = render(
      <MarketingHeroPhoto
        src='/images/marketing-hero/product.webp'
        width={1600}
        height={901}
      />
    );

    expect(container.querySelector('img')).toHaveStyle({ opacity: '1' });
  });
});
