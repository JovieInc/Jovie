import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingEditorialHeroPhoto } from './MarketingEditorialHeroPhoto';

describe('MarketingEditorialHeroPhoto', () => {
  it('renders the decorative photo layer out of the accessibility tree', () => {
    const { container } = render(
      <MarketingEditorialHeroPhoto
        src='/images/hero/blog-index.webp'
        opacity={0.4}
        testId='editorial-hero-photo'
      />
    );

    const layer = container.querySelector(
      '[data-testid="editorial-hero-photo"]'
    );
    expect(layer).toHaveAttribute('aria-hidden', 'true');

    const img = layer?.querySelector('img');
    expect(img).toHaveAttribute('alt', '');
    expect(img?.getAttribute('src')).toContain('blog-index.webp');
    expect(img).toHaveStyle({ opacity: '0.4' });
  });

  it('renders a distinct image per route with the requested opacity', () => {
    const { container } = render(
      <MarketingEditorialHeroPhoto
        src='/images/hero/changelog-version.webp'
        opacity={0.22}
        testId='editorial-hero-photo'
      />
    );

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('changelog-version.webp');
    expect(img).toHaveStyle({ opacity: '0.22' });
  });
});
