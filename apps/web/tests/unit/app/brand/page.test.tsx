import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BrandPage from '@/app/brand/page';

describe('app/brand/page', () => {
  it('renders the hero headline and CTA pair', () => {
    render(<BrandPage />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /One mark\. Any surface\./,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Download brand kit/ })
    ).toHaveAttribute('href', '#downloads');
    expect(
      screen.getByRole('link', { name: /View guidelines/ })
    ).toHaveAttribute('href', '#mark');
  });

  it('renders all 9 anchored sections in order', () => {
    const { container } = render(<BrandPage />);
    const expectedIds = [
      'hero',
      'mark',
      'wordmark',
      'lockups',
      'usage',
      'color',
      'type',
      'icons',
      'downloads',
    ];
    const sectionIds = Array.from(
      container.querySelectorAll('section[id]')
    ).map(s => s.id);
    expect(sectionIds).toEqual(expectedIds);
  });

  it('renders the brand@jov.ie contact line', () => {
    render(<BrandPage />);
    const mailto = screen.getByRole('link', { name: 'brand@jov.ie' });
    expect(mailto).toHaveAttribute('href', 'mailto:brand@jov.ie');
  });

  it('renders downloadable static asset links (no client-side PNG generation)', () => {
    const { container } = render(<BrandPage />);
    const downloadLinks = Array.from(
      container.querySelectorAll('section#downloads a[download]')
    );
    expect(downloadLinks.length).toBeGreaterThanOrEqual(5);
    for (const link of downloadLinks) {
      const href = link.getAttribute('href') ?? '';
      // Every download must resolve to a real static asset URL — never a
      // /api/ generator route or a blob: URL, both of which signal the canvas
      // SVG-to-PNG bug we explicitly avoided.
      expect(href.startsWith('/')).toBe(true);
      expect(href.startsWith('/api/')).toBe(false);
    }
  });

  it('emits JSON-LD structured data', () => {
    const { container } = render(<BrandPage />);
    const ldScript = container.querySelector(
      'script[type="application/ld+json"]'
    );
    expect(ldScript).not.toBeNull();
    expect(ldScript?.textContent).toContain('"@type":"WebPage"');
    expect(ldScript?.textContent).toContain('"Brand · Jovie"');
  });
});
